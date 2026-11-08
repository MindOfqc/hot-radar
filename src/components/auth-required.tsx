import { Button, Card } from './ui';
import { LockIcon, RadarIcon, UserIcon } from './icons';

export function AuthRequired({
  navigate,
  next,
  title = '登录后继续',
  desc = '登录账号后，这里才会为你打开。',
}: {
  navigate: (to: string) => void;
  next: string;
  title?: string;
  desc?: string;
}) {
  return (
    <div className="mx-auto max-w-lg animate-rise">
      <Card className="p-7 text-center">
        <span className="mx-auto grid size-14 -rotate-6 place-items-center rounded-blob-1 border-toon bg-accent shadow-toon-sm">
          <RadarIcon className="size-8" />
        </span>
        <h2 className="mt-4 text-xl font-black">{title}</h2>
        <p className="mx-auto mt-1 max-w-xs text-[13px] font-semibold leading-relaxed text-muted">{desc}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => navigate(`auth?next=${encodeURIComponent(next)}`)}>
            <LockIcon className="size-4" /> 登录 / 注册
          </Button>
          <Button onClick={() => navigate('boards')}>
            <UserIcon className="size-4" /> 先逛热榜
          </Button>
        </div>
      </Card>
    </div>
  );
}
