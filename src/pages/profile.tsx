import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Avatar } from '../components/avatar';
import { AuthRequired } from '../components/auth-required';
import { Button, Card, SectionTitle, Spinner } from '../components/ui';
import {
  ChartIcon,
  CheckIcon,
  LockIcon,
  LogoutIcon,
  MailIcon,
  UploadIcon,
  UserIcon,
  XIcon,
} from '../components/icons';

async function compressAvatar(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片格式无法识别'));
    img.src = dataUrl;
  });

  const size = Math.min(128, Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('图片处理失败');
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, size, size);
  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

export default function ProfilePage({ navigate }: { navigate: (to: string) => void }) {
  const auth = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!auth.user) return;
    setNickname(auth.user.nickname);
    setBio(auth.user.bio);
    setAvatar(auth.user.avatar);
  }, [auth.user]);

  if (!auth.ready) {
    return (
      <div className="mx-auto flex max-w-xl items-center justify-center py-20">
        <Card className="flex items-center gap-3 px-6 py-5">
          <Spinner className="size-5 text-accent" />
          <span className="text-sm font-bold text-ink-soft">正在读取资料…</span>
        </Card>
      </div>
    );
  }

  if (!auth.user) {
    return <AuthRequired navigate={navigate} next="profile" title="先登录，再编辑资料" />;
  }

  const lastLoginText = auth.lastLogin?.created_at
    ? `${auth.lastLogin.location || '未知地点'} · ${auth.lastLogin.created_at.slice(0, 16).replace('T', ' ')}`
    : '还没有记录';

  async function pickAvatar(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice({ kind: 'err', text: '请选择一张图片' });
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setNotice({ kind: 'err', text: '图片太大了，换一张小于 6MB 的' });
      return;
    }
    try {
      const compressed = await compressAvatar(file);
      if (compressed.length > 32 * 1024) {
        setNotice({ kind: 'err', text: '头像压缩后仍然太大，换一张试试' });
        return;
      }
      setAvatar(compressed);
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'err', text: error instanceof Error ? error.message : '图片处理失败' });
    }
  }

  async function save() {
    if (!nickname.trim()) {
      setNotice({ kind: 'err', text: '昵称不能为空' });
      return;
    }
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await auth.saveProfile({ nickname: nickname.trim(), avatar, bio: bio.trim() });
      setNotice({ kind: 'ok', text: '资料已经保存' });
    } catch (error) {
      setNotice({ kind: 'err', text: error instanceof Error ? error.message : '保存失败，稍后再试' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl animate-rise space-y-4">
      <SectionTitle title="我的名片" desc="昵称、头像和签名会出现在对话室里" />

      <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Avatar person={{ nickname, avatar, email: auth.user.email }} size={72} />
            <div className="min-w-0">
              <p className="truncate text-lg font-black">{nickname || auth.user.nickname}</p>
              <p className="truncate text-xs font-semibold text-muted">{auth.user.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => fileRef.current?.click()}>
                  <UploadIcon className="size-3.5" /> 上传头像
                </Button>
                {avatar && (
                  <Button size="sm" variant="ghost" onClick={() => setAvatar('')}>
                    <XIcon className="size-3.5" /> 恢复默认
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                aria-label="选择头像图片"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void pickAvatar(file);
                }}
              />
            </div>
          </div>

          <div className="mt-5 space-y-3.5">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">昵称</span>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={24}
                placeholder="在雷达上怎么称呼你"
                className="h-9.5 w-full rounded-btn border-[3px] border-ink bg-surface px-3 text-sm font-bold text-ink outline-none transition-all duration-100 placeholder:font-medium placeholder:text-muted focus:shadow-toon-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">签名</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={80}
                rows={3}
                placeholder="一句话介绍自己，或者写下最近在关注什么"
                className="w-full resize-none rounded-btn border-[3px] border-ink bg-surface px-3 py-2 text-sm font-bold leading-relaxed text-ink outline-none transition-all duration-100 placeholder:font-medium placeholder:text-muted focus:shadow-toon-sm"
              />
              <span className="mt-1 block text-right font-mono text-[10px] font-bold text-muted">
                {bio.length}/80
              </span>
            </label>

            {notice && (
              <p
                role={notice.kind === 'err' ? 'alert' : 'status'}
                className={`flex items-center gap-1.5 rounded-btn border-[2.5px] px-3 py-2 text-xs font-bold ${
                  notice.kind === 'err'
                    ? 'border-danger/50 bg-accent-soft text-danger'
                    : 'border-teal/40 bg-teal-soft text-teal'
                }`}
              >
                {notice.kind === 'err' ? (
                  <XIcon className="size-3.5" />
                ) : (
                  <CheckIcon className="size-3.5" />
                )}
                {notice.text}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="primary" disabled={busy} onClick={() => void save()}>
                {busy ? <Spinner className="size-4" /> : <CheckIcon className="size-4" />}
                {busy ? '保存中…' : '保存资料'}
              </Button>
              <Button onClick={() => navigate('chat')}>去对话室</Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-9 -rotate-3 place-items-center rounded-blob-1 border-toon bg-blue-soft shadow-toon-sm">
                <UserIcon className="size-5" />
              </span>
              <h3 className="text-sm font-black">账号</h3>
              {auth.user.isAdmin && (
                <span className="ml-auto rounded-full border-toon-sm bg-yellow px-2 py-px text-[10px] font-black">
                  管理员
                </span>
              )}
            </div>
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex items-start gap-2">
                <dt className="shrink-0 font-bold text-muted">
                  <MailIcon className="mr-1 inline size-3.5" /> 邮箱
                </dt>
                <dd className="min-w-0 break-all text-right font-bold text-ink">{auth.user.email}</dd>
              </div>
              <div className="flex items-start gap-2">
                <dt className="shrink-0 font-bold text-muted">
                  <LockIcon className="mr-1 inline size-3.5" /> 上次登录
                </dt>
                <dd className="min-w-0 text-right font-bold text-ink">{lastLoginText}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigate('dashboard')}>
                <ChartIcon className="size-3.5" /> 数据看板
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  void auth.logout().then(() => navigate('boards'));
                }}
              >
                <LogoutIcon className="size-3.5" /> 退出登录
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-black">一个小小的提示</h3>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-muted">
              昵称和头像会随发言一起展示。换成你最近关注的热点，也许更容易遇到同好。
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
