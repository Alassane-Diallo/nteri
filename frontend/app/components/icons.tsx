import type { PropsWithChildren, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: PropsWithChildren<IconProps>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z" />
    </Icon>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Icon>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.8-8.8" />
      <path d="m15.5 7.5 2 2" />
      <path d="m18.5 4.5 2 2" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </Icon>
  );
}

export function BellOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.7 3.1A6 6 0 0 1 18 8c0 2.1.3 3.6.8 4.7" />
      <path d="M6 8c0 7-3 7-3 9h13" />
      <path d="M10 21h4" />
      <path d="m2 2 20 20" />
    </Icon>
  );
}

export function UserPlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12 5 5L20 7" />
    </Icon>
  );
}

export function CheckCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </Icon>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="m6 7 1 14h10l1-14" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Icon>
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="16" height="11" x="4" y="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  );
}

export function LoaderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </Icon>
  );
}

