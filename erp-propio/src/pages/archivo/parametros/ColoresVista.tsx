// Parámetros → Colores de pantallas: paleta a la izquierda y, a la derecha, el menú entero
// (Archivo, Edición, Clientes… y dentro sus opciones y submenús) en una lista que se abre y se
// cierra por ramas. Se elige un color de la paleta y se pulsa la casilla «Color» de la fila para
// ponérselo; ✖ lo quita. Una opción sin color toma el de su submenú o menú (se ve más claro).

import { useMemo, useState } from 'react'
import { PALETA, PALETA_POR_CLAVE, arbolMenus, type MapaColores, type NodoMenu } from '../../../lib/coloresPantallas'
import { COLORES_DEFECTO } from '../../../lib/catalogoParametros'

export function ColoresVista({ valor, editable, onChange }: { valor: MapaColores; editable: boolean; onChange: (m: MapaColores) => void }) {
  const arbol = useMemo(() => arbolMenus(), [])
  const [pincel, setPincel] = useState<string>(PALETA[0].clave)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [soloConColor, setSoloConColor] = useState(false)

  const tieneColorDentro = useMemo(() => {
    const m = new Map<string, boolean>()
    const ver = (n: NodoMenu): boolean => {
      const r = Boolean(valor[n.id]) || n.hijos.map(ver).some(Boolean)
      m.set(n.id, r)
      return r
    }
    arbol.forEach(ver)
    return m
  }, [arbol, valor])

  const poner = (id: string, clave: string | null) => {
    if (!editable) return
    const m = { ...valor }
    if (clave) m[id] = clave
    else delete m[id]
    onChange(m)
  }
  const alternar = (id: string) =>
    setAbiertos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const todos = () => {
    const ids: string[] = []
    const ir = (ns: NodoMenu[]) => ns.forEach((n) => n.hijos.length && (ids.push(n.id), ir(n.hijos)))
    ir(arbol)
    return ids
  }

  const filas: { n: NodoMenu; heredado: string | null }[] = []
  const recorrer = (ns: NodoMenu[], heredado: string | null) => {
    for (const n of ns) {
      if (soloConColor && !tieneColorDentro.get(n.id)) continue
      filas.push({ n, heredado })
      if (n.hijos.length && (abiertos.has(n.id) || soloConColor)) recorrer(n.hijos, valor[n.id] ?? heredado)
    }
  }
  recorrer(arbol, null)
  const nColor = Object.keys(valor).length

  return (
    <div className="flex min-h-[420px] gap-2">
      {/* Paleta */}
      <div className="flex w-[220px] flex-none flex-col gap-1">
        <span className="gw-label" title="Elige un color y pulsa la casilla «Color» de la fila">Paleta:</span>
        {PALETA.map((c) => (
          <button
            key={c.clave}
            type="button"
            onClick={() => setPincel(c.clave)}
            className={`flex h-[30px] items-center gap-2 border px-1.5 text-left text-[13px] ${pincel === c.clave ? 'border-[#0078d7] ring-2 ring-[#0078d7]' : 'border-[var(--gw-border)]'}`}
            style={{ background: c.fondo }}
          >
            <span className="h-[18px] w-[28px] flex-none border border-black/20" style={{ background: `linear-gradient(${c.t1}, ${c.t2})` }} />
            <span className="h-[12px] w-[12px] flex-none rounded-full" style={{ background: c.vivo }} />
            {c.nombre}
          </button>
        ))}
      </div>

      {/* Menú */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={soloConColor} onChange={(e) => setSoloConColor(e.target.checked)} />
            Ver solo los que tienen color ({nColor})
          </label>
          <span className="flex-1" />
          <button type="button" className="gw-btn" onClick={() => setAbiertos(new Set(todos()))}>
            Abrir todo
          </button>
          <button type="button" className="gw-btn" onClick={() => setAbiertos(new Set())}>
            Cerrar todo
          </button>
          <button
            type="button"
            className="gw-btn"
            disabled={!editable}
            onClick={() => confirm('¿Volver a los colores de partida?') && onChange({ ...COLORES_DEFECTO })}
          >
            Colores de partida
          </button>
        </div>
        <div className="h-[440px] overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0 z-10">
              <tr>
                <th>Menú / opción</th>
                <th className="w-[230px]">Color</th>
                <th className="w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {filas.map(({ n, heredado }) => {
                const propio = valor[n.id] ? PALETA_POR_CLAVE[valor[n.id]] : null
                const deArriba = !propio && heredado ? PALETA_POR_CLAVE[heredado] : null
                const c = propio ?? deArriba
                return (
                  <tr key={n.id}>
                    <td style={{ paddingLeft: 6 + n.nivel * 20 }} className={n.nivel === 0 ? 'font-bold' : ''}>
                      {n.hijos.length ? (
                        <button type="button" className="mr-1 w-[16px] text-[#555]" onClick={() => alternar(n.id)}>
                          {abiertos.has(n.id) || soloConColor ? '▾' : '▸'}
                        </button>
                      ) : (
                        <span className="mr-1 inline-block w-[16px]" />
                      )}
                      <span className={n.hijos.length ? 'cursor-pointer' : ''} onClick={() => n.hijos.length && alternar(n.id)}>
                        {n.etiqueta}
                      </span>
                    </td>
                    <td
                      className={editable ? 'cursor-pointer' : ''}
                      title={editable ? `Poner «${PALETA_POR_CLAVE[pincel]?.nombre}»` : undefined}
                      onClick={() => poner(n.id, pincel)}
                    >
                      {c ? (
                        <span className={`flex items-center gap-1.5 ${deArriba ? 'opacity-50' : ''}`}>
                          <span className="h-[14px] w-[26px] flex-none border border-black/20" style={{ background: `linear-gradient(${c.t1}, ${c.t2})` }} />
                          {c.nombre}
                          {deArriba && <span className="text-[11px]">(heredado)</span>}
                        </span>
                      ) : (
                        <span className="text-[#bbb]">—</span>
                      )}
                    </td>
                    <td className="text-center">
                      {propio && editable && (
                        <button type="button" title="Quitar el color" className="font-bold text-[#c42b1c]" onClick={() => poner(n.id, null)}>
                          ✖
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
