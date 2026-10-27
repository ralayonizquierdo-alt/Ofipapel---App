import { useEffect, useState } from 'react'
import { AlertTriangle, ListOrdered } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwInput, GwSelect, GwWindow } from '../../components/gw'
import { BotonCasilla } from '../ventas/maestros/common'

// Tiendas → Parámetros → Contadores (captura 05-04). Los contadores de GeminisWin son los de
// secuencia_numeracion del ERP (los que da fn_siguiente_numero). Se enseña el ÚLTIMO número
// usado (siguiente_numero − 1), como GeminisWin. Solo el grupo administrador los cambia, con la
// ficha en Modificar, y nunca por debajo del último número realmente usado: lo comprueba el
// servidor (fn_ajustar_contador); desde el navegador la tabla no se puede tocar.

/** Ediciones pendientes: clave «tipo|serie» → último número que quedará. */
export type EdicionContadores = Record<string, number>

interface Secuencia {
  tipo_documento_codigo: string
  serie: string
  siguiente_numero: number
}

const clave = (tipo: string, serie = '') => `${tipo}|${serie}`

/** Contadores internos en el orden de GeminisWin; `tipo` null = sin equivalente aún (gris). */
const INTERNOS: { label: string; tipo: string | null; title: string }[][] = [
  [
    { label: 'Facturas', tipo: 'factura', title: 'CONTFAC' },
    { label: 'Ventas', tipo: 'venta', title: 'CONTVEN' },
    { label: 'Ped. Client.', tipo: 'pedido_cliente', title: 'CONTPED' },
    { label: 'Pagos de cli.', tipo: 'pago', title: 'CONTPAGCLI' },
    { label: 'Mov. Caja', tipo: 'caja', title: 'CONTMOVCAJA' },
  ],
  [
    { label: 'Repartos', tipo: 'reparto', title: 'CONTREPAR' },
    { label: 'Fact. Provd.', tipo: 'factura_proveedor', title: 'CONTFACPRO' },
    { label: 'Ped. a Provd.', tipo: 'pedido_proveedor', title: 'CONTPEDPRO' },
    { label: 'Pagos a Prov.', tipo: 'pago_proveedor', title: 'CONTPAGPRO' },
    { label: 'Trasp. Almac.', tipo: 'traspaso_almacen', title: 'CONTTRASP' },
    { label: 'Reg. Stock', tipo: 'regularizacion_stock', title: 'CONTREGSTOCK' },
    { label: 'Nº de Lote', tipo: null, title: 'CONTLOTE — sin equivalente todavía en el ERP' },
  ],
]

const EXTERNOS: { key: string; label: string; dc: string }[] = [
  { key: 'variable', label: 'Variable', dc: '04' },
  { key: 'fijo1', label: 'Fijo 1', dc: '01' },
  { key: 'fijo2', label: 'Fijo 2', dc: '02' },
]

const ELIMINAR = ['', 'No permitir', 'Solo la última', 'Permitir']
const BLOQUEOS = ['Siempre que varíe su valor', 'Si lo introduce el usuario', 'Al grabar registros nuevos']

interface Externo {
  dc?: string
  incrementa_deuda?: boolean
  emitir_pagada?: boolean
  cambiar_numero?: boolean
  eliminar?: string
}

/** Aplica en el servidor los contadores cambiados. Devuelve el primer error o null. */
export async function guardarContadores(tienda: string, edicion: EdicionContadores): Promise<string | null> {
  for (const [k, ultimo] of Object.entries(edicion)) {
    const [tipo, serie] = k.split('|')
    const { error } = await supabase.rpc('fn_ajustar_contador', { p_tienda: tienda, p_tipo: tipo, p_serie: serie ?? '', p_ultimo: ultimo })
    if (error) return `Contador ${tipo}${serie ? ` (serie ${serie})` : ''}: ${error.message}`
  }
  return null
}

export function ContadoresTienda({
  tienda,
  admin,
  editando,
  externos,
  bloqueo,
  edicion,
  onEdicion,
  onExternos,
  onBloqueo,
}: {
  tienda: string | null
  admin: boolean
  editando: boolean
  externos: Record<string, unknown>
  bloqueo: number | null
  edicion: EdicionContadores
  onEdicion: (e: EdicionContadores) => void
  onExternos: (v: Record<string, unknown>) => void
  onBloqueo: (v: number | null) => void
}) {
  const [secs, setSecs] = useState<Secuencia[]>([])
  const [todos, setTodos] = useState(false)
  const puede = admin && editando && !!tienda

  useEffect(() => {
    if (!tienda) return setSecs([])
    supabase
      .from('secuencia_numeracion')
      .select('tipo_documento_codigo, serie, siguiente_numero')
      .eq('tienda_terminal_codigo', tienda)
      .then(({ data }) => setSecs((data ?? []) as Secuencia[]))
  }, [tienda])

  const ultimo = (k: string) => {
    if (k in edicion) return edicion[k]
    const [tipo, serie] = k.split('|')
    const s = secs.find((x) => x.tipo_documento_codigo === tipo && x.serie === (serie ?? ''))
    return s ? Number(s.siguiente_numero) - 1 : 0
  }
  const cambiar = (k: string, txt: string) => {
    const n = Number(txt.replace(/\D/g, '') || '0')
    const original = (() => {
      const [tipo, serie] = k.split('|')
      const s = secs.find((x) => x.tipo_documento_codigo === tipo && x.serie === (serie ?? ''))
      return s ? Number(s.siguiente_numero) - 1 : 0
    })()
    const nueva = { ...edicion }
    if (n === original) delete nueva[k]
    else nueva[k] = n
    onEdicion(nueva)
  }

  const numero = (k: string | null, title: string) => (
    <GwInput
      className={`text-right ${k && k in edicion ? '!bg-[#fff4ce]' : ''}`}
      value={k ? ultimo(k) : 0}
      disabled={!k || !puede}
      title={k ? `${title} · último número usado${puede ? '' : ' (solo lo cambia un administrador, en Modificar)'}` : title}
      inputMode="numeric"
      onChange={(e) => k && cambiar(k, e.target.value)}
    />
  )

  const ext = (externos ?? {}) as Record<string, Externo | string | undefined>
  const fila = (k: string): Externo => (typeof ext[k] === 'object' && ext[k] ? (ext[k] as Externo) : {})
  const setFila = (k: string, p: Partial<Externo>) => onExternos({ ...ext, [k]: { ...fila(k), ...p } })
  const dcPredet = typeof ext.dc_predet === 'string' ? ext.dc_predet : ''

  return (
    <div className="flex h-full flex-col gap-1 px-3 pt-1 text-[15px]">
      <div className="flex items-center gap-1.5 border border-[#c19c00] bg-[#fff4ce] px-2 py-0.5 text-[12px] text-[#5c4400]">
        <AlertTriangle size={13} className="flex-none" />
        <span>
          Cambiar un contador afecta a la numeración legal de facturas y documentos (VeriFactu). Solo el grupo administrador puede cambiarlos y nunca por
          debajo del último número usado.
        </span>
        <button type="button" className="gw-btn ml-auto flex flex-none items-center gap-1 px-2" disabled={!tienda} onClick={() => setTodos(true)} title="Todos los contadores de numeración de esta tienda">
          <ListOrdered size={13} /> Todos los contadores…
        </button>
      </div>
      <fieldset className="gw-group mr-[11%] !pt-0">
        <legend className="!text-[15px]">Contadores Internos</legend>
        <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.6fr)] gap-x-1.5">
          {INTERNOS[0].map((c) => (
            <label key={c.label} className="flex min-w-0 flex-col">
              <span className="leading-[17px]">{c.label}</span>
              {numero(c.tipo ? clave(c.tipo) : null, c.title)}
            </label>
          ))}
          <label className="flex min-w-0 flex-col" title="Contador y longitud del código de cliente: sin equivalente todavía en el ERP">
            <span className="leading-[17px]">Cod. Cliente y Long.</span>
            <span className="grid grid-cols-[minmax(0,1fr)_56px] gap-1">
              <GwInput className="text-right" value={0} disabled readOnly />
              <GwInput className="text-right" value={0} disabled readOnly />
            </span>
          </label>
        </div>
        <div className="mt-0.5 grid grid-cols-7 gap-x-1.5">
          {INTERNOS[1].map((c) => (
            <label key={c.label} className="flex min-w-0 flex-col">
              <span className="leading-[17px]">{c.label}</span>
              {numero(c.tipo ? clave(c.tipo) : null, c.title)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="gw-group mr-[11%] !pt-0">
        <legend className="!text-[15px]">Contadores Externos Para la Facturación</legend>
        <div className="grid grid-cols-[110px_86px_minmax(0,1fr)_96px_96px_96px_minmax(0,1fr)_150px] items-end gap-x-1.5 text-center leading-[16px]">
          <span />
          <span>Dígito Control</span>
          <span>Nº Factura</span>
          <span>Incrementa Deuda</span>
          <span>Emitir Pagada</span>
          <span>Cambiar Núm. Fra</span>
          <span>Eliminar Facturas</span>
          <span className="flex flex-col items-center gap-0.5">
            DC Predet.
            <GwInput className="w-[80px] text-center" value={dcPredet} readOnly disabled title="Dígito de control predeterminado (se marca con la última columna)" />
          </span>
        </div>
        {EXTERNOS.map((e) => {
          const r = fila(e.key)
          const dc = r.dc ?? e.dc
          const nFac = secs.find((s) => s.tipo_documento_codigo === 'factura' && s.serie === dc)
          return (
            <div key={e.key} className="mt-0.5 grid grid-cols-[110px_86px_minmax(0,1fr)_96px_96px_96px_minmax(0,1fr)_150px] items-center gap-x-1.5">
              <span className="text-center text-[16px]">{e.label}</span>
              <GwInput value={dc} disabled={!puede} maxLength={4} title="Dígito de control (serie)" onChange={(ev) => setFila(e.key, { dc: ev.target.value })} />
              <GwInput className="text-right" value={nFac ? Number(nFac.siguiente_numero) - 1 : 0} readOnly disabled title="Último nº de factura de esta serie (lo lleva Facturación)" />
              <BotonCasilla label="" className="h-[26px] justify-center" checked={!!r.incrementa_deuda} disabled={!puede} title="Incrementa la deuda del cliente" onChange={(v) => setFila(e.key, { incrementa_deuda: v })} />
              <BotonCasilla label="" className="h-[26px] justify-center" checked={!!r.emitir_pagada} disabled={!puede} title="Emitir la factura como pagada" onChange={(v) => setFila(e.key, { emitir_pagada: v })} />
              <BotonCasilla label="" className="h-[26px] justify-center" checked={!!r.cambiar_numero} disabled={!puede} title="Permitir cambiar el número de factura" onChange={(v) => setFila(e.key, { cambiar_numero: v })} />
              <GwSelect value={r.eliminar ?? ''} disabled={!puede} title="Eliminar facturas" onChange={(ev) => setFila(e.key, { eliminar: ev.target.value })}>
                {ELIMINAR.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </GwSelect>
              <BotonCasilla
                label=""
                className="h-[26px] justify-center"
                checked={dcPredet !== '' && dcPredet === dc}
                disabled={!puede}
                title="Dígito de control predeterminado"
                onChange={(v) => onExternos({ ...ext, dc_predet: v ? dc : '' })}
              />
            </div>
          )
        })}
      </fieldset>

      <div className="mr-[11%]">
        <span>Bloqueo de los Contadores</span>
        <div className="grid grid-cols-3 gap-0.5 border border-[var(--gw-border-light)] p-0.5">
          {BLOQUEOS.map((b, i) => (
            <button
              key={b}
              type="button"
              disabled={!puede}
              aria-pressed={bloqueo === i}
              title="Cuándo se bloquean los contadores"
              onClick={() => onBloqueo(bloqueo === i ? null : i)}
              className={`h-[28px] border border-[var(--gw-border)] text-[15px] disabled:text-[var(--gw-text)] ${bloqueo === i ? 'bg-[#cfe3fa] font-bold' : 'bg-[var(--gw-face)]'}`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {todos && tienda && <TodosContadores tienda={tienda} secs={secs} puede={puede} ultimo={ultimo} cambiar={cambiar} onClose={() => setTodos(false)} />}
    </div>
  )
}

const NOMBRES: Record<string, string> = {
  factura: 'Facturas',
  venta: 'Ventas',
  pedido_cliente: 'Pedidos de clientes',
  pago: 'Pagos de clientes (cobros)',
  caja: 'Movimientos de caja',
  reparto: 'Repartos',
  factura_proveedor: 'Facturas de proveedor',
  pedido_proveedor: 'Pedidos a proveedor',
  pago_proveedor: 'Pagos a proveedor',
  traspaso_almacen: 'Traspasos de almacén',
  regularizacion_stock: 'Regularizaciones de stock',
  inventario: 'Inventarios',
  punto_restauracion_stock: 'Puntos de restauración de stock',
}

/** Todos los contadores de la tienda (también los que no salen en la pantalla de GeminisWin). */
function TodosContadores({
  tienda,
  secs,
  puede,
  ultimo,
  cambiar,
  onClose,
}: {
  tienda: string
  secs: Secuencia[]
  puede: boolean
  ultimo: (k: string) => number
  cambiar: (k: string, txt: string) => void
  onClose: () => void
}) {
  const filas = [...secs].sort((a, b) => a.tipo_documento_codigo.localeCompare(b.tipo_documento_codigo) || a.serie.localeCompare(b.serie))
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-20" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={`Contadores de numeración · tienda ${tienda}`} onClose={onClose} className="w-[620px] max-w-[95vw]">
        <div className="max-h-[420px] overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th>Documento</th>
                <th style={{ width: 110 }}>Serie</th>
                <th style={{ width: 130 }} className="text-right!">
                  Último nº usado
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((s) => {
                const k = clave(s.tipo_documento_codigo, s.serie)
                return (
                  <tr key={k}>
                    <td>{NOMBRES[s.tipo_documento_codigo] ?? s.tipo_documento_codigo}</td>
                    <td>{s.serie === '__GLOBAL__' ? '(global)' : s.serie}</td>
                    <td className="p-0!">
                      <GwInput className="text-right" value={ultimo(k)} disabled={!puede} inputMode="numeric" onChange={(e) => cambiar(k, e.target.value)} />
                    </td>
                  </tr>
                )
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-[#6d6d6d]">
                    Esta tienda todavía no ha numerado ningún documento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-1 flex items-center justify-between text-[12px]">
          <span>{puede ? 'Los cambios se aplican al pulsar Aceptar en la ficha.' : 'Solo lectura: los cambia un administrador con la ficha en Modificar.'}</span>
          <button type="button" className="gw-btn w-[80px]" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </GwWindow>
    </div>
  )
}
