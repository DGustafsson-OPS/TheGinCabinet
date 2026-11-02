// The Gin Cabinet's mark: a cabinet with its doors open and a gin bottle
// inside. It takes the text colour (currentColor), so it works on dark and
// light backgrounds. Decorative: the site name is always written next to it.
export default function CabinetMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M6 12 H114 L108 21 H12 Z" />
        <rect x="15" y="21" width="90" height="100" />
        <path d="M23 121 L21.5 134 M97 121 L98.5 134" />
        {/* The doors, swung open towards us, and the shelf the bottle stands on. */}
        <path d="M19 26 L41 32 V110 L19 117 Z" />
        <path d="M101 26 L79 32 V110 L101 117 Z" />
        <path d="M41 108 H79" />
      </g>
      {/* A square-shouldered gin bottle. */}
      <rect x="55.5" y="43" width="9" height="6" rx="1.2" fill="currentColor" />
      <path
        d="M57 49 H63 V56 L69 61 V103 A3 3 0 0 1 66 106 H54 A3 3 0 0 1 51 103 V61 L57 56 Z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <rect x="54" y="74" width="12" height="13" rx="1" fill="currentColor" />
    </svg>
  );
}
