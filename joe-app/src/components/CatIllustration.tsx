export default function CatIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 240"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
    >
      {/* Sombra suave */}
      <ellipse cx="100" cy="228" rx="52" ry="8" fill="#000" opacity="0.25" />

      {/* Orejas — traseras */}
      <path d="M42 90 L28 38 L72 70Z" fill="#1a1a1a" />
      <path d="M158 90 L172 38 L128 70Z" fill="#1a1a1a" />
      {/* Interior orejas */}
      <path d="M46 84 L36 52 L66 72Z" fill="#3a2a2a" opacity="0.6" />
      <path d="M154 84 L164 52 L134 72Z" fill="#3a2a2a" opacity="0.6" />

      {/* Cuerpo — manchas negras */}
      <ellipse cx="100" cy="180" rx="55" ry="48" fill="#e8e8e8" />
      <path d="M58 160 Q72 145 88 168 Q76 175 60 172Z" fill="#1a1a1a" />
      <path d="M142 155 Q128 142 115 163 Q127 170 143 167Z" fill="#1a1a1a" />
      <ellipse cx="100" cy="192" rx="28" ry="22" fill="#f0f0f0" />

      {/* Cabeza */}
      <ellipse cx="100" cy="108" rx="62" ry="58" fill="#e8e8e8" />

      {/* Manchas negras de la cabeza */}
      <path d="M48 85 Q60 70 80 80 Q70 98 52 96Z" fill="#1a1a1a" />
      <path d="M152 85 Q140 70 120 80 Q130 98 148 96Z" fill="#1a1a1a" />
      <path d="M85 65 Q100 55 115 65 Q108 78 92 78Z" fill="#1a1a1a" opacity="0.7" />

      {/* Ojos */}
      <ellipse cx="76" cy="105" rx="16" ry="14" fill="#1a1a1a" />
      <ellipse cx="124" cy="105" rx="16" ry="14" fill="#1a1a1a" />
      {/* Iris — verde/ámbar */}
      <ellipse cx="76" cy="105" rx="11" ry="12" fill="#8aaa44" />
      <ellipse cx="124" cy="105" rx="11" ry="12" fill="#c9a030" />
      {/* Pupila */}
      <ellipse cx="76" cy="107" rx="4" ry="10" fill="#0a0a0a" />
      <ellipse cx="124" cy="107" rx="4" ry="10" fill="#0a0a0a" />
      {/* Brillo */}
      <ellipse cx="80" cy="101" rx="3" ry="3" fill="white" opacity="0.9" />
      <ellipse cx="128" cy="101" rx="3" ry="3" fill="white" opacity="0.9" />
      <ellipse cx="73" cy="109" rx="1.5" ry="1.5" fill="white" opacity="0.5" />
      <ellipse cx="121" cy="109" rx="1.5" ry="1.5" fill="white" opacity="0.5" />

      {/* Nariz */}
      <path d="M95 122 Q100 118 105 122 Q100 128 95 122Z" fill="#e07070" />
      {/* Boca */}
      <path d="M100 128 Q94 133 90 131" stroke="#888" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M100 128 Q106 133 110 131" stroke="#888" strokeWidth="1.2" strokeLinecap="round" />

      {/* Bigotes izquierda */}
      <line x1="85" y1="122" x2="42" y2="115" stroke="#ccc" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <line x1="85" y1="125" x2="42" y2="125" stroke="#ccc" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <line x1="85" y1="128" x2="44" y2="135" stroke="#ccc" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      {/* Bigotes derecha */}
      <line x1="115" y1="122" x2="158" y2="115" stroke="#ccc" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <line x1="115" y1="125" x2="158" y2="125" stroke="#ccc" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <line x1="115" y1="128" x2="156" y2="135" stroke="#ccc" strokeWidth="1" strokeLinecap="round" opacity="0.8" />

      {/* Patas */}
      <ellipse cx="72" cy="222" rx="18" ry="10" fill="#ddd" />
      <ellipse cx="128" cy="222" rx="18" ry="10" fill="#ddd" />
      <ellipse cx="72" cy="222" rx="12" ry="7" fill="#e8e8e8" />
      <ellipse cx="128" cy="222" rx="12" ry="7" fill="#e8e8e8" />

      {/* Cola */}
      <path d="M155 195 Q185 170 178 140 Q172 120 160 130 Q168 148 164 168 Q158 185 148 192Z"
        fill="#1a1a1a" opacity="0.8" />

      {/* Textura suave — trazos acuarela */}
      <path d="M70 90 Q80 86 90 92" stroke="#aaa" strokeWidth="0.5" opacity="0.3" strokeLinecap="round" />
      <path d="M110 90 Q120 86 130 92" stroke="#aaa" strokeWidth="0.5" opacity="0.3" strokeLinecap="round" />
    </svg>
  )
}
