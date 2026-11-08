import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { api, type AdminStats } from '../lib/api';
import { AuthRequired } from '../components/auth-required';
import { Avatar } from '../components/avatar';
import { CoverThumb } from '../components/cover-thumb';
import { Button, Card, EmptyState, HeatBar, Spinner } from '../components/ui';
import {
  ChartIcon,
  ChatIcon,
  ExternalIcon,
  FlameIcon,
  RefreshIcon,
  SendIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
} from '../components/icons';
import { BOARDS, loadSnapshot, type SnapshotFile } from '../lib/boards';
import { formatCount, formatDateTime, relativeTime } from '../lib/format';

const CHART_W = 720;
const CHART_H = 226;
const PAD_L = 38;
const PAD_R = 14;
const PAD_T = 18;
const PAD_B = 30;

function StatCard({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  note: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={`grid size-11 shrink-0 -rotate-3 place-items-center rounded-blob-1 border-toon shadow-toon-sm ${tone}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[22px] font-black leading-none tabular-nums text-ink">{value}</p>
        <p className="mt-1 truncate text-[12px] font-black text-ink-soft">{label}</p>
        <p className="truncate text-[10px] font-bold text-muted">{note}</p>
      </div>
    </Card>
  );
}

function shortDate(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function DashboardPage({ navigate }: { navigate: (to: string) => void }) {
  const auth = useAuth();
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snap, setSnap] = useState<SnapshotFile | null>(null);
  const [snapLoaded, setSnapLoaded] = useState(false);

  const isAdmin = Boolean(auth.user?.isAdmin);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const stats = await api<AdminStats>('/api/admin/stats');
      setData(stats);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '看板暂时打不开');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [isAdmin, load]);

  useEffect(() => {
    let alive = true;
    const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4000));
    void Promise.race([loadSnapshot(), timeout]).then((value) => {
      if (alive) {
        setSnap(value);
        setSnapLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const chart = useMemo(() => {
    if (!data) return null;
    const series = [
      { key: 'register', name: '新成员', color: '#FF6B35', points: data.trend.register.map((p) => p.count) },
      { key: 'login', name: '登录', color: '#2A9D8F', points: data.trend.login.map((p) => p.count) },
      { key: 'chat', name: '发言', color: '#FFC94D', points: data.trend.chat.map((p) => p.count) },
    ];
    const all = series.flatMap((item) => item.points);
    const max = Math.max(2, ...all);
    const top = Math.ceil(max * 1.2);
    const innerW = CHART_W - PAD_L - PAD_R;
    const innerH = CHART_H - PAD_T - PAD_B;
    const x = (index: number) => PAD_L + (index / 13) * innerW;
    const y = (value: number) => CHART_H - PAD_B - (value / top) * innerH;
    return {
      series: series.map((item) => ({
        ...item,
        path: item.points.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' '),
        dots: item.points.map((value, index) => ({ x: x(index), y: y(value), value })),
        total: item.points.reduce((sum, value) => sum + value, 0),
      })),
      top,
      x,
      y,
      innerW,
      innerH,
    };
  }, [data]);

  const boards = useMemo(() => {
    return BOARDS.map((meta) => {
      const items = snap?.boards[meta.id] ?? [];
      const top = items[0];
      const maxHeat = Math.max(0, ...items.map((item) => item.heat ?? 0));
      return {
        meta,
        items,
        top,
        maxHeat,
        at: snap?.boardAt?.[meta.id] ?? snap?.generatedAt,
        heat: items.reduce((sum, item) => sum + (item.heat ?? 0), 0),
      };
    }).sort((a, b) => b.heat - a.heat);
  }, [snap]);

  const totalItems = useMemo(() => boards.reduce((sum, board) => sum + board.items.length, 0), [boards]);
  const latestAt = useMemo(() => {
    if (!snap) return null;
    const values = boards.map((board) => board.at).filter((value): value is number => typeof value === 'number');
    return values.length ? Math.max(...values) : snap.generatedAt;
  }, [boards, snap]);

  if (!auth.ready) {
    return (
      <div className="mx-auto flex max-w-xl items-center justify-center py-20">
        <Card className="flex items-center gap-3 px-6 py-5">
          <Spinner className="size-5 text-accent" />
          <span className="text-sm font-bold text-ink-soft">正在核对权限…</span>
        </Card>
      </div>
    );
  }

  if (!auth.user) {
    return <AuthRequired navigate={navigate} next="dashboard" title="登录后查看看板" />;
  }

  if (!auth.user.isAdmin) {
    return (
      <div className="mx-auto max-w-lg animate-rise">
        <Card className="p-7 text-center">
          <span className="mx-auto grid size-14 -rotate-6 place-items-center rounded-blob-1 border-toon bg-blue-soft shadow-toon-sm">
            <ShieldIcon className="size-7 text-blue" />
          </span>
          <h2 className="mt-4 text-xl font-black">这里仅管理员可见</h2>
          <p className="mt-1 text-[13px] font-semibold leading-relaxed text-muted">
            数据看板包含全站账号与活动统计。想了解热榜动态，可以先回总览页。
          </p>
          <Button variant="primary" className="mt-5" onClick={() => navigate('boards')}>
            返回热榜总览
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl animate-rise space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-10 -rotate-6 place-items-center rounded-blob-1 border-toon bg-yellow-soft shadow-toon-sm">
          <ChartIcon className="size-6" />
        </span>
        <div>
          <h2 className="text-lg font-black leading-tight">全站概览</h2>
          <p className="font-mono text-[10px] font-black tracking-[2px] text-muted">OVERVIEW</p>
        </div>
        <span className="ml-auto text-xs font-bold text-muted">
          {data ? `更新于 ${relativeTime(Date.parse(data.now))}` : '正在汇总…'}
        </span>
        <Button size="sm" variant="secondary" onClick={() => void load(false)} disabled={loading}>
          {loading ? <Spinner className="size-3.5" /> : <RefreshIcon className="size-3.5" />}
          刷新
        </Button>
      </div>

      {error && !data && (
        <Card className="p-6">
          <EmptyState
            icon={<ShieldIcon className="size-7 text-danger" />}
            title="看板暂时打不开"
            desc={error}
            action={
              <Button size="sm" onClick={() => void load(false)}>
                再试一次
              </Button>
            }
          />
        </Card>
      )}

      {loading && !data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index} className="h-[92px] animate-pulse bg-paper">
              <span />
            </Card>
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard
              label="注册成员"
              value={data.totals.users}
              note={`今日 +${data.totals.usersToday} · 近 7 天 +${data.totals.usersWeek}`}
              icon={<UsersIcon className="size-5" />}
              tone="bg-accent-soft"
            />
            <StatCard
              label="当前在线"
              value={data.totals.online}
              note="5 分钟内活跃"
              icon={<FlameIcon className="size-5" />}
              tone="bg-teal-soft"
            />
            <StatCard
              label="对话消息"
              value={data.totals.chats}
              note={`今日 +${data.totals.chatsToday}`}
              icon={<ChatIcon className="size-5" />}
              tone="bg-yellow-soft"
            />
            <StatCard
              label="今日登录"
              value={data.trend.login[data.trend.login.length - 1]?.count ?? 0}
              note="按登录记录统计"
              icon={<UserIcon className="size-5" />}
              tone="bg-blue-soft"
            />
            <StatCard
              label="热榜条目"
              value={totalItems}
              note={latestAt ? `快照 ${relativeTime(latestAt)}` : '快照加载中'}
              icon={<SendIcon className="size-5" />}
              tone="bg-accent-soft"
            />
          </div>

          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black">近 14 天动向</h3>
              <span className="font-mono text-[10px] font-black tracking-[1.5px] text-muted">ACTIVITY</span>
              <span className="ml-auto flex flex-wrap gap-3 text-[11px] font-bold text-ink-soft">
                {chart?.series.map((item) => (
                  <span key={item.key} className="inline-flex items-center gap-1">
                    <span className="size-2.5 rounded-full border border-ink/40" style={{ background: item.color }} />
                    {item.name} {item.total}
                  </span>
                ))}
              </span>
            </div>
            {chart && (
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-auto w-full min-w-[560px]" role="img" aria-label="近 14 天注册、登录与发言趋势">
                  {[0, 1, 2, 3].map((row) => {
                    const y = PAD_T + (row / 3) * chart.innerH;
                    return (
                      <g key={row}>
                        <line x1={PAD_L} x2={CHART_W - PAD_R} y1={y} y2={y} stroke="#d3c49c" strokeDasharray="3 4" strokeWidth="1" />
                        <text x={PAD_L - 7} y={y + 3} textAnchor="end" fontSize="9" fill="#a08f81">
                          {Math.round(chart.top * (3 - row) / 3)}
                        </text>
                      </g>
                    );
                  })}
                  {chart.series.map((series) => (
                    <g key={series.key}>
                      <path d={series.path} fill="none" stroke={series.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      {series.dots.map((dot, index) => (
                        <circle key={`${series.key}-${index}`} cx={dot.x} cy={dot.y} r="2.8" fill={series.color} stroke="#fffdf7" strokeWidth="1" />
                      ))}
                    </g>
                  ))}
                  {data.trend.days.map((day, index) => (
                    <text
                      key={day}
                      x={chart.x(index)}
                      y={CHART_H - 9}
                      textAnchor="middle"
                      fontSize="8.5"
                      fill="#a08f81"
                      opacity={index % 2 === 0 ? 1 : 0.45}
                    >
                      {day.slice(5)}
                    </text>
                  ))}
                </svg>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-black">登录地点 Top 10</h3>
                <span className="font-mono text-[10px] font-black tracking-[1.5px] text-muted">LOCATIONS</span>
              </div>
              {data.locations.length === 0 ? (
                <p className="py-6 text-center text-xs font-bold text-muted">还没有登录地点记录</p>
              ) : (
                <div className="space-y-2.5">
                  {data.locations.map((item) => {
                    const max = data.locations[0]?.count || 1;
                    return (
                      <div key={item.location} className="flex items-center gap-2.5 text-[12px] font-bold">
                        <span className="w-32 shrink-0 break-words text-[11px] leading-tight text-ink-soft" title={item.location}>
                          {item.location}
                        </span>
                        <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full border-[2px] border-ink/60 bg-paper">
                          <span className="block h-full rounded-full bg-teal" style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} />
                        </span>
                        <span className="w-7 shrink-0 text-right font-mono text-[11px] text-muted">{item.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-black">最近加入的成员</h3>
                <span className="font-mono text-[10px] font-black tracking-[1.5px] text-muted">NEWCOMERS</span>
              </div>
              {data.recentUsers.length === 0 ? (
                <p className="py-6 text-center text-xs font-bold text-muted">还没有成员</p>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {data.recentUsers.slice(0, 8).map((user) => (
                    <div key={`${user.email}-${user.createdAt}`} className="flex items-center gap-2.5 rounded-btn border-[2px] border-ink/15 bg-paper px-2.5 py-2">
                      <Avatar person={{ nickname: user.nickname, email: user.email }} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-black text-ink">{user.nickname}</p>
                        <p className="truncate font-mono text-[10px] font-bold text-muted">{user.email}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-bold text-ink-soft">{user.location}</p>
                        <p className="font-mono text-[9px] font-bold text-muted">{shortDate(user.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b-[3px] border-dashed border-ink/20 px-5 pb-3 pt-4">
              <span className="grid size-9 -rotate-6 place-items-center rounded-blob-1 border-toon bg-accent-soft shadow-toon-sm">
                <FlameIcon className="size-5" />
              </span>
              <div>
                <h3 className="text-sm font-black leading-tight">热榜平台概览</h3>
                <p className="font-mono text-[9px] font-black tracking-[1.5px] text-muted">SOURCE PULSE</p>
              </div>
              <span className="ml-auto text-[11px] font-bold text-muted">
                {snap
                  ? `${BOARDS.length} 个平台 · ${totalItems} 条 · ${latestAt ? relativeTime(latestAt) : '—'}更新`
                  : '正在读取最新快照…'}
              </span>
            </div>

            {!snapLoaded ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-card bg-paper" />
                ))}
              </div>
            ) : !snap ? (
              <p className="px-5 py-10 text-center text-xs font-bold text-muted">
                最新快照暂时不可用，稍后再刷新看看。
              </p>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {boards.map((board) => (
                  <div key={board.meta.id} className="rounded-card border-[2.5px] border-ink/20 bg-paper p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-black text-ink">{board.meta.name}</span>
                      <span className="font-mono text-[9px] font-black tracking-[1px] text-muted">
                        {board.meta.en.toUpperCase()}
                      </span>
                      <span className="ml-auto font-mono text-[10px] font-bold text-muted">
                        {board.items.length} 条
                      </span>
                    </div>
                    {board.top ? (
                      <a
                        href={board.top.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group mt-2 flex items-start gap-2"
                      >
                        <CoverThumb cover={board.top.cover} size="size-9" />
                        <span className="line-clamp-2 min-w-0 flex-1 text-[11px] font-bold leading-snug text-ink-soft group-hover:text-accent-deep">
                          {board.top.title}
                          <ExternalIcon className="ml-0.5 inline size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
                        </span>
                      </a>
                    ) : (
                      <p className="mt-2 text-[11px] font-bold text-muted">暂无快照</p>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <HeatBar
                          ratio={board.top?.heat && board.maxHeat > 0 ? board.top.heat / board.maxHeat : 0}
                          label={board.top?.heatLabel ?? formatCount(board.top?.heat) ?? '—'}
                        />
                      </div>
                      {board.at && (
                        <span className="shrink-0 font-mono text-[9px] font-bold text-muted">
                          {formatDateTime(board.at).slice(5, 16)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
