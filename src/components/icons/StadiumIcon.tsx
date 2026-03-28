/** Basit stadyum silüeti (SVG, harici bağımlılık yok) */
export default function StadiumIcon({ className }: { className?: string }) {
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
      <ellipse cx={12} cy={16} rx={9} ry={3.5} />
      <path d="M3 16V9a9 3.5 0 0 1 18 0v7" />
      <path d="M3 12h18" />
      <path d="M7 9v7M12 7v9M17 9v7" />
    </svg>
  );
}
