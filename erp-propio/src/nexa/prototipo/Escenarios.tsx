// Escenarios de PRUEBA que se colocan DETRÁS de NEXA para comprobar la transparencia y el
// contraste. No son fondos de NEXA: NEXA nunca tiene fondo propio.

import { useState } from 'react'

export type Escenario = 'claro' | 'oscuro' | 'rejilla' | 'tarjetas' | 'mixto'

export const ESCENARIOS: { id: Escenario; nombre: string }[] = [
  { id: 'claro', nombre: 'Fondo claro' },
  { id: 'oscuro', nombre: 'Fondo oscuro' },
  { id: 'rejilla', nombre: 'Rejilla tipo ERP' },
  { id: 'tarjetas', nombre: 'Tarjetas y gráficas' },
  { id: 'mixto', nombre: 'Contenido mixto' },
]

const FILAS = Array.from({ length: 22 }, (_, i) => ({
  cod: String(149700 + i * 7),
  desc: ['BOLÍGRAFO AZUL', 'CUADERNO A5 CUADROS', 'PAPEL A4 80G', 'TÓNER TN-248 NEGRO', 'CARPETA ANILLAS', 'GRAPADORA 24/6', 'ROTULADOR FLUOR'][i % 7],
  stock: (i * 37) % 140,
  pvp: (1.2 + ((i * 13) % 40) / 3).toFixed(2).replace('.', ','),
}))

/** Botón real detrás de la cara: si se puede pulsar, NEXA no bloquea la interfaz. */
function BotonDePrueba({ oscuro = false }: { oscuro?: boolean }) {
  const [n, setN] = useState(0)
  return (
    <button
      onClick={() => setN((v) => v + 1)}
      className={`rounded border px-3 py-1.5 text-[13px] ${oscuro ? 'border-slate-500 bg-slate-700 text-white hover:bg-slate-600' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'}`}
    >
      Botón detrás de NEXA · pulsado {n} {n === 1 ? 'vez' : 'veces'}
    </button>
  )
}

function Rejilla() {
  return (
    <div className="h-full overflow-hidden bg-[#f0f0f0] p-3 font-[Tahoma] text-[13px]">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-bold text-[#1f4e9c]">Listado de Artículos</span>
        <BotonDePrueba />
      </div>
      <table className="w-full border-collapse border border-[#a0a0a0] bg-white">
        <thead>
          <tr className="bg-[#dfe4ec] text-left">
            {['Código', 'Descripción', 'Stock', 'P.V.P.'].map((h) => (
              <th key={h} className="border border-[#b8b8b8] px-2 py-1 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FILAS.map((f, i) => (
            <tr key={f.cod} className={i === 6 ? 'bg-[#316ac5] text-white' : i % 2 ? 'bg-[#f7f7f7]' : ''}>
              <td className="border border-[#d4d4d4] px-2 py-0.5">{f.cod}</td>
              <td className="border border-[#d4d4d4] px-2 py-0.5">{f.desc}</td>
              <td className="border border-[#d4d4d4] px-2 py-0.5 text-right">{f.stock}</td>
              <td className="border border-[#d4d4d4] px-2 py-0.5 text-right">{f.pvp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Barras({ colores }: { colores: string[] }) {
  const v = [42, 68, 55, 81, 60, 93, 74, 50, 66, 88, 71, 97]
  return (
    <svg viewBox="0 0 240 110" className="h-full w-full">
      {v.map((h, i) => (
        <rect key={i} x={6 + i * 19.5} y={105 - h} width="13" height={h} rx="2" fill={colores[i % colores.length]} />
      ))}
    </svg>
  )
}

function Linea({ color }: { color: string }) {
  const pts = [20, 35, 28, 50, 44, 62, 58, 75, 66, 84, 79, 92].map((y, i) => `${8 + i * 20},${100 - y}`).join(' ')
  return (
    <svg viewBox="0 0 240 110" className="h-full w-full">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
      <polyline points={`8,100 ${pts} 228,100`} fill={color} opacity="0.15" />
    </svg>
  )
}

function Tarjetas() {
  const tarjetas = [
    { t: 'Pedidos nuevos hoy', v: '37', c: '#2563eb' },
    { t: 'Pedidos web', v: '12', c: '#16a34a' },
    { t: 'Repartos', v: '18 / 24', c: '#f59e0b' },
    { t: 'Reparaciones', v: '5', c: '#dc2626' },
  ]
  return (
    <div className="grid h-full grid-cols-4 grid-rows-[auto_1fr_1fr] gap-3 overflow-hidden bg-[#eef1f5] p-4">
      {tarjetas.map((k) => (
        <div key={k.t} className="rounded-lg border-l-4 bg-white p-3 shadow-sm" style={{ borderColor: k.c }}>
          <div className="text-[12px] text-slate-500">{k.t}</div>
          <div className="text-[26px] font-bold text-slate-800">{k.v}</div>
        </div>
      ))}
      <div className="col-span-2 rounded-lg bg-white p-3 shadow-sm">
        <div className="text-[13px] font-semibold text-slate-700">Actividad por hora</div>
        <div className="h-[85%]">
          <Barras colores={['#3b82f6', '#60a5fa']} />
        </div>
      </div>
      <div className="col-span-2 rounded-lg bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between text-[13px] font-semibold text-slate-700">
          Evolución <BotonDePrueba />
        </div>
        <div className="h-[80%]">
          <Linea color="#16a34a" />
        </div>
      </div>
      <div className="col-span-4 rounded-lg bg-white p-3 shadow-sm">
        <div className="text-[13px] font-semibold text-slate-700">Pedidos por comercial</div>
        <div className="h-[85%]">
          <Barras colores={['#f59e0b', '#ef4444', '#8b5cf6', '#10b981']} />
        </div>
      </div>
    </div>
  )
}

function Mixto() {
  return (
    <div className="grid h-full grid-cols-2 overflow-hidden">
      <div className="flex flex-col gap-3 bg-gradient-to-br from-[#0b1220] via-[#13233f] to-[#1d4ed8] p-5 text-white">
        <div className="text-[15px] font-semibold">Panel oscuro con degradado</div>
        <div className="h-40 rounded-lg bg-white/10 p-2">
          <Linea color="#93c5fd" />
        </div>
        <BotonDePrueba oscuro />
        <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
          {['Hoy 37', 'Web 12', 'Ruta 4'].map((x) => (
            <div key={x} className="rounded bg-white/10 py-3">
              {x}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 bg-[#fafafa] p-5">
        <div className="text-[15px] font-semibold text-slate-700">Panel claro con tabla</div>
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {FILAS.slice(0, 12).map((f, i) => (
              <tr key={f.cod} className={i % 2 ? 'bg-slate-100' : 'bg-white'}>
                <td className="px-2 py-1">{f.cod}</td>
                <td className="px-2 py-1">{f.desc}</td>
                <td className="px-2 py-1 text-right">{f.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="h-28 rounded-lg border border-slate-200 bg-white p-2">
          <Barras colores={['#f97316', '#0ea5e9']} />
        </div>
      </div>
    </div>
  )
}

export function FondoEscenario({ escenario }: { escenario: Escenario }) {
  if (escenario === 'claro')
    return (
      <div className="flex h-full items-center justify-center bg-white pt-24">
        <BotonDePrueba />
      </div>
    )
  if (escenario === 'oscuro')
    return (
      <div className="flex h-full items-center justify-center bg-[#0d1117] pt-24">
        <BotonDePrueba oscuro />
      </div>
    )
  if (escenario === 'rejilla') return <Rejilla />
  if (escenario === 'tarjetas') return <Tarjetas />
  return <Mixto />
}
