import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwField, GwGroup, GwInput, formatGw } from '../../../components/gw'
import { GwCampoBusqueda } from '../../../components/gw/GwCampoBusqueda'
import { gwConCeros, useListaOrdenada, type GwListaOrdenadaDef } from '../../../components/gw/GwListaOrdenada'
import { GwOperativa, type BloqueOperativa } from '../../../components/gw/GwOperativa'
import { GwVentanaFlotante } from '../../../components/gw/GwVentanaFlotante'

// Pedidos a proveedor de GeminisWin, de solo consulta (Rober, 22/11/2026). Llegan por el espejo (gw_pedido_proveedor y
// sus líneas). Mientras GeminisWin sea quien manda en Compras, aquí no se cambia nada.

interface Cab {
  oficina: string
  numero: number
  proveedor_codigo: string | null
  almacen_codigo: string | null
  fecha_hora: string | null
  tipo_documento: number | null
  estado_pedido: number | null
  actualizado: boolean
  abono: boolean
  numero_albaran: string | null
  fecha_albaran: string | null
  numero_factura: string | null
  factura_proveedor_oficina: string | null
  factura_proveedor_id: number | null
  total: number | null
  copiado_en: string
}
interface Linea {
  linea: number
  articulo_codigo: string
  codigo_compra: string | null
  descripcion: string | null
  cantidad: number | null
  total_unidades: number | null
  unidades_recibidas: number | null
  recibida: boolean
  precio_compra: number | null
}

// ESTADOPED de GeminisWin. Los que se usan en Ofipapel (Rober, 22/11/2026): Pendiente (creado o enviado, sin propuesta
// aún), Pend. confirmar (llegó con faltas y lo que falta queda en restos), Confirmado (propuesta recibida y aceptada) y
// Liquidado (llegó la mercancía, con sus gastos, y se liquidó para la venta).
export const ESTADOS_GW: Record<number, string> = {
  1: 'Pendiente',
  2: 'Pend. confirmar',
  3: 'Confirmado',
  4: 'Conformado',
  5: 'Pend. entrega',
  6: 'Recepcionado',
  7: 'Liquidado',
}

const defLista = (campo: string, etiqueta: string): GwListaOrdenadaDef => ({
  fuente: 'gw_pedido_proveedor',
  campo,
  etiqueta,
  que: 'Pedidos de GeminisWin',
  columnas: [
    { key: 'oficina', label: 'Of.', width: 44 },
    { key: 'numero', label: 'Número', width: 90 },
    { key: 'fecha', label: 'Fecha', width: 100 },
    { key: 'proveedor_codigo', label: 'Proveedor', width: 90 },
    { key: 'proveedor_nombre', label: 'Nombre' },
    { key: 'estado', label: 'Estado', width: 120 },
    { key: 'total', label: 'Total', width: 110, decimales: 2 },
  ],
})
const ceros12 = (t: string | null) => (t && /^\d+$/.test(t.trim()) ? t.trim().padStart(12, '0') : t)
const fechaOrden = (t: string | null) => {
  const m = t ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t.trim()) : null
  return m ? `${m[3]}${m[2].padStart(2, '0')}${m[1].padStart(2, '0')}` : t
}
const fechaEs = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-ES', { timeZone: 'Atlantic/Canary', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const num = (v: number | null, d = 2) => (v == null ? '' : formatGw(Number(v), d))

const OPERATIVA: BloqueOperativa[] = [
  {
    titulo: 'Pedidos de GeminisWin (consulta)',
    pasos: [
      'Son los pedidos a proveedor hechos en GeminisWin, copiados al ERP por el espejo. Solo se consultan: se cambian en GeminisWin.',
      'Para ir a un pedido, escribe su número y pulsa Intro. Ctrl+Intro en Número, Fecha, Proveedor o Nombre abre la lista de todos los pedidos ordenada por ese campo.',
      'Estados: Pendiente (creado o enviado, sin propuesta del proveedor), Pend. confirmar (llegó con faltas; lo que falta queda en restos), Confirmado (propuesta recibida y aceptada) y Liquidado (llegó la mercancía, con sus gastos, y se liquidó).',
      'Actualizado: GeminisWin ya dio entrada a la mercancía (stock). Mientras no lo está, el Gestor de Pedidos lo cuenta como en camino, salvo si está recepcionado o liquidado.',
    ],
  },
]

export function PedidoGeminisWinPage() {
  const params = useParams()
  const navigate = useNavigate()
  const [oficina, numero] = (params['*'] ?? '').split('/')
  const listaOrd = useListaOrdenada()
  const [cab, setCab] = useState<Cab | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [nombreProv, setNombreProv] = useState('')
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState(false)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setCargando(true)
      let q = supabase.from('gw_pedido_proveedor').select('*')
      if (oficina && numero) q = q.eq('oficina', oficina).eq('numero', Number(numero))
      else q = q.order('fecha_hora', { ascending: false }).order('numero', { ascending: false })
      const { data, error } = await q.limit(1)
      if (cancel) return
      const c = ((data ?? [])[0] ?? null) as Cab | null
      setMensaje(error ? error.message : c ? null : 'No hay pedidos de GeminisWin con ese número.')
      setCab(c)
      if (c) {
        const [{ data: ls }, { data: pr }] = await Promise.all([
          supabase.from('gw_pedido_proveedor_linea').select('linea, articulo_codigo, codigo_compra, descripcion, cantidad, total_unidades, unidades_recibidas, recibida, precio_compra')
            .eq('oficina', c.oficina).eq('numero', c.numero).order('linea'),
          c.proveedor_codigo ? supabase.from('proveedor').select('nombre').eq('codigo', c.proveedor_codigo).maybeSingle() : Promise.resolve({ data: null }),
        ])
        if (cancel) return
        setLineas((ls ?? []) as Linea[])
        setNombreProv(((pr as { nombre?: string } | null)?.nombre) ?? '')
      } else {
        setLineas([])
        setNombreProv('')
      }
      setCargando(false)
    })()
    return () => {
      cancel = true
    }
  }, [oficina, numero])

  const ir = (o: string, n: number) => navigate(`/pedidos-geminiswin/${encodeURIComponent(o)}/${n}`)
  const lista = (campo: string, etiqueta: string, transformar: (t: string | null) => string | null = (t) => t) => (texto: string | null) =>
    listaOrd.abrir(defLista(campo, etiqueta), {
      texto: transformar(texto),
      ancla: cab ? `${cab.oficina}|${cab.numero}` : null,
      onPick: (r) => ir(String(r.oficina), Number(r.numero)),
    })
  const irANumero = async (texto: string) => {
    const n = Number(texto.replace(/\D/g, ''))
    if (!n) return
    const { data } = await supabase.from('gw_pedido_proveedor').select('oficina, numero').eq('numero', n).limit(20)
    const filas = (data ?? []) as { oficina: string; numero: number }[]
    const k = filas.find((f) => f.oficina === cab?.oficina) ?? filas[0]
    if (k) ir(k.oficina, k.numero)
    else setMensaje(`No hay ningún pedido de GeminisWin con el número ${n} (el espejo trae los del último año).`)
  }

  const recibidas = lineas.filter((l) => l.recibida).length
  const estado = cab?.estado_pedido != null ? (ESTADOS_GW[cab.estado_pedido] ?? String(cab.estado_pedido)) : ''

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded border border-[#c9a227] bg-[#fff6d6] px-2 py-1 text-[15px]">
        <span className="min-w-0 flex-1">
          Pedido de <b>GeminisWin</b>, solo para consultar (llega por el espejo{cab ? `; copiado el ${fechaHora(cab.copiado_en)}` : ''}). Se cambia en GeminisWin.
        </span>
        <button type="button" className="gw-btn !h-[32px] px-3 !text-[16px]" onClick={() => setAyuda(true)}>
          ? Operativa
        </button>
      </div>
      <div className="grid grid-cols-[60px_120px_170px_minmax(0,1fr)] gap-x-1.5">
        <GwField label="Oficina">
          <GwInput readOnly value={cab?.oficina ?? ''} />
        </GwField>
        <GwField label="Número">
          <GwCampoBusqueda className="gw-num" inputMode="numeric" enterKeyHint="go" value={cab ? String(cab.numero) : ''} onBuscar={irANumero} onLista={lista('numero_ord', 'Número', ceros12)} />
        </GwField>
        <GwField label="Fecha y hora">
          <GwCampoBusqueda value={fechaHora(cab?.fecha_hora ?? null)} onLista={lista('fecha_ord', 'Fecha', fechaOrden)} />
        </GwField>
        <GwField label="Proveedor">
          <div className="flex gap-1">
            <GwCampoBusqueda className="!w-[110px] flex-none" value={cab?.proveedor_codigo ?? ''} onLista={lista('proveedor_codigo', 'Proveedor', (t) => (t ? gwConCeros(t) : t))} />
            <GwCampoBusqueda value={nombreProv} onLista={lista('proveedor_nombre', 'Nombre del proveedor')} />
          </div>
        </GwField>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
        <GwGroup title="Estado">
          <div className="flex flex-wrap items-center gap-3 text-[17px]">
            <b>{estado}</b>
            <span>{cab?.actualizado ? '✔ Actualizado (entrada de mercancía hecha)' : cab ? 'Sin actualizar' : ''}</span>
            {cab?.abono && <span className="font-bold text-[#c42b1c]">Abono</span>}
          </div>
        </GwGroup>
        <GwGroup title="Albarán y factura">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-[16px]">
            <span>Albarán:</span>
            <span>{cab?.numero_albaran ?? ''} {cab?.fecha_albaran ? `· ${fechaEs(cab.fecha_albaran)}` : ''}</span>
            <span>Factura:</span>
            <span>{cab?.numero_factura ?? ''}{cab?.factura_proveedor_id ? ` (Id. ${cab.factura_proveedor_oficina ?? ''}-${cab.factura_proveedor_id})` : ''}</span>
          </div>
        </GwGroup>
        <GwGroup title="Totales">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-[16px]">
            <span>Total:</span>
            <b>{num(cab?.total ?? null)} €</b>
            <span>Líneas:</span>
            <span>
              {lineas.length} · recibidas {recibidas}
            </span>
            <span>Almacén:</span>
            <span>{cab?.almacen_codigo ?? ''}</span>
          </div>
        </GwGroup>
      </div>
      <div className="min-h-[200px] overflow-auto border border-[var(--gw-border-light)]">
        <table className="gw-grid w-full min-w-[900px]">
          <thead>
            <tr>
              <th className="w-[50px]">Lín.</th>
              <th className="w-[130px]">Artículo</th>
              <th className="w-[130px]">Ref. proveedor</th>
              <th>Descripción</th>
              <th className="w-[90px]">Cantidad</th>
              <th className="w-[90px]">Unidades</th>
              <th className="w-[90px]">Recibidas</th>
              <th className="w-[100px]">Precio</th>
              <th className="w-[70px]">Rec.</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={`${l.linea}|${l.articulo_codigo}`}>
                <td className="text-right">{l.linea}</td>
                <td>{l.articulo_codigo}</td>
                <td>{l.codigo_compra ?? ''}</td>
                <td>{l.descripcion ?? ''}</td>
                <td className="text-right">{num(l.cantidad, 2)}</td>
                <td className="text-right">{num(l.total_unidades, 2)}</td>
                <td className="text-right">{num(l.unidades_recibidas, 2)}</td>
                <td className="text-right">{num(l.precio_compra, 3)}</td>
                <td className="text-center">{l.recibida ? '✔' : ''}</td>
              </tr>
            ))}
            {!lineas.length && (
              <tr>
                <td colSpan={9} className="py-3 text-center text-[#5b6680]">
                  {cargando ? 'Cargando…' : 'Sin líneas.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {mensaje && <div className="font-bold text-[#c42b1c]">{mensaje}</div>}
      {ayuda && (
        <GwVentanaFlotante titulo="Operativa — Pedidos de GeminisWin" onCerrar={() => setAyuda(false)} ancho={620}>
          <GwOperativa bloques={OPERATIVA} />
        </GwVentanaFlotante>
      )}
      {listaOrd.dialogo}
    </div>
  )
}
