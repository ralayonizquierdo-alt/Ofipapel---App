import { supabase } from '../../lib/supabase'
import { fechaReferencia } from '../../lib/sesionTrabajo'
import { CampoCodigo, LST_INPUT, LstGrupo, LstRadio, type ModoRango, type NombreBuscador } from '../../components/gw/GwListado'

// Grupos de filtros que se repiten en varios listados de Ventas y Compras
// («Tienda y Número», «Filtrar Según Campo de Cliente», «Filtrar según el total del Proveedor»).

export const rpc = (fn: string, p: unknown) => supabase.rpc(fn, { p })

/* ---------- Tienda y Número ---------- */

export interface TiendaNumero {
  modo: ModoRango
  desdeTienda: string
  desdeNumero: string
  hastaTienda: string
  hastaNumero: string
  lista: string
}
export const tiendaNumero = (): TiendaNumero => ({
  modo: 'cualquiera',
  desdeTienda: '',
  desdeNumero: '',
  hastaTienda: '',
  hastaNumero: '',
  lista: '',
})

export function tiendaNumeroSql(t: TiendaNumero) {
  return {
    modo: t.modo,
    desdeTienda: t.desdeTienda.trim(),
    desdeNumero: t.desdeNumero.trim().replace(/\D/g, ''),
    hastaTienda: t.hastaTienda.trim(),
    hastaNumero: t.hastaNumero.trim().replace(/\D/g, ''),
    lista: t.lista
      .split(/[,;\s]+/)
      .map((s) => s.trim().replace('-', '/'))
      .filter(Boolean),
  }
}

export function describirTiendaNumero(nombre: string, t: TiendaNumero) {
  if (t.modo === 'desdeHasta') return `${nombre}: desde ${t.desdeTienda || '…'}/${t.desdeNumero || '…'} hasta ${t.hastaTienda || '…'}/${t.hastaNumero || '…'}`
  if (t.modo === 'seleccionar' && t.lista.trim()) return `${nombre}: ${t.lista}`
  return null
}

export function GrupoTiendaNumero({
  titulo,
  valor,
  onChange,
  nombre,
  className = '',
}: {
  titulo: string
  valor: TiendaNumero
  onChange: (t: TiendaNumero) => void
  nombre: string
  className?: string
}) {
  const set = (p: Partial<TiendaNumero>) => onChange({ ...valor, ...p })
  const off = valor.modo !== 'desdeHasta'
  return (
    <LstGrupo titulo={titulo} className={className}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-[2px]">
        <div className="flex flex-col gap-[2px]">
          <LstRadio nombre={nombre} label="Desde/Hasta" on={valor.modo === 'desdeHasta'} set={() => set({ modo: 'desdeHasta' })} />
          <LstRadio nombre={nombre} label="Cualquiera" on={valor.modo === 'cualquiera'} set={() => set({ modo: 'cualquiera' })} />
          <LstRadio nombre={nombre} label="Seleccionar" on={valor.modo === 'seleccionar'} set={() => set({ modo: 'seleccionar' })} />
        </div>
        <div className="flex min-w-0 flex-col gap-[2px]">
          <div className="flex min-w-0 gap-2">
            <CampoCodigo
              valor={valor.desdeTienda}
              onChange={(v) => set({ desdeTienda: v })}
              buscador="tienda"
              disabled={off}
              ancho={108}
              title="Tienda desde"
            />
            <CampoCodigo valor={valor.desdeNumero} onChange={(v) => set({ desdeNumero: v })} disabled={off} className="flex-1" numerico title="Número desde" />
            <CampoCodigo
              valor={valor.hastaTienda}
              onChange={(v) => set({ hastaTienda: v })}
              buscador="tienda"
              disabled={off}
              ancho={108}
              title="Tienda hasta"
            />
            <CampoCodigo valor={valor.hastaNumero} onChange={(v) => set({ hastaNumero: v })} disabled={off} className="flex-1" numerico title="Número hasta" />
          </div>
          <div className="h-[26px]" />
          <input
            className={LST_INPUT}
            value={valor.lista}
            disabled={valor.modo !== 'seleccionar'}
            title="Tienda/número separados por comas (p. ej. 01/125, 01/130)"
            placeholder={valor.modo === 'seleccionar' ? 'tienda/número, tienda/número…' : ''}
            onChange={(e) => set({ lista: e.target.value })}
          />
        </div>
      </div>
    </LstGrupo>
  )
}

/* ---------- Filtrar Según Campo de Cliente ---------- */

export const CAMPOS_CLIENTE: {
  value: string
  label: string
  buscador?: NombreBuscador
}[] = [
  { value: 'tipo_cliente', label: 'Tipo Cliente', buscador: 'tipoCliente' },
  { value: 'zona', label: 'Zona Territorial', buscador: 'zona' },
  { value: 'vendedor', label: 'Vendedor', buscador: 'vendedor' },
  { value: 'forma_pago', label: 'Forma de Pago', buscador: 'formaPago' },
  { value: 'poblacion', label: 'Población' },
  { value: 'provincia', label: 'Provincia' },
  { value: 'codigo_postal', label: 'Código Postal' },
]

export interface CampoCliente {
  campo: string
  modo: 'no' | 'igual' | 'desdeHasta'
  desde: string
  hasta: string
}
export const campoCliente = (): CampoCliente => ({
  campo: 'tipo_cliente',
  modo: 'no',
  desde: '',
  hasta: '',
})

export function describirCampoCliente(c: CampoCliente) {
  if (c.modo === 'no') return null
  const l = CAMPOS_CLIENTE.find((x) => x.value === c.campo)?.label ?? c.campo
  return c.modo === 'igual' ? `${l} del cliente: ${c.desde}` : `${l} del cliente: desde ${c.desde || '…'} hasta ${c.hasta || '…'}`
}

export function GrupoCampoCliente({
  titulo,
  multiple,
  valor,
  onChange,
  className = '',
}: {
  titulo: string
  multiple: string
  valor: CampoCliente
  onChange: (c: CampoCliente) => void
  className?: string
}) {
  const set = (p: Partial<CampoCliente>) => onChange({ ...valor, ...p })
  const bus = CAMPOS_CLIENTE.find((c) => c.value === valor.campo)?.buscador
  return (
    <LstGrupo
      className={className}
      titulo={
        <span className="flex w-full items-center justify-between gap-6">
          <span>{titulo}</span>
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-x-2 gap-y-[6px]">
        <select
          className={LST_INPUT}
          value={valor.campo}
          onChange={(e) => set({ campo: e.target.value, desde: '', hasta: '' })}
          title="Campo de la ficha del cliente"
        >
          {CAMPOS_CLIENTE.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <select className={LST_INPUT} value={valor.modo} onChange={(e) => set({ modo: e.target.value as CampoCliente['modo'] })}>
            <option value="no">No Filtrar</option>
            <option value="igual">Igual a</option>
            <option value="desdeHasta">Desde/Hasta</option>
          </select>
          <span className="flex-none text-[16px] text-[#1a3fd6]" title="Varios campos a la vez: no disponible todavía">
            {multiple}
          </span>
        </div>
        <CampoCodigo
          valor={valor.desde}
          onChange={(v) => set({ desde: v })}
          buscador={bus}
          disabled={valor.modo === 'no'}
          className="flex-1"
          title="Desde / valor"
        />
        <CampoCodigo
          valor={valor.hasta}
          onChange={(v) => set({ hasta: v })}
          buscador={bus}
          disabled={valor.modo !== 'desdeHasta'}
          className="flex-1"
          title="Hasta"
        />
      </div>
    </LstGrupo>
  )
}

/* ---------- Filtrar según el total del Proveedor ---------- */

export interface TotalProveedor {
  modo: 'no' | 'mayor' | 'menor' | 'entre'
  a: string
  b: string
}
export const totalProveedor = (): TotalProveedor => ({
  modo: 'no',
  a: '0,00',
  b: '0,00',
})
export const totalProveedorSql = (t: TotalProveedor) => ({
  modo: t.modo,
  a: t.a.replace(/\./g, '').replace(',', '.'),
  b: t.b.replace(/\./g, '').replace(',', '.'),
})
export function describirTotalProveedor(t: TotalProveedor) {
  if (t.modo === 'mayor') return `Total del proveedor mayor que ${t.a}`
  if (t.modo === 'menor') return `Total del proveedor menor que ${t.a}`
  if (t.modo === 'entre') return `Total del proveedor entre ${t.a} y ${t.b}`
  return null
}

export function GrupoTotalProveedor({ valor, onChange, className = '' }: { valor: TotalProveedor; onChange: (t: TotalProveedor) => void; className?: string }) {
  const set = (p: Partial<TotalProveedor>) => onChange({ ...valor, ...p })
  return (
    <LstGrupo titulo="Filtrar según el total del Proveedor" className={className}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-[6px] pt-1">
        <select className={`${LST_INPUT} h-[30px]! text-[18px]!`} value={valor.modo} onChange={(e) => set({ modo: e.target.value as TotalProveedor['modo'] })}>
          <option value="no">No Filtrar</option>
          <option value="mayor">Mayor que</option>
          <option value="menor">Menor que</option>
          <option value="entre">Entre</option>
        </select>
        <input
          className={`${LST_INPUT} h-[30px]! text-right text-[18px]!`}
          value={valor.a}
          disabled={valor.modo === 'no'}
          onChange={(e) => set({ a: e.target.value })}
          title="Importe"
        />
        <span />
        <input
          className={`${LST_INPUT} h-[30px]! text-right text-[18px]!`}
          value={valor.b}
          disabled={valor.modo !== 'entre'}
          onChange={(e) => set({ b: e.target.value })}
          title="Hasta (solo «Entre»)"
        />
      </div>
    </LstGrupo>
  )
}

/**
 * Primer día del mes a las 0:00:00 y hoy a las 23:59:59 (fechas por defecto de los listados).
 * «Hoy» es la fecha de referencia de la sesión: la fecha de trabajo, o el final del periodo
 * elegido en Archivo → Seleccionar Periodo si la fecha de trabajo no cae dentro.
 */
export function mesEnCurso(): { desde: string; hasta: string } {
  const d = fechaReferencia()
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    desde: `${d.getFullYear()}-${p(d.getMonth() + 1)}-01T00:00:00`,
    hasta: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T23:59:59`,
  }
}
