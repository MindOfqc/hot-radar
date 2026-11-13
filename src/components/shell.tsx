import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PageId } from '../lib/router';
import { useNotices } from '../lib/notices';
import { useAuth } from '../lib/auth';
import { relativeTime } from '../lib/format';
import { Avatar } from './avatar';
import { Button, Spinner } from './ui';
import {
  BellIcon,
  ChartIcon,
  ChatIcon,
  FlameIcon,
  GearIcon,
  GithubIcon,
  LockIcon,
  LogoutIcon,
  RadarIcon,
  SearchIcon,
  SparkIcon,
  TargetIcon,
  UserIcon,
} from './icons';

type NavItem = {
  id: PageId;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
};

const DESKTOP_NAV: NavItem[] = [
  { id: 'boards', label: '热榜总览', icon: FlameIcon },
  { id: 'monitor', label: '关键词监控', icon: TargetIcon },
  { id: 'search', label: '全网搜索', icon: SearchIcon },
  { id: 'chat', label: '对话室', icon: ChatIcon },
  { id: 'dashboard', label: '数据看板', icon: ChartIcon },
  { id: 'settings', label: '设置', icon: GearIcon },
];

const MOBILE_NAV: NavItem[] = [
  { id: 'boards', label: '热榜', icon: FlameIcon },
  { id: 'monitor', label: '监控', icon: TargetIcon },
  { id: 'search', label: '搜索', icon: SearchIcon },
  { id: 'chat', label: '对话', icon: ChatIcon },
  { id: 'profile', label: '我的', icon: UserIcon },
];

const PAGE_TITLES: Record<PageId, { title: string; sub: string }> = {
  boards: { title: '热榜总览', sub: 'BOARDS' },
  monitor: { title: '关键词监控', sub: 'MONITOR' },
  search: { title: '全网搜索', sub: 'SEARCH' },
  dashboard: { title: '数据看板', sub: 'INSIGHTS' },
  chat: { title: '对话室', sub: 'LOUNGE' },
  profile: { title: '个人资料', sub: 'PROFILE' },
  auth: { title: '登录 / 注册', sub: 'ACCOUNT' },
  settings: { title: '设置', sub: 'SETTINGS' },
};

/* 装饰星星(尊重 prefers-reduced-motion) */
function Sparks() {
  return (
    <>
      <div className="animate-float pointer-events-none fixed left-[250px] top-[70px] z-0 hidden lg:block">
        <SparkIcon className="size-[26px]" />
      </div>
      <div
        className="animate-float pointer-events-none fixed right-[60px] top-[150px] z-0 hidden lg:block"
        style={{ animationDelay: '-2.5s' }}
      >
        <SparkIcon fill="#2A9D8F" className="size-[18px]" />
      </div>
      <div
        className="animate-float pointer-events-none fixed bottom-[120px] left-[300px] z-0 hidden lg:block"
        style={{ animationDelay: '-5s' }}
      >
        <SparkIcon fill="#FF6B35" className="size-4" />
      </div>
    </>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="hidden rounded-btn border-toon bg-surface px-3 py-1.5 font-mono text-[13px] font-extrabold tabular-nums text-ink shadow-toon-sm md:inline-block">
      {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
    </span>
  );
}

function NoticeBell({ navigate }: { navigate: (to: string) => void }) {
  const { notices, unread, markRead, markAllRead, clear } = useNotices();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-[42px] cursor-pointer place-items-center rounded-blob-1 border-toon bg-yellow shadow-toon-sm transition-all duration-150 hover:-translate-x-px hover:-translate-y-px hover:rotate-3 hover:shadow-toon active:translate-x-0.5 active:translate-y-0.5 active:shadow-toon-none"
        title="通知中心"
        aria-label={`通知中心${unread > 0 ? `,${unread} 条未读` : ''}`}
        aria-expanded={open}
      >
        <BellIcon bodyFill="#fff" className="size-[21px]" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full border-[2.5px] border-ink bg-accent px-1 font-mono text-[11px] font-black leading-5 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-rise absolute right-0 top-[52px] z-50 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-card border-toon bg-surface shadow-toon">
          <div className="flex items-center justify-between border-b-[3px] border-dashed border-ink/20 px-4 py-2.5">
            <span className="text-[13px] font-black text-ink">通知中心</span>
            <div className="flex gap-1">
              <button
                className="cursor-pointer rounded px-2 py-0.5 text-xs font-bold text-muted transition-colors hover:bg-paper hover:text-ink"
                onClick={markAllRead}
              >
                全部已读
              </button>
              <button
                className="cursor-pointer rounded px-2 py-0.5 text-xs font-bold text-muted transition-colors hover:bg-paper hover:text-danger"
                onClick={clear}
              >
                清空
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notices.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] font-semibold text-muted">暂无通知</p>
            ) : (
              notices.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    markRead(n.id);
                    if (n.focusId) {
                      setOpen(false);
                      navigate(`monitor?focus=${n.focusId}`);
                    } else if (n.keywordId) {
                      setOpen(false);
                      navigate(`monitor?kw=${n.keywordId}`);
                    }
                  }}
                  className={`block w-full cursor-pointer border-b-[2.5px] border-dashed border-ink/10 px-4 py-3 text-left transition-colors last:border-0 hover:bg-yellow-soft ${
                    n.read ? '' : 'bg-paper'
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-bold leading-5 text-ink">{n.title}</span>
                    {!n.read && <span className="mt-1.5 size-2.5 shrink-0 rounded-blob-3 bg-accent" />}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs font-semibold leading-relaxed text-ink-soft">
                    {n.body}
                  </span>
                  <span className="mt-1 block font-mono text-[10px] font-bold text-muted">
                    {relativeTime(n.at)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ navigate }: { navigate: (to: string) => void }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!auth.ready) {
    return (
      <span className="grid size-[42px] place-items-center rounded-blob-1 border-toon bg-surface shadow-toon-sm">
        <Spinner className="size-4 text-muted" />
      </span>
    );
  }

  if (!auth.user) {
    return (
      <Button size="sm" variant="primary" className="shrink-0" onClick={() => navigate('auth')}>
        <LockIcon className="size-3.5" />
        <span className="hidden sm:inline">登录 / 注册</span>
        <span className="sm:hidden">登录</span>
      </Button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="用户菜单"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2 rounded-btn border-toon bg-surface py-1 pl-1 pr-1 shadow-toon-sm transition-all duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-toon active:translate-x-0.5 active:translate-y-0.5 active:shadow-toon-none sm:pr-2.5"
      >
        <Avatar person={auth.user} size={32} />
        <span className="hidden max-w-24 truncate text-[12px] font-black text-ink sm:block">
          {auth.user.nickname}
        </span>
      </button>

      {open && (
        <div className="animate-rise absolute right-0 top-[50px] z-50 w-64 overflow-hidden rounded-card border-toon bg-surface shadow-toon">
          <div className="flex items-center gap-2.5 border-b-[3px] border-dashed border-ink/20 bg-paper px-4 py-3">
            <Avatar person={auth.user} size={42} />
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-ink">{auth.user.nickname}</p>
              <p className="truncate font-mono text-[10px] font-bold text-muted">{auth.user.email}</p>
              {auth.user.isAdmin && (
                <span className="mt-1 inline-block rounded-full border-toon-sm bg-yellow px-1.5 py-px text-[9px] font-black">
                  管理员
                </span>
              )}
            </div>
          </div>
          <div className="p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('profile');
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-btn px-3 py-2 text-left text-[13px] font-bold text-ink-soft transition-colors hover:bg-yellow-soft hover:text-ink"
            >
              <UserIcon className="size-4" /> 个人资料
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('chat');
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-btn px-3 py-2 text-left text-[13px] font-bold text-ink-soft transition-colors hover:bg-yellow-soft hover:text-ink"
            >
              <ChatIcon className="size-4" /> 对话室
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('dashboard');
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-btn px-3 py-2 text-left text-[13px] font-bold text-ink-soft transition-colors hover:bg-yellow-soft hover:text-ink"
            >
              <ChartIcon className="size-4" /> 数据看板
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void auth.logout().then(() => navigate('boards'));
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-btn px-3 py-2 text-left text-[13px] font-bold text-danger transition-colors hover:bg-accent-soft"
            >
              <LogoutIcon className="size-4" /> 退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarUser({ navigate }: { navigate: (to: string) => void }) {
  const auth = useAuth();

  if (!auth.ready) {
    return (
      <div className="flex items-center gap-2 rounded-btn border-[2.5px] border-ink/15 px-2.5 py-2">
        <Spinner className="size-3.5 text-muted" />
        <span className="text-[11px] font-bold text-muted">读取账号…</span>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <button
        type="button"
        onClick={() => navigate('auth')}
        className="flex w-full cursor-pointer items-center gap-2 rounded-btn border-[2.5px] border-ink bg-yellow px-3 py-2 text-left text-[13px] font-black text-ink shadow-toon-sm transition-all duration-100 hover:-translate-x-px hover:-translate-y-px hover:shadow-toon active:translate-x-0.5 active:translate-y-0.5 active:shadow-toon-none"
      >
        <LockIcon className="size-4" />
        登录 / 注册
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate('profile')}
      className="flex w-full cursor-pointer items-center gap-2 rounded-btn border-[2.5px] border-ink/20 bg-paper px-2.5 py-2 text-left transition-all duration-100 hover:border-ink hover:bg-surface hover:shadow-toon-sm"
    >
      <Avatar person={auth.user} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-black text-ink">{auth.user.nickname}</span>
        <span className="block truncate font-mono text-[9px] font-bold text-muted">{auth.user.email}</span>
      </span>
      {auth.user.isAdmin && <span className="size-2 shrink-0 rounded-full bg-accent" title="管理员" />}
    </button>
  );
}

function MobileNav({ page, navigate }: { page: PageId; navigate: (to: string) => void }) {
  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 gap-1 border-t-[3px] border-ink bg-surface px-1.5 pt-1.5 pb-safe md:hidden"
    >
      {MOBILE_NAV.map((item) => {
        const Icon = item.icon;
        const active = page === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-btn border-[2.5px] px-1 py-1 text-[10px] font-black transition-all duration-100 ${
              active
                ? 'border-ink bg-yellow text-ink shadow-toon-sm'
                : 'border-transparent text-ink-soft hover:bg-paper hover:text-ink'
            }`}
          >
            <Icon className="size-5" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export function Shell({
  page,
  navigate,
  children,
}: {
  page: PageId;
  navigate: (to: string) => void;
  children: ReactNode;
}) {
  const meta = PAGE_TITLES[page];
  const auth = useAuth();

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-btn focus:border-toon focus:bg-yellow focus:px-3 focus:py-2 focus:text-sm focus:font-black focus:shadow-toon-sm"
      >
        跳到主要内容
      </a>

      {/* 装饰星星 */}
      <Sparks />

      {/* 侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-54 flex-col border-r-[3px] border-ink bg-surface max-md:hidden">
        <div className="flex items-center gap-2.5 px-4 pb-5 pt-6">
          <div className="grid size-11 -rotate-6 place-items-center rounded-blob-1 border-toon bg-accent shadow-toon-sm">
            <RadarIcon className="size-[26px]" />
          </div>
          <div className="leading-tight">
            <p className="text-[17px] font-black tracking-wide text-ink">热点雷达</p>
            <p className="font-mono text-[10px] font-extrabold tracking-[3px] text-muted">
              HOTRADAR
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-3.5">
          {DESKTOP_NAV.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-nav border-[3px] px-3.5 py-2 text-sm font-extrabold transition-all duration-150 ${
                  active
                    ? '-rotate-1.5 border-ink bg-yellow text-ink shadow-toon-sm'
                    : 'border-transparent text-ink-soft hover:-translate-x-px hover:-translate-y-px hover:-rotate-0.5 hover:border-ink hover:bg-paper hover:text-ink hover:shadow-toon-sm'
                }`}
              >
                <Icon className="size-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t-[3px] border-dashed border-ink/25 px-3.5 py-4">
          <SidebarUser navigate={navigate} />
          <a
            href="https://github.com/rwzdk/hot-radar"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-1.5 text-xs font-extrabold text-ink-soft transition-colors hover:text-accent-deep"
          >
            <GithubIcon className="size-4" />
            GitHub 仓库
          </a>
          <p className="px-1.5 font-mono text-[10px] font-bold text-muted">v{__APP_VERSION__}</p>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col max-md:ml-0 md:ml-54">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-paper/95 px-4 pb-3.5 pt-4 sm:gap-4 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <h1 className="truncate text-2xl font-black tracking-wide sm:text-[27px]">
              {meta.title}
            </h1>
            <span className="hidden shrink-0 rotate-2 rounded-full border-toon bg-teal px-2.5 py-1 text-[11px] font-black tracking-[2px] text-white shadow-toon-sm sm:inline-block">
              {meta.sub}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Clock />
            <NoticeBell navigate={navigate} />
            {!(page === 'auth' && !auth.user) && <UserMenu navigate={navigate} />}
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[980px] flex-1 px-4 pb-24 pt-2 outline-none sm:px-5 md:pb-10 lg:px-8"
        >
          {children}
        </main>

        <footer className="px-4 pb-24 text-center text-xs font-bold text-muted sm:px-5 md:pb-6 lg:px-8">
          热点雷达 · 数据来自各平台公开热榜与 Hacker News,仅供个人学习参考
        </footer>
      </div>

      <MobileNav page={page} navigate={navigate} />
    </div>
  );
}
