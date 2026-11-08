import type { CSSProperties } from 'react';

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
}: {
  person: AvatarPerson;
  size?: number;
  className?: string;
}) {
  const label = (person.nickname || person.email || '雷').trim().slice(0, 1).toUpperCase();
  const avatar = person.avatar?.trim() ?? '';
  const isImage = avatar.startsWith('data:image/') || /^https?:\/\//i.test(avatar);
  const style: CSSProperties = { width: size, height: size };

  if (isImage) {
    return (
      <img
        src={avatar}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-blob-1 border-toon-sm bg-surface object-cover ${className}`}
        style={style}
      />
    );
  }

  const tone = toneFor(person.nickname || person.email || 'radar');
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-blob-1 border-toon-sm font-black ${tone.bg} ${tone.text} ${className}`}
      style={{ ...style, fontSize: Math.max(11, Math.round(size * 0.4)) }}
    >
      {label}
    </span>
  );
}
