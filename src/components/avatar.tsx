import type { CSSProperties } from 'react';
import { ShieldIcon } from './icons';

const TONES = [
  { bg: 'bg-accent-soft', text: 'text-accent-deep' },
  { bg: 'bg-teal-soft', text: 'text-teal' },
  { bg: 'bg-yellow-soft', text: 'text-ink' },
  { bg: 'bg-blue-soft', text: 'text-blue' },
];

function toneFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

export interface AvatarPerson {
  nickname?: string;
  avatar?: string;
  email?: string;
}

export function Avatar({
  person,
  size = 36,
  className = '',
  admin = false,
}: {
  person: AvatarPerson;
  size?: number;
  className?: string;
  admin?: boolean;
}) {
  const label = (person.nickname || person.email || '雷').trim().slice(0, 1).toUpperCase();
  const avatar = person.avatar?.trim() ?? '';
  const isImage = avatar.startsWith('data:image/') || /^https?:\/\//i.test(avatar);
  const style: CSSProperties = { width: size, height: size };
  const frame = admin ? 'avatar-admin-frame' : '';

  const tone = toneFor(person.nickname || person.email || 'radar');

  const inner = isImage ? (
    <img
      src={avatar}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`shrink-0 rounded-blob-1 border-toon-sm bg-surface object-cover ${frame} ${className}`}
      style={style}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-blob-1 border-toon-sm font-black ${tone.bg} ${tone.text} ${frame} ${className}`}
      style={{ ...style, fontSize: Math.max(11, Math.round(size * 0.4)) }}
    >
      {label}
    </span>
  );

  if (!admin) return inner;

  return (
    <span className="relative inline-flex shrink-0">
      {inner}
      <span
        aria-hidden="true"
        className="avatar-admin-corner absolute -bottom-1.5 -right-1.5 grid size-[15px] place-items-center rounded-full border-toon-sm bg-yellow text-ink"
      >
        <ShieldIcon className="size-2.5" />
      </span>
    </span>
  );
}
