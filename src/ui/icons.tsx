import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function stroke({ size = 14, ...rest }: IconProps, children: React.ReactNode, width = 2) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ChevronDown = (p: IconProps) => stroke(p, <path d="M6 9l6 6 6-6" />, 2.5);
export const ChevronLeft = (p: IconProps) => stroke(p, <path d="M15 18l-6-6 6-6" />);
export const ChevronRight = (p: IconProps) => stroke(p, <path d="M9 18l6-6-6-6" />);
export const PlusIcon = (p: IconProps) => stroke(p, <path d="M12 5v14M5 12h14" />);
export const MinusIcon = (p: IconProps) => stroke(p, <path d="M5 12h14" />);
export const CloseIcon = (p: IconProps) => stroke(p, <path d="M6 6l12 12M18 6L6 18" />, 2.6);
export const CameraIcon = (p: IconProps) => stroke(p, <path d="M3 7h11v10H3zM14 10l7-4v12l-7-4" />, 1.8);
export const UploadIcon = (p: IconProps) => stroke(p, <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />, 2.2);
export const DownloadIcon = (p: IconProps) => stroke(p, <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />, 2.2);
export const CopyIcon = (p: IconProps) =>
  stroke(p, <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 011-1h9" /></>);
export const LinkIcon = (p: IconProps) =>
  stroke(p, <><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" /></>, 2.2);
export const FileIcon = (p: IconProps) => stroke(p, <><path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z" /><path d="M14 3v5h5" /></>);
export const SearchIcon = (p: IconProps) => stroke(p, <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>);
export const SettingsIcon = (p: IconProps) =>
  stroke(p, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>, 1.8);
export const ClockIcon = (p: IconProps) => stroke(p, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const PlayIcon = ({ size = 11, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <path d="M7 4l13 8-13 8z" />
  </svg>
);
export const CheckIcon = (p: IconProps) => stroke(p, <path d="M5 12l5 5 9-10" />, 4);
export const BinIcon = (p: IconProps) =>
  stroke(p, <><path d="M2 7h20" /><path d="M4 7l1.6 11.2A2 2 0 007.6 20h8.8a2 2 0 002-1.8L20 7" /><path d="M9 11.5h6" /><path d="M7 7l1.5-3h7L17 7" /></>);
export const CubeIcon = (p: IconProps) =>
  stroke(p, <><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>, 1.6);
