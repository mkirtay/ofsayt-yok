/** Düdük ikonu (09-kural-kosesi.html). */
export default function WhistleIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="14" r="5" />
      <circle cx="9" cy="14" r="1.5" />
      <path d="M12.6 10.4L21 6v4l-7 2.3" />
      <path d="M5.5 9.2L3.5 6.5" />
    </svg>
  );
}
