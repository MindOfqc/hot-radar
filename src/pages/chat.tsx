import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { api, type ChatMessage } from '../lib/api';
import { AuthRequired } from '../components/auth-required';
import { Avatar } from '../components/avatar';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { ChatIcon, RefreshIcon, SendIcon, ShieldIcon } from '../components/icons';

function chatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.toDateString() === now.toDateString()) return time;
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

export default function ChatPage({ navigate }: { navigate: (to: string) => void }) {
  const auth = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);
  const nearBottomRef = useRef(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await api<{ messages: ChatMessage[] }>('/api/chat?limit=100');
      if (!aliveRef.current) return;
      setMessages(Array.isArray(response.messages) ? response.messages : []);
      setError('');
    } catch (cause) {
      if (!aliveRef.current) return;
      setError(cause instanceof Error ? cause.message : '对话室暂时进不去');
    } finally {
      if (aliveRef.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (!auth.user) {
      setLoading(false);
      return () => {
        aliveRef.current = false;
      };
    }
    void load(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 15_000);
    return () => {
      aliveRef.current = false;
      window.clearInterval(timer);
    };
  }, [auth.user, load]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !nearBottomRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  const count = useMemo(() => messages.length, [messages]);

  async function send() {
    const content = text.trim();
    if (!content || sending || cooldown > 0) return;
    setSending(true);
    setError('');
    try {
      const response = await api<{ message: ChatMessage }>('/api/chat', {
        method: 'POST',
        body: { content },
      });
      setMessages((current) => [...current, response.message]);
      nearBottomRef.current = true;
      setText('');
      setCooldown(3);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发送失败，稍后再试');
    } finally {
      setSending(false);
    }
  }

  if (!auth.ready) {
    return (
      <div className="mx-auto flex max-w-xl items-center justify-center py-20">
        <Card className="flex items-center gap-3 px-6 py-5">
          <Spinner className="size-5 text-accent" />
          <span className="text-sm font-bold text-ink-soft">正在进入对话室…</span>
        </Card>
      </div>
    );
  }

  if (!auth.user) {
    return <AuthRequired navigate={navigate} next="chat" title="登录后进入对话室" />;
  }

  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2.5 border-b-[3px] border-dashed border-ink/20 px-5 pb-3 pt-4">
          <span className="grid size-9 -rotate-6 place-items-center rounded-blob-1 border-toon bg-teal-soft shadow-toon-sm">
            <ChatIcon className="size-5" />
          </span>
          <div>
            <h2 className="text-[17px] font-black leading-tight">雷达茶水间</h2>
            <p className="font-mono text-[10px] font-black tracking-[2px] text-muted">RADAR LOUNGE</p>
          </div>
          <span className="ml-auto rounded-full border-toon-sm bg-yellow-soft px-2 py-px font-mono text-[10px] font-black text-ink-soft">
            {count} 条
          </span>
          <Button size="sm" variant="secondary" onClick={() => void load(false)} disabled={loading}>
            {loading ? <Spinner className="size-3.5" /> : <RefreshIcon className="size-3.5" />}
            刷新
          </Button>
        </div>

        <div
          ref={listRef}
          className="h-[clamp(220px,44vh,520px)] overflow-y-auto px-4 py-4 sm:px-5"
          aria-live="polite"
          onScroll={(event) => {
            const el = event.currentTarget;
            nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {loading && messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-6 text-accent" />
            </div>
          )}

          {!loading && error && messages.length === 0 && (
            <EmptyState
              icon={<ChatIcon className="size-7" />}
              title="对话室暂时进不去"
              desc={error}
              action={
                <Button size="sm" onClick={() => void load(false)}>
                  再试一次
                </Button>
              }
            />
          )}

          {!loading && !error && messages.length === 0 && (
            <EmptyState
              icon={<ChatIcon className="size-7" />}
              title="还没人开口"
              desc="聊聊最近在追的热点，或者给雷达提点建议。"
            />
          )}

          {messages.length > 0 && (
            <div className="space-y-3.5">
              {messages.map((message) => {
                const mine = message.userId === auth.user?.id;
                return (
                  <div
                    key={message.id}
                    className={`flex items-start gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}
                  >
                    <Avatar
                      person={{ nickname: message.nickname, avatar: message.avatar }}
                      size={32}
                      className={mine ? 'rotate-3' : '-rotate-2'}
                    />
                    <div className={`min-w-0 max-w-[78%] ${mine ? 'text-right' : ''}`}>
                      <div
                        className={`mb-1 flex items-baseline gap-2 text-[11px] font-bold text-muted ${
                          mine ? 'justify-end' : ''
                        }`}
                      >
                        <span className="font-black text-ink-soft">{mine ? '我' : message.nickname}</span>
                        {message.isAdmin && (
                          <span className="inline-flex items-center gap-0.5 self-center rounded-full border-toon-sm bg-yellow px-1.5 py-px text-[10px] font-black text-ink">
                            <ShieldIcon className="size-3" />
                            管理员
                          </span>
                        )}
                        <span className="font-mono text-[10px]">{chatTime(message.createdAt)}</span>
                      </div>
                      <div
                        className={`inline-block whitespace-pre-wrap break-words rounded-[16px_18px_16px_20px] border-[2.5px] px-3.5 py-2 text-left text-[13px] font-semibold leading-relaxed ${
                          message.isAdmin
                            ? 'border-ink bg-yellow-soft text-ink shadow-toon-sm'
                            : mine
                              ? 'border-ink/80 bg-accent-soft text-ink'
                              : 'border-ink/25 bg-paper text-ink-soft'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {error && messages.length > 0 && (
            <p role="alert" className="mt-3 text-center text-xs font-bold text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="border-t-[3px] border-dashed border-ink/20 bg-surface px-4 py-3 sm:px-5">
          <div className="flex items-end gap-2">
            <input
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 500))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              maxLength={500}
              placeholder="说点什么…"
              aria-label="对话内容"
              className="h-10 min-w-0 flex-1 rounded-btn border-[3px] border-ink bg-paper px-3 text-sm font-semibold text-ink outline-none transition-all duration-100 placeholder:font-medium placeholder:text-muted focus:bg-surface focus:shadow-toon-sm"
            />
            <Button
              variant="primary"
              className="h-10 shrink-0"
              disabled={sending || cooldown > 0 || !text.trim()}
              onClick={() => void send()}
            >
              {sending ? <Spinner className="size-4" /> : <SendIcon className="size-4" />}
              {cooldown > 0 ? `${cooldown}s` : '发送'}
            </Button>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold text-muted">
            <span>15 秒自动刷新</span>
            <span className="font-mono">{text.length}/500</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
