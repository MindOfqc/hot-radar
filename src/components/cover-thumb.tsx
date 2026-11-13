import { useEffect, useState } from 'react';

export function CoverThumb({
  cover,
  size = 'size-10',
  className = '',
  onFail,
}: {
  cover?: string;
  size?: string;
  className?: string;
  onFail?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [cover]);

  if (!cover || failed) return null;

  return (
    <img
      src={cover}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setFailed(true);
        onFail?.();
      }}
      className={`shrink-0 rounded-btn border-toon-sm object-cover ${size} ${className}`}
    />
  );
}