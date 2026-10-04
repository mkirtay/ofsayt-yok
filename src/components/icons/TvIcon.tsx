/** Basit ekran silüeti — yayın / nerede izlenir (SVG, harici bağımlılık yok) */
export default function TvIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x={3} y={6} width={18} height={12} rx={2} />
      <path d="M9 21h6M8 2.5 12 6l4-3.5" />
    </svg>
  );
}
