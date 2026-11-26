#!/usr/bin/env node
/**
 * 校验九榜快照完整性。
 * 任一榜单为空,或本地封面(covers/...)缺失时退出 1,
 * 避免工作流把缺榜/破图的快照提交或部署出去。
 */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const IDS = [
  'weibo',
  'zhihu',
  'douyin',
  'toutiao',
  'baidu',
  'bili',
  'tieba',
  'rednote',
  'hackernews',
];

const file = join(process.cwd(), 'public', 'data', 'snapshot.json');
let snapshot;
try {
  snapshot = JSON.parse(await readFile(file, 'utf8'));
} catch (error) {
  console.error(`✗ 无法读取快照 ${file}: ${error.message}`);
  process.exit(1);
}

const missing = IDS.filter(
  (id) => !Array.isArray(snapshot?.boards?.[id]) || snapshot.boards[id].length === 0,
);
if (missing.length > 0) {
  console.error(`✗ 快照缺少榜单: ${missing.join(', ')}`);
  process.exit(1);
}

// 本地封面:covers/xxx.jpg 必须存在且非空;http(s) 视为外部链接,不校验
const brokenCovers = [];
let localCovers = 0;
for (const id of IDS) {
  for (const item of snapshot.boards[id]) {
    const cover = item?.cover;
    if (typeof cover !== 'string' || !cover.startsWith('covers/')) continue;
    localCovers += 1;
    const rel = cover.slice('covers/'.length);
    let ok = false;
    if (rel && !rel.includes('..') && !rel.startsWith('/') && !rel.startsWith('\\')) {
      try {
        const info = await stat(join(process.cwd(), 'public', 'covers', rel));
        ok = info.isFile() && info.size > 0;
      } catch {
        ok = false;
      }
    }
    if (!ok) brokenCovers.push(`${id}: ${cover}`);
  }
}
if (brokenCovers.length > 0) {
  console.error(`✗ 本地封面缺失 ${brokenCovers.length} 个:`);
  for (const line of brokenCovers.slice(0, 5)) console.error(`  - ${line}`);
  if (brokenCovers.length > 5) {
    console.error(`  ... 其余 ${brokenCovers.length - 5} 个已省略`);
  }
  process.exit(1);
}

const summary = IDS.map((id) => `${id}:${snapshot.boards[id].length}`).join(', ');
console.log(`✓ 九榜快照完整 (${summary}),本地封面 ${localCovers} 个均可访问`);

// 前端只展示带实拍图的热点:某榜整榜无封面会让它在页面上凭空消失,这里显式提醒
const noCover = IDS.filter(
  (id) =>
    snapshot.boards[id].length >= 10 &&
    !snapshot.boards[id].some((item) => typeof item?.cover === 'string' && item.cover.startsWith('covers/')),
);
if (noCover.length > 0) {
  console.warn(`⚠ 以下榜单没有任何本地封面: ${noCover.join(', ')}`);
}
