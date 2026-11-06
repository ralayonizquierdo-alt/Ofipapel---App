import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { VOLVER } from '../lib/operativas'

/**
 * El cuadro de «Operativa» de una pantalla: con qué cuentas, acuerdos y
 * condiciones trabaja lo que se está mirando.
 *
 * Lo pidió el propietario el 02/11/2026: «hay que crear un cuadro de
 * Operativas en cada pestaña, se trata de ver cómo se aplican cada fórmula,
 * acuerdos y condiciones». La idea es que nadie tenga que acordarse de por qué
 * una cifra sale como sale — ni preguntarlo.
 *
 * Va **plegado**: el que ya se lo sabe no lo ve, y el que duda lo abre. Lo que
 * dice tiene que ser lo que hace el código de verdad; si se cambia una regla,
 * se cambia aquí. No se imprime: es una ayuda de pantalla.
 */

export interface ReglaOperativa {
  /** De qué va, en dos o tres palabras: «Precio de una estancia». */
  que: string
  /** La cuenta, cuando la hay: «tarifa ÷ días del tramo × noches». */
  formula?: string
  /** Por qué es así, o qué hay que tener en cuenta. */
  nota?: string
}

/** Lo que va entre `**` sale en negrita: es lo que no hay que pasar por alto. */
function Resaltado({ texto }: { texto: string }) {
  return (
    <>
      {texto.split('**').map((trozo, i) => (
        i % 2 ? <b key={i} className="font-semibold text-slate-800">{trozo}</b> : trozo
      ))}
    </>
  )
}

export default function Operativa({ titulo, reglas }: { titulo?: string; reglas: ReglaOperativa[] }) {
  const [abierto, setAbierto] = useState(false)
  if (reglas.length === 0) return null
  // «← Volver» está en todas las pantallas, así que su regla también.
  const todas = [...reglas, VOLVER]

  return (
    <div className="mb-5 bg-white rounded-xl border border-slate-200 overflow-hidden print:hidden">
      <button onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50">
        {abierto ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
        <BookOpen size={15} className="text-slate-400 shrink-0" />
        <span className="text-sm font-semibold text-slate-700">Operativa{titulo ? ` · ${titulo}` : ''}</span>
        <span className="text-xs text-slate-400 font-normal">
          las reglas de esta pantalla
        </span>
      </button>

      {/* Con tope de alto, igual que en Vacaciones: abierta no echa la pantalla
          fuera de la vista. */}
      {abierto && (
        <div className="max-h-[50vh] overflow-y-auto border-t border-slate-200">
        <table className="w-full text-sm">
          <tbody>
            {todas.map(r => (
              <tr key={r.que} className="border-b border-slate-100 last:border-0 align-top">
                <th scope="row" className="text-left py-2 px-4 font-medium text-slate-700 w-56">{r.que}</th>
                <td className="py-2 px-4">
                  {r.formula && (
                    <code className="block text-[13px] text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1 mb-1 tabular-nums">
                      {r.formula}
                    </code>
                  )}
                  {r.nota && <p className="text-xs text-slate-500"><Resaltado texto={r.nota} /></p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}
