import { cn } from "@/lib/utils";

export function AppMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
    >
      <rect width="64" height="64" rx="15" fill="#315FDB" />
      <path
        d="M13 18.1c6.75-1.38 12.63.38 17.5 4.62v24.37c-4.63-3.38-10.5-4.75-17.5-3.63V18.1Z"
        fill="#fff"
      />
      <path
        d="M51 18.1c-6.75-1.38-12.63.38-17.5 4.62v24.37c4.63-3.38 10.5-4.75 17.5-3.63V18.1Z"
        fill="#eaf0ff"
      />
      <path
        d="M32 22.1V47"
        stroke="#315FDB"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
