import { cn } from "@/lib/utils";

/** SMART STOCK mark: an isometric stock cube with barcode bars on its front faces. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} role="img" aria-label="SMART STOCK">
      <defs>
        <linearGradient id="ss-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.42 0.09 168)" />
          <stop offset="1" stopColor="oklch(0.24 0.05 175)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#ss-bg)" />
      <path d="M32 11 50 21.5 32 32 14 21.5Z" fill="oklch(0.86 0.13 165)" />
      <path d="M14 21.5 32 32v21L14 42.5Z" fill="oklch(0.62 0.12 168)" />
      <path d="M50 21.5 32 32v21l18-10.5Z" fill="oklch(0.5 0.1 170)" />
      <g stroke="oklch(0.2 0.04 175)" strokeLinecap="round">
        <path d="M18 29v12M21.5 31v12M24 32.5v12M28 35v12" strokeWidth="1.6" />
        <path d="M36 35v12M39.5 33v12M42.5 31v12M46 29.5v12" strokeWidth="1.6" />
      </g>
      <path d="M11 32h42" stroke="oklch(0.9 0.15 150)" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}
