/** Hava durumu: açık havada güneş, parçalı bulutluda güneş + bulut, diğerlerinde bulut (SVG, harici bağımlılık yok) */
export default function WeatherIcon({ className, condition }: { className?: string; condition?: string | null }) {
  const sun = condition === 'clear';
  const partly = condition === 'partlyCloudy';
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
      {sun ? (
        <>
          <circle cx={12} cy={12} r={4} />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
        </>
      ) : (
        <>
          {partly ? <path d="M8.5 6.5a3.5 3.5 0 0 1 6.2 1.3M8.5 3v1M3.5 8h1M5 4.5l.8.8" /> : null}
          <path d="M7 19h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 11.5 3.75 3.75 0 0 0 7 19z" />
        </>
      )}
    </svg>
  );
}
