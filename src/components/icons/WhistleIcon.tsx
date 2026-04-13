/** Basit düdük silüeti (SVG, harici bağımlılık yok) */
export default function WhistleIcon({ className }: { className?: string }) {
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
      <path d="M9 5v6l-3 2v2a2 2 0 0 0 2 2h1" />
      <path d="M9 5h6a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3h-6" />
      <circle cx={14} cy={17} r={2.5} />
    </svg>
  );
}
