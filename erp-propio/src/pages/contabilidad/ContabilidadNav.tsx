// Panel lateral de Contabilidad (Luis, 31/10/2026: «cuando entras en una ventana no tienes medios de
// salir para elegir otras opciones; tienes que volver a pinchar la pestaña de Contabilidad»). Muestra
// todas las opciones del menú Contabilidad con su icono, como el árbol de CONTANET, y marca en la que
// estás. Se puede plegar (se recuerda en este puesto). Sale de MENUS: si cambia el menú, cambia solo.

import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { MENUS, isEnabled, type MenuItem } from '../../components/shell/menus'
import { usePermisos } from '../../lib/PermisosContext'

const CLAVE = 'erp.contab.panel'

function leerPlegado() {
  try {
    return localStorage.getItem(CLAVE) === 'plegado'
  } catch {
    return false
  }
}

export function ContabilidadNav() {
  const { puedeOpcion } = usePermisos()
  const [plegado, setPlegado] = useState(leerPlegado)
  const entradas = MENUS.find((m) => m.label === 'Contabilidad')?.items ?? []

  const plegar = (v: boolean) => {
    setPlegado(v)
    try {
      localStorage.setItem(CLAVE, v ? 'plegado' : 'abierto')
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }

  return (
    <nav
      aria-label="Opciones de Contabilidad"
      className={`flex shrink-0 flex-col self-start border border-[var(--gw-border)] bg-[#f4f7fc] py-1 text-[13px] print:hidden ${plegado ? 'w-[34px]' : 'w-[215px]'}`}
    >
      <button
        type="button"
        className="mb-1 flex h-[22px] items-center gap-1 px-2 text-[12px] font-bold text-[#1d3a8a] hover:bg-[#dce6f5]"
        onClick={() => plegar(!plegado)}
        title={plegado ? 'Mostrar las opciones de Contabilidad' : 'Plegar el panel'}
      >
        {plegado ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        {!plegado && <span>CONTABILIDAD</span>}
      </button>
      {entradas.map((e, i) => {
        if (e === 'sep') return <div key={i} className="mx-2 my-1 border-t border-[#c9d7ee]" />
        const it = e as MenuItem
        const ok = isEnabled(it) && Boolean(it.to) && puedeOpcion(it)
        const Icono = it.icono
        const contenido = (
          <>
            {Icono ? (
              <Icono
                size={16}
                color={it.colorIcono ?? '#1d3a8a'}
                fill={it.colorIcono ?? '#1d3a8a'}
                fillOpacity={0.16}
                strokeWidth={2}
                className="shrink-0"
                aria-hidden
              />
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {!plegado && <span className="truncate">{it.label}</span>}
          </>
        )
        if (!ok)
          return (
            <span key={i} className="flex h-[24px] items-center gap-2 px-2 text-[#9a9a9a] opacity-60" title={`${it.label} (pendiente o sin permiso)`}>
              {contenido}
            </span>
          )
        return (
          <NavLink
            key={i}
            to={it.to!}
            title={it.description ?? it.label}
            className={({ isActive }) =>
              `flex h-[24px] items-center gap-2 px-2 ${isActive ? 'border-l-[3px] border-[#1d3a8a] bg-[#91c9f7] pl-[5px] font-bold' : 'hover:bg-[#dce6f5]'}`
            }
          >
            {contenido}
          </NavLink>
        )
      })}
    </nav>
  )
}
