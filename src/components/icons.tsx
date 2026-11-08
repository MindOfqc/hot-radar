/* 多彩手绘图标:抖动墨线轮廓 + 马克笔多色填充 + 笔画出头/复线,viewBox 统一 0 0 24 24。
   功能图标(勾/叉/刷新/加号等)保留 currentColor,以继承按钮文字色与语义色(text-ok/text-danger)。 */

const INK = '#3B2F2A';
const ORANGE = '#FF6B35';
const DEEP = '#E8501A';
const ORANGE_SOFT = '#FFE3D3';
const YELLOW = '#FFC94D';
const YELLOW_SOFT = '#FFF3D6';
const TEAL = '#2A9D8F';
const TEAL_SOFT = '#DDF3EF';
const BLUE = '#4D96FF';
const BLUE_SOFT = '#E3EEFF';
const CREAM = '#FFFDF7';

interface IconProps {
  className?: string;
}

type P = IconProps & React.SVGProps<SVGSVGElement>;

function base(props: P) {
  return {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    ...props,
  };
}

/** Logo 雷达:白色描边,置于橙色气泡底盒内使用 */
export function RadarIcon(props: P) {
  return (
    <svg {...base(props)} stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.7 12c.5-.4 1.3-.2 1.5.4.2.6-.3 1.2-1 1.1-.6 0-.9-.9-.5-1.5z" fill="#fff" stroke="none" />
      <path d="M12.3 11.7 17 7.1" />
      <path d="M12.1 5.1c4-.3 7.1 3.1 6.8 7" />
      <path d="M12.2 8.5c2-.1 3.7 1.5 3.5 3.6" />
      <path d="M11.9 18.9c-4 .1-7.1-3.2-6.8-7.1" />
      <path d="M11.8 15.5c-2 .1-3.7-1.5-3.5-3.6" />
      <circle cx="17.6" cy="7.4" r="1.05" fill="#fff" stroke="none" />
    </svg>
  );
}

/** 火焰:热榜/热度 */
export function FlameIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path
        d="M12.4 2.7c.4 2.3 3 3.4 4 5.7 1.1 2.4.8 5.4-.9 7.3-1.8 2-4.7 2.5-7.1 1.4-2.3-1.1-3.8-3.5-3.5-6 .2-1.9 1.2-3.4 2.5-4.6.2 1.1.9 2 1.9 2.3-.3-2.2.4-4.4 1.6-6.1z"
        fill={ORANGE}
        stroke={INK}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <path
        d="M12.1 11.9c1.2 1.2 2 2.6 1.7 4-.2 1.4-1.4 2.3-2.8 2.2-1.3-.1-2.3-1.3-2.1-2.7.2-1.3 2-2.3 3.2-3.5z"
        fill={YELLOW}
        stroke={INK}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <path d="M6.7 9.6c-.7 1.3-1 2.8-.8 4.2" fill="none" stroke={DEEP} strokeWidth={1.1} strokeLinecap="round" opacity={0.5} />
      <path d="M18.6 4.4l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z" fill={YELLOW} stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
    </svg>
  );
}

/** 靶心:关键词监控 */
export function TargetIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path
        d="M11.8 3.5c4.8-.4 8.9 3.6 8.6 8.4-.3 4.7-3.9 8.4-8.7 8.3-4.6-.1-8.4-3.9-8.2-8.6.2-4.5 3.7-8 8.3-8.1z"
        fill={TEAL_SOFT}
        stroke={INK}
        strokeWidth={1.9}
      />
      <path
        d="M12 7.3c2.7-.2 4.9 2 4.7 4.7-.2 2.6-2.2 4.5-4.8 4.4-2.5-.1-4.5-2.1-4.4-4.7.1-2.5 2-4.3 4.5-4.4z"
        fill={TEAL}
        stroke={INK}
        strokeWidth={1.5}
      />
      <path d="M11.9 10.4c1-.1 1.8.7 1.7 1.7-.1.9-.8 1.6-1.8 1.5-.9 0-1.6-.8-1.5-1.7 0-.9.7-1.5 1.6-1.5z" fill={YELLOW} stroke={INK} strokeWidth={1.2} />
      <path d="M6.6 6.4c.9-.8 1.9-1.4 3-1.7" fill="none" stroke={CREAM} strokeWidth={1.3} strokeLinecap="round" opacity={0.8} />
    </svg>
  );
}

/** 放大镜:全网搜索 */
export function SearchIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path
        d="M10.9 4.2c3.6-.2 6.7 2.8 6.5 6.4-.1 3.5-3.1 6.4-6.6 6.2-3.5-.1-6.3-3-6.1-6.5.2-3.4 2.9-6 6.2-6.1z"
        fill={BLUE_SOFT}
        stroke={INK}
        strokeWidth={1.9}
      />
      <path d="M15.9 16c1.5 1.4 2.7 2.7 4 4.1" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M8.1 8.7c.6-1 1.7-1.7 2.9-1.8" fill="none" stroke={CREAM} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx="13.4" cy="13.2" r="1" fill={ORANGE} opacity={0.85} />
    </svg>
  );
}

/** 齿轮:设置 */
export function GearIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path
        d="M12.1 3.4l1.4 2.2 2.6-.5.8 2.5 2.5.8-.7 2.5 1.9 1.8-1.9 1.8.7 2.5-2.5.8-.8 2.5-2.6-.5-1.4 2.2-1.5-2.2-2.6.5-.8-2.5-2.5-.8.7-2.5L3.2 12l1.9-1.8-.7-2.5 2.5-.8.8-2.5 2.6.5z"
        fill={YELLOW}
        stroke={INK}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <path d="M12 9.1c1.7-.1 3 1.2 2.9 2.9-.1 1.6-1.3 2.9-3 2.8-1.6 0-2.9-1.3-2.8-3 0-1.6 1.3-2.7 2.9-2.7z" fill={CREAM} stroke={INK} strokeWidth={1.5} />
      <circle cx="12" cy="12" r="1" fill={ORANGE} />
    </svg>
  );
}

/** 铃铛:铃身填充随场景(顶栏白、强调黄) */
export function BellIcon({ bodyFill = YELLOW, ...props }: P & { bodyFill?: string }) {
  return (
    <svg {...base(props)}>
      <path
        d="M12 3.9c-3.2-.1-5.1 2.5-5 5.6 0 2.9-.9 4.2-1.9 5.4-.3.4 0 1 .5 1h12.8c.5 0 .8-.6.5-1-1-1.2-1.9-2.5-1.8-5.4 0-3.1-2-5.6-5.1-5.6z"
        fill={bodyFill}
        stroke={INK}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <path d="M10.8 3.7c.4-.7 2-.7 2.4 0" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M9.9 18.5c.3 1.1 1.1 1.7 2.1 1.7s1.8-.6 2.1-1.7" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      <path d="M8.9 7.6c-.6 1-.9 2.2-.9 3.4" fill="none" stroke={CREAM} strokeWidth={1.2} strokeLinecap="round" opacity={0.75} />
    </svg>
  );
}

/** 刷新:描边跟随文字色 */
export function RefreshIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.4 8.7C18 5.6 14.6 3.9 11.3 4.6 8.7 5.1 6.6 6.9 5.7 9.2" />
      <path d="M4.2 3.1l.3 3.8 3.7-.5" />
      <path d="M4.6 15.3c1.4 3.1 4.8 4.8 8.1 4.1 2.6-.5 4.7-2.3 5.6-4.6" />
      <path d="M19.8 20.9l-.3-3.8-3.7.5" />
    </svg>
  );
}

/** 手绘星星:fill 可换色(装饰用 teal/orange) */
export function SparkIcon({ fill = YELLOW, ...props }: P & { fill?: string }) {
  return (
    <svg {...base(props)}>
      <path
        d="M12 2.9c.6 3.4 1.4 5.2 2.6 6.1 1.2.9 3 1.5 6.5 2-3.5.6-5.3 1.2-6.5 2.1-1.2.9-2 2.7-2.6 6.1-.6-3.4-1.4-5.2-2.6-6.1-1.2-.9-3-1.5-6.5-2.1 3.5-.5 5.3-1.1 6.5-2 1.2-.9 2-2.7 2.6-6.1z"
        fill={fill}
        stroke={INK}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      <path d="M12 4.8c-.2 4.9-.2 9.6.1 14.4" />
      <path d="M4.8 12c4.9.2 9.6.2 14.4-.1" />
    </svg>
  );
}

export function TrashIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M4.7 7c4.9-.3 9.7-.3 14.6 0M9.6 6.8V4.6c1.7-.2 3.4-.2 4.9 0v2.2" fill={YELLOW} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      <path
        d="M6.3 7.2l.9 12.2c2.9.3 5.7.3 8.6 0l.9-12.2"
        fill={ORANGE_SOFT}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.1 10.4v6.1M13.9 10.4v6.1" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" opacity={0.55} />
    </svg>
  );
}

export function PauseIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      <path d="M9.2 5.4c-.3 4.5-.3 8.9 0 13.2" />
      <path d="M14.8 5.4c.3 4.5.3 8.9 0 13.2" />
    </svg>
  );
}

export function PlayIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <path d="M8.2 5.6c3.6 2 7 4.1 10.3 6.4-3.3 2.3-6.7 4.4-10.3 6.4-.2-4.3-.2-8.5 0-12.8z" />
    </svg>
  );
}

export function XIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      <path d="M6.2 6.1c4 3.9 7.9 7.9 11.7 11.9" />
      <path d="M17.9 6.1C14 10 10.1 14 6.2 18" />
    </svg>
  );
}

export function CheckIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.6 12.6c1.6 1.4 3 3 4.3 4.7 3.4-4.6 7-8.6 10.6-11.4" />
    </svg>
  );
}

export function ExternalIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.8 4.7h5.5v5.5" />
      <path d="M19.1 4.9 11.4 12.6" />
      <path d="M18.4 13.9v4.3c0 .8-.6 1.3-1.3 1.3H6c-.8 0-1.3-.6-1.3-1.3V7c0-.8.6-1.3 1.3-1.3h4.3" />
    </svg>
  );
}

export function DownloadIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.6c-.2 3.9-.2 7.6 0 11.2" />
      <path d="M7.6 10.6 12 15l4.4-4.4" />
      <path d="M4.6 17.9v2.4c5 .2 9.9.2 14.8 0v-2.4" />
    </svg>
  );
}

export function UploadIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15.2c-.2-3.9-.2-7.6 0-11.2" />
      <path d="M7.6 8.4 12 4l4.4 4.4" />
      <path d="M4.6 17.9v2.4c5 .2 9.9.2 14.8 0v-2.4" />
    </svg>
  );
}

export function CopyIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 8.6h6.7c1.1 0 2 .9 2 2v6.7c0 1.1-.9 2-2 2H9.5c-1.1 0-2-.9-2-2v-6.7c0-1.1.9-2 2-2z" />
      <path d="M15.4 8.6V6.8c0-1.1-.9-2-2-2H6.7c-1.1 0-2 .9-2 2v6.7c0 1.1.9 2 2 2h1.8" />
    </svg>
  );
}

export function FileTextIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M6.7 3.6h6.8l4 4v12.8H6.7z" fill={YELLOW_SOFT} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M13.5 3.6v4h4" fill={CREAM} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M9.3 12h5.4" stroke={ORANGE} strokeWidth={1.5} strokeLinecap="round" />
      <path d="M9.3 15h5.4" stroke={TEAL} strokeWidth={1.5} strokeLinecap="round" />
      <path d="M9.3 18h3.6" stroke={BLUE} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function KeyIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M8.1 11.3c2.4-.1 4.3 1.9 4.2 4.3-.1 2.3-2 4.2-4.4 4.1-2.3-.1-4.2-2-4.1-4.4.1-2.3 2-4 4.3-4z" fill={ORANGE_SOFT} stroke={INK} strokeWidth={1.8} />
      <circle cx="8" cy="15.5" r="1.5" fill={CREAM} stroke={INK} strokeWidth={1.2} />
      <path d="m11.2 12.4 8.4-8.4" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <path d="M16.5 7.1l2.3 2.3M14.1 4.7l2.3 2.3" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      <path d="m13.6 10 1.5 1.5" stroke={YELLOW} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

export function DatabaseIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M4.7 6v12c0 1.5 3.3 2.7 7.3 2.7s7.3-1.2 7.3-2.7V6" fill={CREAM} stroke="none" transform="translate(0.6 0.7)" />
      <path d="M4.7 6v12c0 1.5 3.3 2.7 7.3 2.7s7.3-1.2 7.3-2.7V6" fill="none" stroke={INK} strokeWidth={1.8} />
      <path d="M4.7 12c0 1.5 3.3 2.7 7.3 2.7s7.3-1.2 7.3-2.7" fill="none" stroke={INK} strokeWidth={1.7} />
      <path d="M4.8 5.9c0-1.5 3.2-2.7 7.2-2.7s7.2 1.2 7.2 2.7-3.2 2.7-7.2 2.7S4.8 7.4 4.8 5.9z" fill={TEAL_SOFT} stroke="none" transform="translate(0.5 0.6)" />
      <path d="M4.8 5.9c0-1.5 3.2-2.7 7.2-2.7s7.2 1.2 7.2 2.7-3.2 2.7-7.2 2.7S4.8 7.4 4.8 5.9z" fill="none" stroke={INK} strokeWidth={1.8} />
      <circle cx="8.6" cy="16.6" r="0.95" fill={ORANGE} />
      <circle cx="12" cy="17" r="0.95" fill={BLUE} />
      <circle cx="15.4" cy="16.6" r="0.95" fill={TEAL} />
    </svg>
  );
}

export function ShieldIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <path d="M11.9 3.1 5 5.5v6c-.1 4.4 2.9 7.5 6.9 9.4 4.1-1.9 7.1-5 7-9.4v-6z" />
    </svg>
  );
}

export function GithubIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 2.8a9.2 9.2 0 0 0-2.9 17.9c.5.1.6-.2.6-.4v-1.7c-2.6.6-3.1-1.1-3.1-1.1-.4-1-1-1.3-1-1.3-.9-.6.1-.6.1-.6.9.1 1.4 1 1.4 1 .8 1.5 2.2 1 2.7.8.1-.6.3-1 .6-1.3-2-.2-4.2-1-4.2-4.6 0-1 .4-1.8 1-2.5-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.5 1 2.5 0 3.6-2.2 4.4-4.3 4.6.3.3.6.9.6 1.8v2.7c0 .2.2.5.7.4A9.2 9.2 0 0 0 12 2.8Z" />
    </svg>
  );
}

/** 柱状图:数据看板 */
export function ChartIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M4.2 20.4c5.5.2 11 .2 16.3 0" stroke={INK} strokeWidth={1.9} strokeLinecap="round" />
      <path d="M5.4 12.5 8.8 12.3 9 19.6 5.6 19.7Z" fill={TEAL_SOFT} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M10.3 7.5 13.7 7.3 13.9 19.6 10.5 19.7Z" fill={ORANGE_SOFT} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M15.2 10.3 18.6 10.1 18.8 19.6 15.4 19.7Z" fill={YELLOW_SOFT} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M6.4 9.6 11 5.8l3.2 2.1 3.7-4" stroke={ORANGE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="6.4" cy="9.6" r="1.1" fill={YELLOW} stroke={INK} strokeWidth={1.2} />
      <circle cx="17.9" cy="3.9" r="1.1" fill={TEAL} stroke={INK} strokeWidth={1.2} />
    </svg>
  );
}

/** 对话气泡:对话室 */
export function ChatIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path
        d="M4.5 6.4c5-.2 10-.2 15 0v9c-2.6.1-5.3.1-7.9.1l-4.2 3.7v-3.7c-1 .1-2 .1-2.9 0z"
        fill={CREAM}
        stroke={INK}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx="8.8" cy="11" r="1.15" fill={ORANGE} />
      <circle cx="12" cy="11" r="1.15" fill={TEAL} />
      <circle cx="15.2" cy="11" r="1.15" fill={BLUE} />
      <path d="M7.4 8.6c3.2-.1 6.3-.1 9.4 0" stroke={INK} strokeWidth={1.1} strokeLinecap="round" opacity={0.3} />
    </svg>
  );
}

/** 单人:个人资料 */
export function UserIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 4.4c2.2-.1 3.9 1.7 3.8 3.9-.1 2.1-1.8 3.8-4 3.7-2.1 0-3.8-1.8-3.7-4 .1-2 1.8-3.6 3.9-3.6z" fill={ORANGE_SOFT} stroke={INK} strokeWidth={1.8} />
      <path
        d="M4.9 20.2c.5-3.6 3.4-6 7.1-6s6.6 2.4 7.1 6"
        fill={TEAL_SOFT}
        stroke={INK}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <circle cx="10.6" cy="8.1" r="0.55" fill={INK} />
      <circle cx="13.5" cy="8.1" r="0.55" fill={INK} />
      <path d="M10.5 9.7c.9.7 2.2.7 3.1 0" fill="none" stroke={INK} strokeWidth={1} strokeLinecap="round" />
      <circle cx="12" cy="17.4" r="0.9" fill={YELLOW} stroke={INK} strokeWidth={0.9} />
    </svg>
  );
}

/** 双人:社区成员 */
export function UsersIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M9.2 5.4c1.8-.1 3.2 1.4 3.1 3.2-.1 1.7-1.5 3.1-3.3 3-1.7 0-3.1-1.5-3-3.2.1-1.7 1.5-3 3.2-3z" fill={ORANGE_SOFT} stroke={INK} strokeWidth={1.6} />
      <path d="M3.5 19.4c.4-3 2.7-5 5.7-5s5.3 2 5.7 5" fill={TEAL_SOFT} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M16.6 7.3c1.4-.1 2.4 1 2.3 2.4-.1 1.3-1.1 2.3-2.5 2.2-1.3 0-2.3-1.1-2.2-2.4.1-1.3 1.1-2.2 2.4-2.2z" fill={YELLOW_SOFT} stroke={INK} strokeWidth={1.4} />
      <path d="M15.1 14.9c2.8-.5 5.1 1.3 5.5 4.1" fill={BLUE_SOFT} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

/** 纸飞机:发送 */
export function SendIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.9 11.4 20.1 4.3 14 20l-3.2-5.4z" />
      <path d="M20.1 4.3 10.8 14.6" />
    </svg>
  );
}

/** 信封:邮箱 */
export function MailIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M5.8 5.9h12.4c1.2 0 2.1.9 2.1 2.1v8.1c0 1.2-.9 2.1-2.1 2.1H5.8c-1.2 0-2.1-.9-2.1-2.1V8c0-1.2.9-2.1 2.1-2.1z" fill={YELLOW_SOFT} stroke="none" transform="translate(0.7 0.8)" />
      <path d="M5.8 5.9h12.4c1.2 0 2.1.9 2.1 2.1v8.1c0 1.2-.9 2.1-2.1 2.1H5.8c-1.2 0-2.1-.9-2.1-2.1V8c0-1.2.9-2.1 2.1-2.1z" fill="none" stroke={INK} strokeWidth={1.8} />
      <path d="m4.9 7.5 7.1 5.4 7.1-5.4" fill="none" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx="17.2" cy="14.4" r="1.8" fill={ORANGE} stroke={INK} strokeWidth={1.2} />
      <path d="M17.2 13.5v1.8M16.3 14.4h1.8" stroke={CREAM} strokeWidth={1} strokeLinecap="round" />
    </svg>
  );
}

/** 锁:密码 */
export function LockIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M7.5 10.3h9c1.2 0 2.1.9 2.1 2.1v5.3c0 1.2-.9 2.1-2.1 2.1h-9c-1.2 0-2.1-.9-2.1-2.1v-5.3c0-1.2.9-2.1 2.1-2.1z" fill={BLUE_SOFT} stroke="none" transform="translate(0.7 0.8)" />
      <path d="M7.5 10.3h9c1.2 0 2.1.9 2.1 2.1v5.3c0 1.2-.9 2.1-2.1 2.1h-9c-1.2 0-2.1-.9-2.1-2.1v-5.3c0-1.2.9-2.1 2.1-2.1z" fill="none" stroke={INK} strokeWidth={1.8} />
      <path d="M8.4 10.3V8.1c0-2 1.6-3.7 3.6-3.7s3.6 1.7 3.6 3.7v2.2" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      <circle cx="12" cy="14.6" r="1.5" fill={YELLOW} stroke={INK} strokeWidth={1.2} />
      <path d="M12 16v1.6" stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

/** 出口:退出登录 */
export function LogoutIcon(props: P) {
  return (
    <svg {...base(props)} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.4 4.6H5.3v14.8h4.1" />
      <path d="M14 8.1l3.9 3.9-3.9 3.9" />
      <path d="M17.7 12H9" />
    </svg>
  );
}