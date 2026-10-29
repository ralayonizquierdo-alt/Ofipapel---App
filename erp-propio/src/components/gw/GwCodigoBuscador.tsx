import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwInput, GwLookupButton } from './index'
import { GwLookupDialog, type GwLookupColumn } from './GwLookupDialog'

/**
 * Código de una tabla que puede ser grande (proveedores, clientes, artículos): se escribe el
 * código o se busca con «···» (búsqueda en el servidor, de 200 en 200). Sustituye a los
 * desplegables que bajaban la tabla entera al navegador.
 */
export function GwCodigoBuscador({
  value,
  onChange,
  tabla,
  titulo,
  columnas,
  buscarEn,
  clave = 'codigo',
  autoFocus,
  title,
  className = '',
  disabled,
  eq,
}: {
  value: string
  onChange: (codigo: string, fila?: Record<string, unknown>) => void
  tabla: string
  titulo: string
  columnas: GwLookupColumn[]
  buscarEn: string[]
  clave?: string
  autoFocus?: boolean
  title?: string
  className?: string
  disabled?: boolean
  /** Restricciones fijas del buscador «···» (ver GwLookupDialog). */
  eq?: Record<string, string>
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <span className={`flex ${className}`}>
      <GwInput
        autoFocus={autoFocus}
        value={value}
        title={title}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'F4' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault()
            setAbierto(true)
          }
        }}
      />
      <GwLookupButton disabled={disabled} onClick={() => setAbierto(true)} title={`Buscar (${titulo})`} />
      {abierto && (
        <GwLookupDialog<Record<string, unknown>>
          title={titulo}
          table={tabla}
          columns={columnas}
          searchColumns={buscarEn}
          orderBy={clave}
          keyColumn={clave}
          eq={eq}
          onPick={(r) => {
            setAbierto(false)
            onChange(String(r[clave] ?? ''), r)
          }}
          onClose={() => setAbierto(false)}
        />
      )}
    </span>
  )
}

/** Columnas y búsqueda del buscador de proveedores. */
export const BUSCADOR_PROVEEDOR = {
  tabla: 'proveedor',
  titulo: 'Proveedores',
  columnas: [
    { key: 'codigo', label: 'Código', width: 90 },
    { key: 'nombre', label: 'Nombre' },
  ],
  buscarEn: ['codigo', 'nombre'],
  // Los acreedores (luz, teléfono…) no venden artículos: no se ofrecen.
  eq: { tipo: 'proveedor' },
}

/**
 * Nombres de los códigos que se están viendo (los de una rejilla), pedidos al servidor solo
 * para esos códigos: `nombre(c)` devuelve '' mientras no llegan.
 */
export function useNombres(tabla: string, codigos: (string | null | undefined)[], campo = 'nombre', clave = 'codigo') {
  const [mapa, setMapa] = useState<Record<string, string>>({})
  const lista = [...new Set(codigos.filter((c): c is string => !!c))].sort().join('\u0001')
  useEffect(() => {
    const cs = lista ? lista.split('\u0001') : []
    if (!cs.length) return
    let vivo = true
    supabase
      .from(tabla)
      .select(`${clave}, ${campo}`)
      .in(clave, cs)
      .then(({ data }) => {
        if (!vivo) return
        const m: Record<string, string> = {}
        for (const r of (data ?? []) as unknown as Record<string, string>[]) m[r[clave]] = r[campo] ?? ''
        setMapa((prev) => ({ ...prev, ...m }))
      })
    return () => {
      vivo = false
    }
  }, [tabla, campo, clave, lista])
  return (c: string | null | undefined) => (c ? (mapa[c] ?? '') : '')
}
