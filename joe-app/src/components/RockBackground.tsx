/* Guitarra eléctrica estilizada como fondo decorativo */
export function GuitarBackground({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 700"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
    >
      {/* Mástil */}
      <rect x="133" y="0" width="34" height="420" rx="6" />
      {/* Clavijero */}
      <rect x="118" y="0" width="64" height="50" rx="8" />
      <rect x="108" y="8" width="14" height="30" rx="4" />
      <rect x="178" y="8" width="14" height="30" rx="4" />
      <rect x="108" y="20" width="14" height="30" rx="4" />
      <rect x="178" y="20" width="14" height="30" rx="4" />
      {/* Trastes */}
      {[80, 110, 140, 170, 200, 240, 280, 320].map(y => (
        <rect key={y} x="126" y={y} width="48" height="3" rx="1" />
      ))}
      {/* Cuerpo — forma Les Paul */}
      <path d="M100 400 Q60 390 48 430 Q36 470 52 510 Q65 540 100 550 Q130 558 150 555
               Q170 558 200 550 Q235 540 248 510 Q264 470 252 430 Q240 390 200 400
               Q180 395 150 395 Q120 395 100 400Z" />
      {/* Escotadura inferior */}
      <path d="M100 430 Q80 440 82 460 Q84 475 100 478" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.4" />
      <path d="M200 430 Q220 440 218 460 Q216 475 200 478" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.4" />
      {/* F-holes */}
      <ellipse cx="120" cy="480" rx="6" ry="18" />
      <ellipse cx="180" cy="480" rx="6" ry="18" />
      {/* Puente */}
      <rect x="130" y="505" width="40" height="8" rx="2" />
      {/* Pastillas */}
      <rect x="118" y="450" width="64" height="22" rx="4" opacity="0.6" />
      {/* Cuerdas */}
      {[136, 141, 146, 151, 156, 161].map(x => (
        <line key={x} x1={x} y1="50" x2={x} y2="510" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      ))}
    </svg>
  )
}

/* Vinilo / disco de rock */
export function VinylRecord({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="100" cy="100" r="98" fill="currentColor" />
      {[85, 70, 56, 43, 30].map(r => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="white" strokeWidth="0.5" opacity="0.08" />
      ))}
      <circle cx="100" cy="100" r="22" fill="#1a1a1a" />
      <circle cx="100" cy="100" r="14" fill="currentColor" opacity="0.3" />
      <circle cx="100" cy="100" r="4" fill="white" opacity="0.4" />
    </svg>
  )
}
