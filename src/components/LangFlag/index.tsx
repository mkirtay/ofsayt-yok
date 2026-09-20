type LangFlagProps = {
  /** Gösterilecek bayrağın dili */
  lang: 'tr' | 'en';
  className?: string;
};

// Satır içi SVG bayraklar (emoji değil): Windows'ta bayrak emojisi harf olarak görünür.
export default function LangFlag({ lang, className }: LangFlagProps) {
  return lang === 'tr' ? (
    <svg className={className} viewBox="0 0 30 20" width="24" height="16" aria-hidden="true" focusable="false">
      <rect width="30" height="20" fill="#e30a17" />
      <circle cx="11" cy="10" r="5" fill="#fff" />
      <circle cx="12.4" cy="10" r="4" fill="#e30a17" />
      <polygon
        fill="#fff"
        points="16.6,10 19.9,8.9 17.9,11.7 17.9,8.3 19.9,11.1"
      />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 60 40" width="24" height="16" aria-hidden="true" focusable="false">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 60,40M60,0 0,40" stroke="#fff" strokeWidth="8" />
      <path d="M0,0 60,40M60,0 0,40" stroke="#c8102e" strokeWidth="3" />
      <path d="M30,0V40M0,20H60" stroke="#fff" strokeWidth="13" />
      <path d="M30,0V40M0,20H60" stroke="#c8102e" strokeWidth="8" />
    </svg>
  );
}
