import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export const MailIcon = (props: IconProps) => <IconBase {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></IconBase>;
export const CalendarIcon = (props: IconProps) => <IconBase {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></IconBase>;
export const PageIcon = (props: IconProps) => <IconBase {...props}><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 13h6M9 17h5"/></IconBase>;
export const CheckIcon = (props: IconProps) => <IconBase {...props}><path d="m5 12 4 4L19 6"/></IconBase>;
export const ArrowIcon = (props: IconProps) => <IconBase {...props}><path d="M5 12h14M14 7l5 5-5 5"/></IconBase>;
export const ChevronIcon = (props: IconProps) => <IconBase {...props}><path d="m8 10 4 4 4-4"/></IconBase>;
export const ShieldIcon = (props: IconProps) => <IconBase {...props}><path d="M12 3 5 6v5c0 4.6 2.9 8.1 7 10 4.1-1.9 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-4"/></IconBase>;
export const ExternalIcon = (props: IconProps) => <IconBase {...props}><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></IconBase>;
export const ReplayIcon = (props: IconProps) => <IconBase {...props}><path d="M4 10a8 8 0 1 1 2 7M4 10V5M4 10h5"/></IconBase>;
