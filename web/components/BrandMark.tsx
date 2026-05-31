interface BrandMarkProps {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 22, className = "" }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M16 7L24 23H8L16 7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <circle cx="16" cy="23" r="1.4" fill="currentColor" />
    </svg>
  );
}
