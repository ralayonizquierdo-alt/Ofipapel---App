/* Fondo musical: notas, ondas y pentagrama dispersos por toda la app */
export function MusicNotesBg({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 900"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      fill="currentColor"
    >
      {/* Ondas de sonido — líneas sinusoidales cruzando la pantalla */}
      <g stroke="currentColor" fill="none" strokeWidth="1.2">
        <path d="M-50 180 Q120 130 290 180 Q460 230 630 180 Q800 130 970 180 Q1140 230 1310 180 Q1380 162 1490 175" opacity="0.18" />
        <path d="M-50 220 Q120 170 290 220 Q460 270 630 220 Q800 170 970 220 Q1140 270 1310 220 Q1380 202 1490 215" opacity="0.10" />
        <path d="M-50 580 Q180 520 360 580 Q540 640 720 580 Q900 520 1080 580 Q1260 640 1490 575" opacity="0.15" />
        <path d="M-50 620 Q180 560 360 620 Q540 680 720 620 Q900 560 1080 620 Q1260 680 1490 615" opacity="0.08" />
        <path d="M-50 760 Q200 720 400 760 Q600 800 800 760 Q1000 720 1200 760 Q1350 785 1490 758" opacity="0.12" strokeWidth="0.8" />
      </g>

      {/* Segmentos de pentagrama */}
      <g stroke="currentColor" fill="none" strokeWidth="0.7" opacity="0.12">
        {[0,5,10,15,20].map(dy => (
          <line key={dy} x1="60" y1={320+dy} x2="280" y2={320+dy} />
        ))}
        {[0,5,10,15,20].map(dy => (
          <line key={dy} x1="1100" y1={430+dy} x2="1340" y2={430+dy} />
        ))}
        {[0,5,10,15,20].map(dy => (
          <line key={dy} x1="550" y1={700+dy} x2="750" y2={700+dy} />
        ))}
      </g>

      {/* Clave de sol simplificada — solo el rasgo principal */}
      <path d="M170 290 Q178 276 170 268 Q160 258 152 268 Q144 280 154 294 Q164 308 172 330 Q178 350 172 370 Q164 388 152 382"
        stroke="currentColor" fill="none" strokeWidth="2" opacity="0.14" />

      {/* Notas musicales dispersas */}
      {/* Corcheas y semicorcheas como paths SVG */}
      {/* Grupo arriba-izquierda */}
      <g opacity="0.22">
        {/* Corchea */}
        <ellipse cx="90" cy="356" rx="9" ry="6" transform="rotate(-20 90 356)" />
        <line x1="98" y1="352" x2="98" y2="310" stroke="currentColor" strokeWidth="2" />
        <path d="M98 310 Q118 316 112 328" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>
      <g opacity="0.18">
        <ellipse cx="220" cy="340" rx="9" ry="6" transform="rotate(-20 220 340)" />
        <line x1="228" y1="336" x2="228" y2="294" stroke="currentColor" strokeWidth="2" />
        <path d="M228 294 Q248 300 242 312" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M228 307 Q248 313 242 325" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>

      {/* Grupo centro-derecha */}
      <g opacity="0.20" transform="translate(1050 200)">
        <ellipse cx="0" cy="36" rx="10" ry="7" transform="rotate(-20 0 36)" />
        <line x1="9" y1="32" x2="9" y2="-18" stroke="currentColor" strokeWidth="2" />
        <path d="M9 -18 Q32 -10 26 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>
      <g opacity="0.14" transform="translate(1200 140)">
        <ellipse cx="0" cy="36" rx="10" ry="7" transform="rotate(-20 0 36)" />
        <line x1="9" y1="32" x2="9" y2="-18" stroke="currentColor" strokeWidth="2" />
        <path d="M9 -18 Q32 -10 26 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M9 -5 Q32 3 26 19" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>

      {/* Grupo abajo-centro */}
      <g opacity="0.19" transform="translate(620 640)">
        <ellipse cx="0" cy="24" rx="10" ry="7" transform="rotate(-20 0 24)" />
        <line x1="9" y1="20" x2="9" y2="-30" stroke="currentColor" strokeWidth="2" />
        <path d="M9 -30 Q32 -22 26 -8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>
      <g opacity="0.14" transform="translate(700 628)">
        <ellipse cx="0" cy="24" rx="10" ry="7" transform="rotate(-20 0 24)" />
        <line x1="9" y1="20" x2="9" y2="-30" stroke="currentColor" strokeWidth="2" />
        <path d="M9 -30 Q32 -22 26 -8" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M9 -17 Q32 -9 26 5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>

      {/* Notas sueltas de texto Unicode — vistosas y reconocibles */}
      <text x="38" y="78" fontSize="28" opacity="0.20" transform="rotate(-12 38 78)">♩</text>
      <text x="340" y="55" fontSize="22" opacity="0.15" transform="rotate(8 340 55)">♪</text>
      <text x="680" y="95" fontSize="34" opacity="0.18" transform="rotate(-6 680 95)">♫</text>
      <text x="980" y="60" fontSize="26" opacity="0.14" transform="rotate(14 980 60)">♬</text>
      <text x="1310" y="88" fontSize="20" opacity="0.16" transform="rotate(-8 1310 88)">♩</text>

      <text x="22" y="460" fontSize="32" opacity="0.16" transform="rotate(15 22 460)">♫</text>
      <text x="440" y="390" fontSize="20" opacity="0.13" transform="rotate(-18 440 390)">♪</text>
      <text x="800" y="420" fontSize="28" opacity="0.17" transform="rotate(7 800 420)">♬</text>
      <text x="1150" y="370" fontSize="24" opacity="0.14" transform="rotate(-11 1150 370)">♩</text>
      <text x="1380" y="440" fontSize="30" opacity="0.12" transform="rotate(20 1380 440)">♫</text>

      <text x="100" y="700" fontSize="26" opacity="0.15" transform="rotate(-9 100 700)">♬</text>
      <text x="380" y="750" fontSize="20" opacity="0.12" transform="rotate(16 380 750)">♩</text>
      <text x="900" y="790" fontSize="32" opacity="0.14" transform="rotate(-5 900 790)">♪</text>
      <text x="1250" y="730" fontSize="24" opacity="0.16" transform="rotate(12 1250 730)">♫</text>

      {/* Círculo de onda expansiva — decorativo */}
      <circle cx="720" cy="450" r="200" stroke="currentColor" strokeWidth="0.6" fill="none" opacity="0.06" />
      <circle cx="720" cy="450" r="320" stroke="currentColor" strokeWidth="0.5" fill="none" opacity="0.04" />
      <circle cx="720" cy="450" r="440" stroke="currentColor" strokeWidth="0.4" fill="none" opacity="0.03" />
    </svg>
  )
}

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
