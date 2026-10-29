import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { CONFIG, type TipoFicha } from './types'
import { GwField, GwGroup, GwInput } from '../../../components/gw'
import { filaPorTecla } from '../../../components/gw/teclado'

interface Fila {
  codigo: string
  nombre: string
  nombre_corto: string | null
  dni: string | null
  poblacion: string | null
  telefono_fijo: string | null
  telefono_movil: string | null
  email: string | null
  activo: boolean
}

const VACIO = { codigo: '', nombre: '', dni: '', poblacion: '', telefono: '' }

function limpio(s: string) {
  return s.trim().replace(/[,%()]/g, ' ')
}

/** «Lista / filtro» de Vendedores o Técnicos al estilo GeminisWin: filtros arriba y rejilla navegable. */
export function VendedoresListPage({ tipo }: { tipo: TipoFicha }) {
  const cfg = CONFIG[tipo]
  const navigate = useNavigate()
  const [filtros, setFiltros] = useState(VACIO)
  const [rows, setRows] = useState<Fila[]>([])
  const [sel, setSel] = useState(0)
  const [cargando, setCargando] = useState(true)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      setCargando(true)
      let q = supabase
        .from(cfg.tabla)
        .select('codigo, nombre, nombre_corto, dni, poblacion, telefono_fijo, telefono_movil, email, activo')
        .order('codigo')
        .limit(500)
      const f = {
        codigo: limpio(filtros.codigo),
        nombre: limpio(filtros.nombre),
        dni: limpio(filtros.dni),
        poblacion: limpio(filtros.poblacion),
        telefono: limpio(filtros.telefono),
      }
      if (f.codigo) q = q.ilike('codigo', `${f.codigo}%`)
      if (f.nombre) q = q.or(`nombre.ilike.%${f.nombre}%,nombre_corto.ilike.%${f.nombre}%`)
      if (f.dni) q = q.ilike('dni', `%${f.dni}%`)
      if (f.poblacion) q = q.ilike('poblacion', `%${f.poblacion}%`)
      if (f.telefono) q = q.or(`telefono_fijo.ilike.%${f.telefono}%,telefono_movil.ilike.%${f.telefono}%`)
      const { data } = await q
      setRows((data ?? []) as Fila[])
      setSel(0)
      setCargando(false)
    }, 250)
    return () => clearTimeout(t)
  }, [filtros, cfg.tabla])

  const abrir = (r?: Fila) => r && navigate(`${cfg.ruta}/${encodeURIComponent(r.codigo)}`)

  function onKey(e: KeyboardEvent) {
    // El mismo manejador está en los filtros y en la ventana: solo actúa una vez por tecla.
    if (e.defaultPrevented) return
    // Flechas, AvPág/RePág y Ctrl+Inicio/Fin (Inicio/Fin a secas en la rejilla) mueven la fila; Intro la abre.
    const n = filaPorTecla(e, sel, rows.length, 15)
    if (n != null) {
      e.preventDefault()
      setSel(n)
    } else if (e.key === 'Enter' && rows[sel]) {
      e.preventDefault()
      abrir(rows[sel])
    }
  }

  useEffect(() => {
    gridRef.current?.querySelector('tr.gw-selected')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const campo = (key: keyof typeof VACIO, label: string) => (
    <GwField label={label}>
      <GwInput value={filtros[key]} onChange={(e) => setFiltros((f) => ({ ...f, [key]: e.target.value }))} onKeyDown={onKey} autoFocus={key === 'codigo'} />
    </GwField>
  )

  return (
    <div className="flex flex-col gap-1.5" onKeyDown={onKey}>
      <GwGroup title="Filtro" className="grid grid-cols-[110px_minmax(0,1fr)_130px_170px_130px] gap-x-2">
        {campo('codigo', 'Código')}
        {campo('nombre', 'Nombre / Nomb. corto')}
        {campo('dni', 'Dni/Nif')}
        {campo('poblacion', 'Población')}
        {campo('telefono', 'Teléfono')}
      </GwGroup>
      <div ref={gridRef} tabIndex={0} className="h-[calc(100vh-260px)] min-h-[240px] overflow-y-auto border border-[var(--gw-border)] bg-white outline-none">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 80 }}>Código</th>
              <th>Nombre</th>
              <th style={{ width: 150 }}>Nomb. corto</th>
              <th style={{ width: 110 }}>Dni/Nif</th>
              <th style={{ width: 150 }}>Población</th>
              <th style={{ width: 110 }}>Teléfono</th>
              <th style={{ width: 220 }}>E-mail</th>
            </tr>
          </thead>
          <tbody>
            {!cargando && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-[#6d6d6d]">
                  Ningún registro cumple el filtro.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr
                key={r.codigo}
                className={i === sel ? 'gw-selected' : !r.activo ? 'text-[#8a8a8a]' : ''}
                onClick={() => setSel(i)}
                onDoubleClick={() => abrir(r)}
              >
                <td>{r.codigo}</td>
                <td>{r.nombre}</td>
                <td>{r.nombre_corto ?? ''}</td>
                <td>{r.dni ?? ''}</td>
                <td>{r.poblacion ?? ''}</td>
                <td>{r.telefono_fijo || r.telefono_movil || ''}</td>
                <td>{r.email ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="gw-label flex-1">
          {cargando ? 'Buscando…' : `${rows.length} ${cfg.titulo.toLowerCase()}${rows.length === 500 ? ' (se muestran los 500 primeros)' : ''}`}
        </span>
        <button type="button" className="gw-btn" onClick={() => navigate(`${cfg.ruta}/nuevo`)}>
          Nuevo
        </button>
        <button type="button" className="gw-btn" disabled={!rows[sel]} onClick={() => abrir(rows[sel])}>
          Abrir ficha
        </button>
        <button type="button" className="gw-btn" onClick={() => navigate('/')}>
          Salir
        </button>
      </div>
    </div>
  )
}
