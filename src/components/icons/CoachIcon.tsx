/** Basit kişi + pano silüeti — teknik direktör (SVG, harici bağımlılık yok) */
export default function CoachIcon({ className }: { className?: string }) {
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
      <circle cx={9} cy={7} r={3} />
      <path d="M3 20v-1.5A4.5 4.5 0 0 1 7.5 14h3a4.5 4.5 0 0 1 4.5 4.5V20" />
      <rect x={16} y={6} width={5} height={7} rx={1} />
      <path d="M18.5 9v1.5" />
    </svg>
  );
}
