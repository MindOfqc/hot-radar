#!/usr/bin/env node
/**
 * 每日热榜快照生成器
 * 抓取各平台热榜,写入 public/data/snapshot.json。
 * 优先直连可公开访问的上游;失败时回退 60s 聚合接口。
 * 任一源失败时保留上次快照,保证九榜都有兜底数据。
 * 封面图下载压缩到 public/covers/<boardId>/,只保留最终快照引用的文件。
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'snapshot.json');
const COVERS_DIR = join(ROOT, 'public', 'covers');
const COVER_PREFIX = 'covers/';
const COVER_SIZE = 120;
const COVER_QUALITY = 72;
const IMAGE_CONCURRENCY = 4;
const IMAGE_TIMEOUT = 15_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const API_60S = 'https://60s.viki.moe/v2/';
const TIMEOUT = 25_000;
const RETRY_DELAY = 1_200;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeUrl(raw) {
  if (!raw) return undefined;
  try {
    const url = new URL(String(raw).replace(/&amp;/g, '&'));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/* ---------- 封面图本地化 ----------
 * 上游封面多带签名/过期参数(抖音约 5 小时失效),必须下载到本地并改写为
 * 相对路径 "covers/<boardId>/<hash>.jpg";下载失败直接置空,不保留会过期的链接。 */

function createLimiter(max) {
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= max || queue.length === 0) return;
    active += 1;
    const { task, resolve: done, reject } = queue.shift();
    task()
      .then(done, reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  };
  return (task) =>
    new Promise((resolveTask, rejectTask) => {
      queue.push({ task, resolve: resolveTask, reject: rejectTask });
      pump();
    });
}

const limitImage = createLimiter(IMAGE_CONCURRENCY);

/** 旧条目/已落地的 "covers/..." 相对路径 -> public/covers 下的绝对路径 */
function localCoverPath(cover) {
  if (typeof cover !== 'string' || !cover.startsWith(COVER_PREFIX)) return undefined;
  const rel = cover.slice(COVER_PREFIX.length);
  if (!rel || rel.includes('..') || rel.startsWith('/') || rel.startsWith('\\')) return undefined;
  return join(COVERS_DIR, rel);
}

/** 本地封面仍存在且非空时返回原相对路径,否则 undefined */
async function usableLocalCover(cover) {
  const path = localCoverPath(cover);
  if (!path) return undefined;
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0 ? cover : undefined;
  } catch {
    return undefined;
  }
}

function coverHash(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

/** 部分站点的图片接口需要匹配来源页 Referer,避免直接 403 */
const IMAGE_REFERERS = [
  ['douyinpic.com', 'https://www.douyin.com/'],
  ['douyin.com', 'https://www.douyin.com/'],
  ['toutiaoimg.com', 'https://www.toutiao.com/'],
  ['toutiao.com', 'https://www.toutiao.com/'],
  ['zhimg.com', 'https://www.zhihu.com/'],
  ['tiebapic.baidu.com', 'https://tieba.baidu.com/'],
  ['bcebos.com', 'https://top.baidu.com/'],
  ['baidu.com', 'https://www.baidu.com/'],
  ['hdslb.com', 'https://www.bilibili.com/'],
  ['sinaimg.cn', 'https://weibo.com/'],
];

function imageReferer(url) {
  const host = new URL(url).hostname;
  for (const [suffix, referer] of IMAGE_REFERERS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return referer;
  }
  return undefined;
}

/** 单图 15s 超时、原始响应上限 8MB */
async function downloadImageOnce(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IMAGE_TIMEOUT);
  try {
    const referer = imageReferer(url);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      throw new Error('图片超过 8MB');
    }
    if (!res.body) throw new Error('响应无内容');
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.byteLength;
      if (total > MAX_IMAGE_BYTES) throw new Error('图片超过 8MB');
      chunks.push(chunk);
    }
    if (total === 0) throw new Error('响应无内容');
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

/** 网络抖动时重试一次,减少单张封面偶发超时导致的破图 */
async function downloadImage(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await downloadImageOnce(url);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await sleep(600);
    }
  }
  throw lastError;
}

/** 下载 + 压缩为 120x120 JPEG(q72),返回写入后的相对路径 */
async function saveCoverImage(url, boardId) {
  const buffer = await downloadImage(url);
  const dir = join(COVERS_DIR, boardId);
  await mkdir(dir, { recursive: true });
  const name = `${coverHash(url)}.jpg`;
  await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(COVER_SIZE, COVER_SIZE, { fit: 'cover' })
    .jpeg({ quality: COVER_QUALITY })
    .toFile(join(dir, name));
  return `${COVER_PREFIX}${boardId}/${name}`;
}

/** 新抓取条目的 http(s) 封面 -> 本地文件;失败置 undefined */
async function localizeFetchedCovers(boards, boardIds) {
  const tasks = [];
  for (const boardId of boardIds) {
    for (const item of boards[boardId] ?? []) {
      if (typeof item.cover === 'string' && /^https?:/i.test(item.cover)) {
        tasks.push({ boardId, item, url: item.cover });
      } else {
        item.cover = undefined;
      }
    }
  }
  const cache = new Map();
  let failed = 0;
  let saved = 0;
  await Promise.all(
    tasks.map(async ({ boardId, item, url }) => {
      const key = `${boardId}\n${url}`;
      if (!cache.has(key)) {
        cache.set(
          key,
          limitImage(async () => {
            try {
              const path = await saveCoverImage(url, boardId);
              saved += 1;
              return path;
            } catch (error) {
              failed += 1;
              console.warn(`  - 封面下载失败 ${boardId}: ${error.message} · ${url.slice(0, 80)}`);
              return undefined;
            }
          }),
        );
      }
      item.cover = await cache.get(key);
    }),
  );
  return { total: tasks.length, saved, failed };
}

/** 修剪 public/covers:只保留最终快照引用的文件,并删除空目录 */
async function pruneCovers(boards) {
  const keep = new Set();
  for (const items of Object.values(boards)) {
    for (const item of items) {
      const path = localCoverPath(item.cover);
      if (path) keep.add(resolve(path));
    }
  }
  let removed = 0;
  let kept = 0;
  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    let files = 0;
    for (const entry of entries) {
      const path = resolve(join(dir, entry.name));
      if (entry.isDirectory()) {
        const inner = await walk(path);
        if (inner === 0) await rm(path, { recursive: true, force: true });
        files += inner;
      } else if (entry.isFile()) {
        if (keep.has(path)) {
          kept += 1;
          files += 1;
        } else {
          await unlink(path).catch(() => {});
          removed += 1;
        }
      }
    }
    return files;
  };
  await walk(COVERS_DIR);
  return { removed, kept };
}

/** 把 "293万" / "43.2w" / "2412 万热度" 这类热度文案解析回数值 */
function parseHeatText(text) {
  if (!text) return undefined;
  const m = String(text).trim().match(/([\d.]+)\s*(万|w)?/i);
  if (!m) return undefined;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return undefined;
  return m[2] ? Math.round(num * 10_000) : Math.round(num);
}

function formatHeat(value) {
  if (value == null || Number.isNaN(value)) return undefined;
  if (value >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}万`;
  return String(value);
}

async function fetchText(url, headers = {}, timeout = TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, headers = {}, timeout = TIMEOUT) {
  const text = await fetchText(url, headers, timeout);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('响应不是 JSON');
  }
}

async function fetch60s(path, id) {
  const json = await getJson(API_60S + path, { Accept: 'application/json' });
  if (json.code !== 200 || !Array.isArray(json.data)) {
    throw new Error(`60s API code=${json.code}`);
  }
  return json.data.flatMap((item) => {
    const normalized = normalize60sItem(item, id);
    return normalized ? [normalized] : [];
  });
}

/** 60s 原始字段归一化(与 src/lib/boards.ts 的映射保持一致) */
function normalize60sItem(item, id) {
  const url = safeUrl(item.link ?? item.url);
  const title = item.title?.trim();
  if (!url || !title) return null;
  if (id === 'baidu') {
    const heat = typeof item.score === 'number' ? item.score : Number(item.score);
    return {
      title,
      url,
      heat: Number.isFinite(heat) ? heat : undefined,
      heatLabel: item.score_desc ?? undefined,
      extra: item.type_desc ?? undefined,
      cover: safeUrl(item.cover),
    };
  }
  if (id === 'tieba') {
    const heat = parseHeatText(item.score_desc) ?? parseHeatText(item.score);
    return {
      title,
      url,
      heat,
      heatLabel: item.score_desc ?? undefined,
      cover: safeUrl(item.avatar),
    };
  }
  if (id === 'rednote') {
    const heat = typeof item.score === 'number' ? item.score : parseHeatText(item.score);
    return {
      title,
      url,
      heat,
      heatLabel: item.score_desc ?? formatHeat(heat),
    };
  }
  const heat =
    typeof item.hot_value === 'number'
      ? item.hot_value
      : parseHeatText(item.hot_value_desc ?? '');
  return {
    title,
    url,
    heat,
    heatLabel: item.hot_value_desc ?? formatHeat(heat),
    extra: item.answer_cnt != null ? `${item.answer_cnt} 回答` : undefined,
    cover: safeUrl(item.cover),
  };
}

/** 知乎热榜直连(无 CORS,仅用于 Node 快照生成) */
async function fetchZhihuDirect() {
  const json = await getJson('https://api.zhihu.com/topstory/hot-lists/total?limit=30', {
    Referer: 'https://www.zhihu.com/hot',
  });
  const list = Array.isArray(json?.data) ? json.data : [];
  return list.flatMap((entry) => {
    const target = entry?.target ?? {};
    const title = String(target.title ?? '').trim();
    const rawUrl = String(target.url ?? '');
    const url = safeUrl(
      rawUrl.replace('api.zhihu.com', 'www.zhihu.com').replace('/questions/', '/question/'),
    );
    if (!title || !url) return [];
    const heatText = String(entry?.detail_text ?? '');
    return [
      {
        title,
        url,
        heat: parseHeatText(heatText),
        heatLabel: heatText || undefined,
        extra: target.answer_count != null ? `${target.answer_count} 回答` : undefined,
        cover: safeUrl(entry?.children?.[0]?.thumbnail),
      },
    ];
  });
}

/** 微博访客态(无需账号):genvisitor + incarnate 拿到 SUB/SUBP */
let weiboCookie = null;
async function getWeiboVisitorCookie() {
  if (weiboCookie !== null) return weiboCookie;
  try {
    const form = new URLSearchParams({
      cb: 'gen_callback',
      fp: JSON.stringify({ os: '10', browser: 'Chrome131', app: '1', p: '0' }),
    });
    const gen = await fetch('https://passport.weibo.com/visitor/genvisitor', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }).then((res) => res.text());
    const tid = gen.match(/"tid":"([^"]+)"/)?.[1];
    if (!tid) throw new Error('没有 tid');
    const inc = await fetch(
      `https://passport.weibo.com/visitor/visitor?a=incarnate&t=${encodeURIComponent(tid)}&w=2&c=095&gc=&cb=cross_domain&from=weibo`,
      {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': UA, Referer: 'https://weibo.com/' },
      },
    ).then((res) => res.text());
    const sub = inc.match(/"sub":"([^"]+)"/)?.[1];
    const subp = inc.match(/"subp":"([^"]+)"/)?.[1];
    if (!sub || !subp) throw new Error('没有 SUB');
    weiboCookie = `SUB=${sub}; SUBP=${subp}`;
  } catch {
    weiboCookie = '';
  }
  return weiboCookie;
}

function weiboStatusPic(status) {
  const picId = Array.isArray(status?.pic_ids) ? status.pic_ids[0] : undefined;
  if (picId) return safeUrl(`https://wx1.sinaimg.cn/mw690/${picId}.jpg`);
  const info = status?.page_info;
  const videoPic = info?.video?.pic?.url ?? info?.video?.pic?.mp4;
  return safeUrl(info?.page_pic?.url ?? videoPic);
}

/** 微博热搜本身没有配图,用话题搜索结果首条带图微博补一张 */
async function fetchWeiboSearchCover(word) {
  const cookie = await getWeiboVisitorCookie();
  if (!cookie) return undefined;
  try {
    const json = await getJson(
      `https://weibo.com/ajax/statuses/search?q=${encodeURIComponent(`#${word}#`)}&f=0`,
      { Referer: 'https://s.weibo.com/', Cookie: cookie },
      12_000,
    );
    for (const status of json?.statuses ?? []) {
      const cover = weiboStatusPic(status);
      if (cover) return cover;
    }
  } catch {
    /* 访客态被限流时跳过补图 */
  }
  return undefined;
}

async function fetchWeibo() {
  const items = await fetch60s('weibo', 'weibo');
  const limitCover = createLimiter(2);
  return Promise.all(
    items.map(async (item) => {
      const cover = await limitCover(() => fetchWeiboSearchCover(item.title));
      return cover ? { ...item, cover } : item;
    }),
  );
}

function biliCoverPic(pic) {
  if (typeof pic !== 'string' || !pic.trim()) return undefined;
  const url = safeUrl(pic.startsWith('//') ? `https:${pic}` : pic);
  return url && new URL(url).hostname.endsWith('hdslb.com') ? url : undefined;
}

/** 只有标题带关键词高亮的才是真实命中,推荐位结果不给高亮 */
function biliMatchedPic(item) {
  if (typeof item?.title !== 'string' || !item.title.includes('class="keyword"')) return undefined;
  return biliCoverPic(item.pic);
}

/** B 站热搜只有关键词,用搜索首条视频封面补一张配图(带访客 Cookie 反而会返回空结果) */
async function fetchBiliSearchCover(keyword) {
  const headers = { Referer: 'https://search.bilibili.com/' };
  const qs = `search_type=video&keyword=${encodeURIComponent(keyword)}`;
  for (const url of [
    `https://api.bilibili.com/x/web-interface/wbi/search/type?${qs}`,
    `https://api.bilibili.com/x/web-interface/search/type?${qs}`,
  ]) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await sleep(400 * attempt);
      try {
        const json = await getJson(url, headers, 12_000);
        if (json?.code !== 0) continue;
        const result = Array.isArray(json?.data?.result) ? json.data.result : [];
        for (const item of result) {
          const cover = biliMatchedPic(item);
          if (cover) return cover;
        }
        break;
      } catch {
        /* 限流与超时换下一次重试 */
      }
    }
  }
  return undefined;
}

/** B 站热搜直连:优先 wbi 榜单,失败回退 App 榜单 */
async function fetchBiliDirect() {
  const headers = {
    'X-Real-IP': '157.255.219.143',
    'X-Forwarded-For': '157.255.219.143',
    Referer: 'https://www.bilibili.com/',
  };
  let list = [];
  try {
    const wbi = await getJson(
      'https://api.bilibili.com/x/web-interface/wbi/search/square?limit=50',
      headers,
    );
    list = wbi?.data?.trending?.list ?? [];
  } catch {
    /* fall through */
  }
  if (!Array.isArray(list) || list.length === 0) {
    const app = await getJson(
      'https://app.bilibili.com/x/v2/search/trending/ranking?limit=50',
      headers,
    );
    list = app?.data?.list ?? [];
  }
  const limitCover = createLimiter(2);
  const items = await Promise.all(
    (Array.isArray(list) ? list : []).map(async (item) => {
      const title = String(item?.keyword || item?.show_name || '').trim();
      if (!title) return null;
      const heat = Number(item?.heat_score);
      const cover = await limitCover(() => fetchBiliSearchCover(title));
      return {
        title,
        url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}`,
        heat: Number.isFinite(heat) && heat > 0 ? heat : undefined,
        heatLabel: Number.isFinite(heat) && heat > 0 ? formatHeat(heat) : undefined,
        cover,
      };
    }),
  );
  return items.filter(Boolean);
}

/** 抖音热搜直连 */
async function fetchDouyinDirect() {
  const json = await getJson(
    'https://aweme-lq.snssdk.com/aweme/v1/hot/search/list/?aid=1128&version_code=880',
  );
  const list = json?.data?.word_list ?? [];
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    const title = String(item?.word ?? '').trim();
    if (!title) return [];
    const heat = Number(item?.hot_value);
    return [
      {
        title,
        url: `https://www.douyin.com/search/${encodeURIComponent(title)}`,
        heat: Number.isFinite(heat) ? heat : undefined,
        heatLabel: Number.isFinite(heat) ? formatHeat(heat) : undefined,
        cover: safeUrl(item?.word_cover?.url_list?.[0]),
      },
    ];
  });
}

/** 头条热搜直连 */
async function fetchToutiaoDirect() {
  const json = await getJson('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc');
  const list = json?.data ?? [];
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    const title = String(item?.Title ?? '').trim();
    const url = safeUrl(String(item?.Url ?? '').split('?')[0].replace(/\/$/, ''));
    if (!title || !url) return [];
    const heat = Number(item?.HotValue);
    return [
      {
        title,
        url,
        heat: Number.isFinite(heat) ? heat : undefined,
        heatLabel: Number.isFinite(heat) ? formatHeat(heat) : undefined,
        cover: safeUrl(item?.Image?.url),
      },
    ];
  });
}

/** 百度热搜直连:从页面内嵌 s-data JSON 解析 */
async function fetchBaiduDirect() {
  const html = await fetchText('https://top.baidu.com/board?tab=realtime', {
    Accept: 'text/html',
  });
  const match = html.match(/<!--s-data:(.*?)-->/s);
  if (!match) throw new Error('百度页面未找到 s-data');
  const raw = match[1].replace(/\\-/g, '-');
  const list = JSON.parse(raw)?.data?.cards?.[0]?.content ?? [];
  const tags = { '1': '新', '3': '热' };
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    const title = String(item?.word ?? '').trim();
    const rawUrl = String(item?.url ?? '');
    const url = safeUrl(rawUrl.startsWith('http') ? rawUrl : `https://www.baidu.com${rawUrl}`);
    if (!title || !url || item?.isTop) return [];
    const heat = Number(item?.hotScore);
    return [
      {
        title,
        url,
        heat: Number.isFinite(heat) ? heat : undefined,
        heatLabel: Number.isFinite(heat) ? formatHeat(heat) : undefined,
        extra: tags[String(item?.hotTag)] ?? undefined,
        cover: safeUrl(item?.img),
      },
    ];
  });
}

/** 贴吧热议直连 */
async function fetchTiebaDirect() {
  const json = await getJson('https://tieba.baidu.com/hottopic/browse/topicList');
  const list = json?.data?.bang_topic?.topic_list ?? [];
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    const title = String(item?.topic_name ?? '').trim();
    const url = safeUrl(item?.topic_url);
    if (!title || !url) return [];
    const heat = Number(item?.discuss_num);
    return [
      {
        title,
        url,
        heat: Number.isFinite(heat) ? heat : undefined,
        heatLabel: Number.isFinite(heat) ? `${formatHeat(heat)} 讨论` : undefined,
        cover: safeUrl(item?.topic_avatar),
      },
    ];
  });
}

/** YouTube 视频封面无需抓取页面 */
function directArticleImage(pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (/(^|\.)youtu\.be$/.test(url.hostname)) {
      const id = url.pathname.slice(1).split('/')[0];
      if (/^[\w-]{11}$/.test(id)) return safeUrl(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    }
    if (/(^|\.)youtube\.com$/.test(url.hostname)) {
      const id = url.searchParams.get('v') ?? url.pathname.split('/').filter(Boolean).pop();
      if (id && /^[\w-]{11}$/.test(id)) return safeUrl(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    }
  } catch {
    /* 非标准链接交给页面抓取 */
  }
  return undefined;
}

/** 抓文章页的 og:image / twitter:image,给 Hacker News 这类纯文字榜单补配图 */
async function fetchPageOgImage(pageUrl) {
  if (/(^|\.)github\.com$/.test(new URL(pageUrl).hostname)) return undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(pageUrl, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok || !/text\/html|application\/xhtml/.test(res.headers.get('content-type') || '')) {
      return undefined;
    }
    const reader = res.body?.getReader();
    if (!reader) return undefined;
    const decoder = new TextDecoder();
    let html = '';
    while (html.length < 96_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => {});
    const metas = html.match(
      /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image|twitter:image:src)["'][^>]*>/gi,
    ) || [];
    for (const meta of metas) {
      const raw = meta.match(/content=["']([^"']+)["']/i)?.[1];
      const url = raw && safeUrl(new URL(raw.replace(/&amp;/g, '&'), pageUrl).href);
      if (url) return url;
    }
    for (const block of html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        const data = JSON.parse(block[1]);
        for (const node of Array.isArray(data) ? data : [data]) {
          const img = node?.image;
          const raw = typeof img === 'string' ? img : Array.isArray(img) ? img[0] : img?.url;
          const url = raw && safeUrl(new URL(String(raw).replace(/&amp;/g, '&'), pageUrl).href);
          if (url) return url;
        }
      } catch {
        /* 非法 JSON-LD 跳过 */
      }
    }
    const imageSrc = html
      .match(/<link[^>]+rel=["']image_src["'][^>]*>/i)?.[0]
      ?.match(/href=["']([^"']+)["']/i)?.[1];
    if (imageSrc) return safeUrl(new URL(imageSrc.replace(/&amp;/g, '&'), pageUrl).href);
    return undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHackerNews() {
  const json = await getJson(
    'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30',
  );
  const limitOg = createLimiter(4);
  const hits = (json?.hits ?? []).filter((hit) => hit.title);
  const items = await Promise.all(
    hits.map(async (hit) => {
      const url =
        safeUrl(hit.url) ??
        `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`;
      const isExternal = safeUrl(hit.url) !== undefined;
      return {
        title: hit.title,
        url,
        heat: hit.points ?? 0,
        heatLabel: hit.points != null ? `${hit.points} 分` : undefined,
        extra: `${hit.num_comments ?? 0} 评论 · @${hit.author ?? '-'}`,
        cover: isExternal
          ? (directArticleImage(url) ?? (await limitOg(() => fetchPageOgImage(url))))
          : undefined,
      };
    }),
  );
  return items;
}

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

// 每个源按顺序尝试多种抓取方式;直接上游优先,避免 60s 限流
const jobs = [
  { id: 'weibo', label: '微博+补图', run: fetchWeibo, fallback: () => fetch60s('weibo', 'weibo') },
  { id: 'zhihu', label: '知乎直连', run: fetchZhihuDirect, fallback: () => fetch60s('zhihu', 'zhihu') },
  { id: 'douyin', label: '抖音直连', run: fetchDouyinDirect, fallback: () => fetch60s('douyin', 'douyin') },
  { id: 'toutiao', label: '头条直连', run: fetchToutiaoDirect, fallback: () => fetch60s('toutiao', 'toutiao') },
  { id: 'baidu', label: '百度直连', run: fetchBaiduDirect, fallback: () => fetch60s('baidu/hot', 'baidu') },
  { id: 'bili', label: 'B站直连', run: fetchBiliDirect, fallback: () => fetch60s('bili', 'bili') },
  { id: 'tieba', label: '贴吧直连', run: fetchTiebaDirect, fallback: () => fetch60s('baidu/tieba', 'tieba') },
  { id: 'rednote', label: '60s', run: () => fetch60s('rednote', 'rednote') },
  { id: 'hackernews', label: 'HN', run: fetchHackerNews },
];

const previous = await loadPrevious();
const boards = {};
const boardAt = {};
const freshBoards = new Set();

for (const job of jobs) {
  let items = [];
  let used = '';
  for (const [label, run] of [
    [job.label, job.run],
    ...(job.fallback ? [['60s 回退', job.fallback]] : []),
  ]) {
    try {
      const fetched = await run();
      if (fetched.length === 0) throw new Error('空数据');
      items = fetched;
      used = label;
      break;
    } catch (error) {
      console.warn(`✗ ${job.id} · ${label}: ${error.message}`);
      await sleep(RETRY_DELAY);
    }
  }

  if (items.length > 0) {
    boards[job.id] = items.map((item) => ({ ...item, source: job.id }));
    boardAt[job.id] = Date.now();
    freshBoards.add(job.id);
    console.log(`✓ ${job.id}: ${items.length} 条 (${used})`);
  } else {
    const old = previous?.boards?.[job.id];
    if (Array.isArray(old) && old.length > 0) {
      // 复用旧条目:仅保留仍存在的本地封面,旧的 http(s) 签名链接多半已过期,直接丢弃
      boards[job.id] = await Promise.all(
        old.map(async (item) => ({
          ...item,
          source: job.id,
          cover: await usableLocalCover(item.cover),
        })),
      );
      boardAt[job.id] = previous?.boardAt?.[job.id] ?? previous?.generatedAt ?? Date.now();
      const localCovers = boards[job.id].filter((item) => item.cover).length;
      console.warn(`↺ ${job.id}: 保留上次快照 ${old.length} 条(本地封面 ${localCovers} 个)`);
    } else {
      console.warn(`✗ ${job.id}: 无可用数据且没有历史快照`);
    }
  }
}

/** 新抓取条目缺图时,按标题复用上一份快照里仍存在的本地封面(如 B 站搜索补图)。 */
async function mergePreviousCovers(boards, previous, freshBoards) {
  let reused = 0;
  for (const id of freshBoards) {
    const old = previous?.boards?.[id];
    if (!Array.isArray(old)) continue;
    const byTitle = new Map();
    for (const item of old) {
      if (
        typeof item?.title === 'string' &&
        typeof item?.cover === 'string' &&
        item.cover.startsWith(COVER_PREFIX)
      ) {
        byTitle.set(item.title, item.cover);
      }
    }
    for (const item of boards[id] ?? []) {
      if (item.cover || !byTitle.has(item.title)) continue;
      const cover = await usableLocalCover(byTitle.get(item.title));
      if (cover) {
        item.cover = cover;
        reused += 1;
      }
    }
  }
  if (reused > 0) console.log(`封面复用: 按标题沿用上次本地封面 ${reused} 个`);
}

await mergePreviousCovers(boards, previous, freshBoards);

await mkdir(COVERS_DIR, { recursive: true });
const coverStats = await localizeFetchedCovers(boards, freshBoards);
console.log(
  `封面: 新抓取条目 ${coverStats.total} 条,下载成功 ${coverStats.saved} 个文件,失败 ${coverStats.failed} 次`,
);

const snapshot = {
  generatedAt: Date.now(),
  boardAt,
  boards,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

// 快照落盘后再修剪本地封面,避免生成失败时误删仍在引用的文件
if (Object.keys(boards).length > 0) {
  const pruned = await pruneCovers(boards);
  console.log(`本地封面: 保留 ${pruned.kept} 个,清理 ${pruned.removed} 个未引用文件`);
} else {
  console.warn('本地封面: 没有任何榜单数据,跳过修剪');
}
console.log(`\n写入 ${OUT}(共 ${Object.keys(boards).length} 个榜单)`);
