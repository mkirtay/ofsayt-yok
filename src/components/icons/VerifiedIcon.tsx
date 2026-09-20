type Props = { size?: number; className?: string; title?: string };

/** Resmi hesap rozeti (dolu daire + onay işareti). */
export default function VerifiedIcon({ size = 14, className, title }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
