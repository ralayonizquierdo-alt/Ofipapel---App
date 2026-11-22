// Gestor de Pedidos 2.0 (Rober, 17/11/2026): «que el ERP me proponga cada semana los pedidos a
// proveedores y yo vaya decidiendo si envío o aguanto un poco más».
//
// Pantalla nueva y aparte del Gestor de siempre (que es calco de GeminisWin y no se toca). Por debajo usa
// el mismo motor: mínimos y máximos de cada artículo (fn_compras_propuesta_pedidos, vía fn_compras2_*) y
// la misma función que crea el pedido (fn_compras_crear_pedido): el pedido nace «pendiente» y aparece
// también en el Gestor de siempre y en Pedidos a Proveedores.
//
// A propósito NO tiene el aspecto de ventana de GeminisWin: Rober la pidió sencilla, atractiva y moderna.
// Mínimos y máximos PROPIOS del ERP (18/11/2026, migración 20261118_compras_politica_erp.sql): los de las fichas de
// GeminisWin no se usaban nunca. El ERP los calcula con la venta de 12 meses y el plazo de entrega (la forma ganadora
// del estudio fn_compras_estudio_minimos). Los artículos raros se deciden aquí, uno a uno o en bloque: «en stock» o
// «bajo pedido». Plazo, pedido mínimo y portes de cada proveedor se ponen aquí (compra_proveedor_condicion).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlarmClock, Calculator, CircleHelp, FileSpreadsheet, PackageX, RefreshCw, Send, Settings2, Sparkles, TrendingDown, Truck, UserRound, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { descargarExcelGw } from '../../../lib/excelGeminiswin'
import { Campanas } from './Campanas'
import { Tarifas } from './Tarifas'
import { Propuestas } from './Propuestas'
import { PedidosControl } from './PedidosControl'
import { TabPeticiones } from '../gestor/TabPeticiones'
import { CLAVE_OPCIONES, OPCIONES_DEFECTO } from '../gestor/opciones'
import { leerOpciones } from '../../ventas/gestores/comun'
import { GwOperativa, type BloqueOperativa } from '../../../components/gw/GwOperativa'

interface Resumen {
  proveedor_codigo: string
  proveedor_nombre: string | null
  articulos: number
  agotados: number
  con_peticion: number
  unidades: number
  importe: number
  compra_minima: number | null
  dias_entrega: number | null
  ultimo_pedido: string | null
  mas_baratos_en_otro: number
  aplazado_hasta: string | null
  aplazado_motivo: string | null
  portes_gratis_desde: number | null
  condiciones_erp: boolean | null
  raros_por_decidir: number
}
interface Estado {
  calculado_en: string | null
  con_minimo: number
  regulares: number
  intermitentes: number
  raros: number
  raros_por_decidir: number
  bajo_pedido: number
}
interface Raro {
  articulo_codigo: string
  descripcion: string
  proveedor_codigo: string | null
  proveedor_nombre: string | null
  meses_con_venta: number
  venta_12m: number
  coste: number
  stock_actual: number
  valor_stock: number
  decision: 'stock' | 'bajo_pedido' | null
  peticiones_abiertas: number | null
}
interface Linea {
  articulo_codigo: string
  descripcion: string
  referencia_compra: string | null
  stock_actual: number
  pendiente_recibir: number
  stock_minimo: number
  stock_maximo: number
  peticiones: number
  cantidad_sugerida: number
  unidades_por_caja: number | null
  coste: number
  importe: number
  mejor_proveedor: string | null
  mejor_proveedor_nombre: string | null
  mejor_coste: number | null
  tipo: 'regular' | 'intermitente' | 'raro' | 'sin_ventas' | null
  decision: 'stock' | 'bajo_pedido' | null
  venta_mes: number | null
  plazo_dias: number | null
  ultima_compra_uds: number | null
  ultima_compra_fecha: string | null
  dias_dura_compra: number | null
}

const TIENDA = '01' // la misma que usa el Gestor de siempre
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const eur0 = (n: number) => Math.round(n).toLocaleString('de-DE') + ' €'
const uds = (n: number) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 })
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const num = (v: unknown) => Number(v ?? 0)

const OPERATIVA: BloqueOperativa[] = [
  {
    titulo: 'Pedidos de la semana',
    pasos: [
      'Cada ficha es un proveedor con lo que el programa propone pedirle: los artículos que están en su stock mínimo o por debajo, en la cantidad que los lleva a su máximo (a cajas completas), y lo que hace falta para servir las peticiones de clientes.',
      'Arriba salen primero los que tienen artículos agotados. La barra dice si la propuesta llega al pedido mínimo del proveedor.',
      '«Revisar y enviar»: abre la propuesta. Quita lo que no quieras, cambia cantidades y pulsa «Crear pedido». El pedido nace pendiente, igual que los del Gestor de siempre.',
      '«Propuestas de proveedor»: cuando el proveedor contesta al pedido con su propuesta (proforma o confirmación en PDF), elige el pedido y sube el PDF. La IA lo lee y el ERP lo compara línea a línea con lo pedido: precio neto, cantidad, lo que no aparece, sin stock, sustitutos y lo que añaden. En cada diferencia pulsa «Aceptar» o «Reparo» (el texto del reparo se puede cambiar). Al final, «Enviar confirmación» o «Enviar reparos» manda el correo al proveedor desde el buzón de compras; «Guardar sin enviar» si ya se lo has dicho por teléfono. No cambia el pedido: lo que aceptes distinto, corrígelo en la ficha del pedido. También se llega desde la ficha del pedido (botón de la barra de líneas).',
      '«Tarifas»: sube el Excel (también .xls antiguo) o CSV de tarifa de un proveedor, elige el proveedor y comprueba las columnas (referencia, código de barras, precio, descuento). Cada línea se empareja con el artículo por la referencia de ese proveedor o por el código de barras. «Ver qué cambia» enseña qué sube y qué baja frente al coste actual y si otro proveedor lo tiene más barato. «¿Quién es más barato?» compara los artículos que más pesan entre todos sus proveedores (compras de los últimos 2 años y tarifas subidas). Las tarifas no cambian los costes de GeminisWin.',
      '«Campañas» (vuelta al cole y similares): eliges los meses del año pasado y cuánto más quieres pedir (%). Por cada artículo propone lo vendido en esos meses más ese %, menos el stock y lo que está en camino, a cajas completas. Se revisa proveedor a proveedor y «Crear pedido» lo deja pendiente, con su Excel para GeminisWin. Al quedar en camino, la propuesta semanal no lo vuelve a pedir.',
      '«Pueden esperar»: los proveedores con un pedido por debajo de 300 € (o de su pedido mínimo, si es mayor) se apartan aquí para juntarlo con el de otra semana. Si alguno trae una petición de cliente, sale en «Para decidir» aunque el pedido sea pequeño. Se pueden enviar igual con «Revisar y enviar». El importe se cambia en el parámetro compras.pedido_pequeno.',
      'Los consumibles de informática (cartuchos, tóner, tambores y cintas) no salen aquí: se piden aparte cada semana comparando entre tres proveedores. Se pueden volver a incluir desde el parámetro compras.familias_aparte.',
      '«No pedir solo» (en cada línea de la propuesta): marca el artículo «Bajo pedido». Deja de proponerse por mínimos y solo se pide cuando lo pide un cliente. Sirve para servicios (portes, fotocopias) y artículos que no se quieren tener en stock. Si el stock es negativo en GeminisWin se cuenta como 0.',
      '«Excel para GeminisWin»: al crear el pedido sale este enlace (y en la ficha del pedido, el botón verde de la barra de líneas). Descarga el Excel 5.0/95 con la hoja «fichero», el mismo que hace la app de Importación de Pedidos, listo para importarlo en Compras de GeminisWin. Sin tildes ni Ñ, porque ese formato no las admite.',
      '«Aguantar»: lo quita de la lista una o dos semanas. Cuando vuelve trae lo que se haya sumado.',
    ],
  },
  {
    titulo: 'Bueno es saber',
    notas: [
      'El aviso «más barato en…» compara el precio neto por unidad con el de los otros proveedores dados de alta en la ficha del artículo.',
      'En camino: cuentan los pedidos del ERP pendientes o confirmados y los de GeminisWin sin actualizar que no estén recepcionados ni liquidados (llegan por el espejo), lo que falta por recibir de cada línea. Si un pedido está en los dos (el del ERP importado en GeminisWin) no se cuenta dos veces: de cada artículo se toma lo mayor.',
      'Peticiones de clientes: siguen pendientes mientras el pedido es una propuesta. Pasan solas a «tramitada» cuando el pedido se acepta, y a «resuelta» cuando se liquida, igual que con el Gestor de siempre.',
      'El pedido creado se ve y se cambia en Compras › Pedidos a Proveedores y en el Gestor de Pedidos a Proveedores.',
      'Los mínimos y máximos los calcula el ERP (los de las fichas de GeminisWin no se usan): venta media de los últimos 12 meses, más un margen para no quedarse sin stock durante el plazo de entrega (como mucho, lo que se vende en ese plazo: las subidas de temporada van por campañas); el máximo cubre tres semanas más de venta (parámetro compras.cobertura_dias), para no pedir cada semana al mismo proveedor. «Recalcular mínimos» los rehace con las ventas al día.',
      'Tipos: regular (se vende 9 o más meses del año), intermitente (4 a 8) y raro (3 o menos). Los raros no tienen mínimo hasta que decides: pestaña «Raros», «En stock» o «Bajo pedido». Bajo pedido = solo se pide cuando lo pide un cliente.',
      'En «Raros» salen primero los que hoy tienen stock: si quieres seguir teniéndolos, márcalos «En stock»; si no, no se repondrán.',
      '«Condiciones» en cada proveedor: plazo de entrega real, pedido mínimo y portes gratis. Mandan sobre la ficha de GeminisWin y recalculan al momento los mínimos de sus artículos.',
      'Junto a cada artículo: lo que vende al mes y la última compra con cuántos días le dura al ritmo de venta de ahora.',
      'Las campañas (vuelta al cole, Navidad) no van por aquí: se piden comparando con el año anterior.',
    ],
  },
]

export function GestorSemanalPage() {
  const [busqueda] = useSearchParams()
  const pedidoInicial = useMemo(() => {
    const m = /^(.+)-(\d+)$/.exec(busqueda.get('pedido') ?? '')
    return m ? { tienda: m[1], numero: Number(m[2]) } : null
  }, [busqueda])
  const [datos, setDatos] = useState<Resumen[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; pedido?: number; error?: boolean } | null>(null)
  const [vista, setVista] = useState<'decidir' | 'esperar' | 'aplazados' | 'raros' | 'campanas' | 'tarifas' | 'propuestas' | 'peticiones' | 'pedidos'>(() => {
    const v = busqueda.get('vista')
    return v === 'propuestas' || v === 'peticiones' || v === 'pedidos' ? v : 'decidir'
  })
  const [abierto, setAbierto] = useState<Resumen | null>(null)
  const [ayuda, setAyuda] = useState(false)
  const [sinProveedor, setSinProveedor] = useState(0)
  const [estado, setEstado] = useState<Estado | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [condiciones, setCondiciones] = useState<Resumen | null>(null)
  const [pequeno, setPequeno] = useState(300)
  const [opcionesGestor] = useState(() => leerOpciones(CLAVE_OPCIONES, OPCIONES_DEFECTO))

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_compras_semanal_proveedores')
    if (e) return setError(e.message)
    supabase.rpc('fn_compras_semanal_sin_proveedor').then(({ data: n }) => setSinProveedor(Number(n ?? 0)))
    supabase
      .from('parametro')
      .select('valor')
      .eq('clave', 'compras.pedido_pequeno')
      .maybeSingle()
      .then(({ data: pp }) => pp && Number(pp.valor) >= 0 && setPequeno(Number(pp.valor)))
    supabase.rpc('fn_compras_politica_estado').then(({ data: est }) => setEstado((est ?? null) as Estado | null))
    setDatos(
      ((data ?? []) as Resumen[])
        .map((r) => ({ ...r, importe: num(r.importe), unidades: num(r.unidades), compra_minima: r.compra_minima == null ? null : num(r.compra_minima), portes_gratis_desde: r.portes_gratis_desde == null ? null : num(r.portes_gratis_desde) }))
        .sort((a, b) => b.agotados - a.agotados || b.importe - a.importe),
    )
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  // Pedido pequeño: por debajo de compras.pedido_pequeno (o del pedido mínimo del proveedor, si es mayor) y sin
  // peticiones de clientes, se aparta en «Pueden esperar» para juntarlo con el de otra semana (Rober, 18/11/2026).
  const limiteDe = useCallback((r: Resumen) => Math.max(pequeno, r.compra_minima ?? 0), [pequeno])
  const esPequeno = useCallback((r: Resumen) => !r.aplazado_hasta && r.con_peticion === 0 && r.importe < limiteDe(r), [limiteDe])
  const decidir = useMemo(() => (datos ?? []).filter((r) => !r.aplazado_hasta && !esPequeno(r)), [datos, esPequeno])
  const esperar = useMemo(() => (datos ?? []).filter((r) => esPequeno(r)), [datos, esPequeno])
  const aplazados = useMemo(() => (datos ?? []).filter((r) => r.aplazado_hasta), [datos])
  const lista = vista === 'decidir' ? decidir : vista === 'esperar' ? esperar : vista === 'aplazados' ? aplazados : []

  async function excel(numero: number) {
    const e = await descargarExcelGw(TIENDA, numero)
    if (e) setAviso({ texto: e, pedido: numero, error: true })
  }

  async function recalcular() {
    setError(null)
    setCalculando(true)
    const { data, error: e } = await supabase.rpc('fn_compras_politica_calcular')
    setCalculando(false)
    if (e) return setError(e.message)
    const d = data as Estado & { articulos: number }
    setAviso({ texto: `Mínimos recalculados: ${d.con_minimo} artículos con mínimo (${d.regulares} regulares, ${d.intermitentes} intermitentes). ${d.raros_por_decidir} raros por decidir.` })
    await cargar()
  }

  async function aplazar(r: Resumen, dias: number) {
    setError(null)
    const { error: e } = await supabase.rpc('fn_compras2_aplazar', { p_proveedor: r.proveedor_codigo, p_dias: dias, p_motivo: null })
    if (e) return setError(e.message)
    setAviso({ texto: dias ? `${r.proveedor_nombre ?? r.proveedor_codigo}: aguantas ${dias} días.` : `${r.proveedor_nombre ?? r.proveedor_codigo} vuelve a la lista.` })
    await cargar()
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-3 text-[#1b2540]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight">Pedidos de la semana</h1>
          <p className="text-[14px] text-[#5b6680]">Lo que el programa propone pedir a cada proveedor, según el stock mínimo y máximo. Tú decides: enviar o aguantar.</p>
          {estado?.calculado_en && (
            <p className="text-[13px] text-[#7a849c]">
              Mínimos del ERP calculados el {fecha(estado.calculado_en.slice(0, 10))} · {estado.con_minimo} artículos con mínimo · {estado.raros_por_decidir} raros por decidir
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button type="button" onClick={() => void recalcular()} disabled={calculando} className="flex h-9 items-center gap-1.5 rounded-full border border-[#d5dcec] bg-white px-3 text-[14px] hover:bg-[#f1f5fd] disabled:opacity-50">
            <Calculator size={15} /> {calculando ? 'Calculando…' : 'Recalcular mínimos'}
          </button>
          <button type="button" onClick={() => void cargar()} className="flex h-9 items-center gap-1.5 rounded-full border border-[#d5dcec] bg-white px-3 text-[14px] hover:bg-[#f1f5fd]">
            <RefreshCw size={15} /> Actualizar
          </button>
          <button type="button" onClick={() => setAyuda(true)} className="flex h-9 items-center gap-1.5 rounded-full border border-[#d5dcec] bg-white px-3 text-[14px] hover:bg-[#f1f5fd]">
            <CircleHelp size={15} /> Operativa
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato titulo="Proveedores por decidir" valor={String(decidir.length)} />
        <Dato titulo="Importe propuesto" valor={eur0(decidir.reduce((s, r) => s + r.importe, 0))} />
        <Dato titulo="Artículos agotados" valor={String(decidir.reduce((s, r) => s + r.agotados, 0))} alerta />
        <Dato titulo="Aguantando" valor={String(aplazados.length)} />
      </section>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Pestana activa={vista === 'decidir'} onClick={() => setVista('decidir')}>
          Para decidir · {decidir.length}
        </Pestana>
        <Pestana activa={vista === 'esperar'} onClick={() => setVista('esperar')}>
          Pueden esperar · {esperar.length}
        </Pestana>
        <Pestana activa={vista === 'aplazados'} onClick={() => setVista('aplazados')}>
          Aguantando · {aplazados.length}
        </Pestana>
        <Pestana activa={vista === 'raros'} onClick={() => setVista('raros')}>
          Raros por decidir · {estado?.raros_por_decidir ?? '…'}
        </Pestana>
        <Pestana activa={vista === 'campanas'} onClick={() => setVista('campanas')}>
          Campañas
        </Pestana>
        <Pestana activa={vista === 'tarifas'} onClick={() => setVista('tarifas')}>
          Tarifas
        </Pestana>
        <Pestana activa={vista === 'propuestas'} onClick={() => setVista('propuestas')}>
          Propuestas de proveedor
        </Pestana>
        <Pestana activa={vista === 'peticiones'} onClick={() => setVista('peticiones')}>
          Peticiones de clientes
        </Pestana>
        <Pestana activa={vista === 'pedidos'} onClick={() => setVista('pedidos')}>
          Pedidos a proveedor
        </Pestana>
        {error && (
          <span role="alert" className="text-[14px] font-bold text-[#c42b1c]">
            {error}
          </span>
        )}
        {aviso && (
          <span role="status" className={`text-[14px] font-bold ${aviso.error ? 'text-[#b42318]' : 'text-[#127a12]'}`}>
            {aviso.texto}{' '}
            {aviso.pedido != null && (
              <>
                <button type="button" onClick={() => void excel(aviso.pedido!)} className="mr-2 inline-flex items-center gap-1 underline">
                  <FileSpreadsheet size={14} /> Excel para GeminisWin
                </button>
                <button type="button" onClick={() => setVista('pedidos')} className="underline">
                  Verlo en «Pedidos a proveedor»
                </button>
              </>
            )}
          </span>
        )}
      </div>

      {sinProveedor > 0 && (
        <p className="rounded-xl border border-[#f1d58a] bg-[#fff8e1] px-4 py-2 text-[14px] text-[#6b4a00]">
          Hay <b>{sinProveedor}</b> {sinProveedor === 1 ? 'petición de cliente que no sale' : 'peticiones de clientes que no salen'} en ninguna propuesta: ni la petición ni el artículo tienen proveedor.{' '}
          <Link to="/peticiones" className="font-semibold underline">
            Ver peticiones
          </Link>
        </p>
      )}
      {datos === null && !error && <p className="text-[15px] text-[#5b6680]">Calculando las propuestas…</p>}
      {vista === 'campanas' && <Campanas />}
      {vista === 'tarifas' && <Tarifas />}
      {vista === 'propuestas' && <Propuestas pedidoInicial={pedidoInicial} />}
      {vista === 'pedidos' && <PedidosControl />}
      {vista === 'peticiones' && (
        <div className="overflow-hidden rounded-2xl border border-[#e1e7f3] bg-white p-2 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
          <TabPeticiones opciones={opcionesGestor} onError={setError} />
        </div>
      )}
      {vista === 'raros' && (
        <Raros
          proveedores={(datos ?? []).map((r) => ({ codigo: r.proveedor_codigo, nombre: r.proveedor_nombre }))}
          onCambio={() => void cargar()}
          onError={setError}
        />
      )}
      {vista !== 'raros' && datos !== null && !lista.length && (
        <p className="rounded-2xl border border-dashed border-[#c9d3e8] bg-white p-8 text-center text-[15px] text-[#5b6680]">
          {vista === 'decidir' ? 'No hay nada que pedir: ningún artículo con mínimo está por debajo de él.' : 'No estás aguantando ningún proveedor.'}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lista.map((r) => (
          <Ficha key={r.proveedor_codigo} r={r} pequeno={esPequeno(r) ? limiteDe(r) : null} onAbrir={() => setAbierto(r)} onAplazar={(d) => void aplazar(r, d)} onCondiciones={() => setCondiciones(r)} />
        ))}
      </section>

      {abierto && (
        <Propuesta
          r={abierto}
          onCerrar={() => setAbierto(null)}
          onCreado={(texto, numero) => {
            setAbierto(null)
            setAviso({ texto, pedido: numero })
            void cargar()
          }}
        />
      )}
      {condiciones && (
        <Condiciones
          r={condiciones}
          onCerrar={() => setCondiciones(null)}
          onGuardado={(texto) => {
            setCondiciones(null)
            setAviso({ texto })
            void cargar()
          }}
        />
      )}
      {ayuda && (
        <Capa titulo="Operativa" onCerrar={() => setAyuda(false)} ancho="max-w-[820px]">
          <GwOperativa bloques={OPERATIVA} />
        </Capa>
      )}
    </div>
  )
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#e1e7f3] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(20,40,90,0.06)]">
      <div className="text-[13px] text-[#5b6680]">{titulo}</div>
      <div className={`text-[24px] font-bold tabular-nums ${alerta && valor !== '0' ? 'text-[#c42b1c]' : ''}`}>{valor}</div>
    </div>
  )
}

function Pestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className={`h-9 rounded-full px-4 text-[14px] font-semibold ${activa ? 'bg-[#1d3a8a] text-white' : 'border border-[#d5dcec] bg-white text-[#1b2540] hover:bg-[#f1f5fd]'}`}>
      {children}
    </button>
  )
}

function Ficha({ r, pequeno, onAbrir, onAplazar, onCondiciones }: { r: Resumen; pequeno: number | null; onAbrir: () => void; onAplazar: (dias: number) => void; onCondiciones: () => void }) {
  const [menu, setMenu] = useState(false)
  const minimo = r.compra_minima && r.compra_minima > 0 ? r.compra_minima : null
  const llega = minimo == null || r.importe >= minimo
  const pct = minimo ? Math.min(100, Math.round((r.importe / minimo) * 100)) : 100
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[#e1e7f3] bg-white p-4 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-bold" title={r.proveedor_nombre ?? ''}>
            {r.proveedor_nombre ?? '(sin nombre)'}
          </h2>
          <div className="text-[12px] text-[#7a849c]">
            {r.proveedor_codigo}
            {r.ultimo_pedido ? ` · último pedido ${fecha(r.ultimo_pedido)}` : ''}
          </div>
        </div>
        <div className="shrink-0 text-right text-[22px] font-bold tabular-nums">{eur0(r.importe)}</div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[13px]">
        <Chip>{r.articulos} {r.articulos === 1 ? 'artículo' : 'artículos'}</Chip>
        {pequeno != null && <Chip color="ambar">Pedido pequeño: se junta hasta {eur0(pequeno)}</Chip>}
        {r.agotados > 0 && (
          <Chip color="rojo">
            <PackageX size={13} /> {r.agotados} sin stock
          </Chip>
        )}
        {r.con_peticion > 0 && (
          <Chip color="azul">
            <UserRound size={13} /> {r.con_peticion} con petición de cliente
          </Chip>
        )}
        {r.mas_baratos_en_otro > 0 && (
          <Chip color="ambar">
            <TrendingDown size={13} /> {r.mas_baratos_en_otro} más {r.mas_baratos_en_otro === 1 ? 'barato' : 'baratos'} en otro
          </Chip>
        )}
        {r.dias_entrega ? (
          <Chip color={r.condiciones_erp ? undefined : 'ambar'}>
            <Truck size={13} /> {r.dias_entrega} días{r.condiciones_erp ? '' : ' (ficha de GeminisWin)'}
          </Chip>
        ) : null}
        {r.portes_gratis_desde ? (
          <Chip color={r.importe >= r.portes_gratis_desde ? undefined : 'ambar'}>
            {r.importe >= r.portes_gratis_desde ? 'Portes pagados' : `Portes gratis desde ${eur0(r.portes_gratis_desde)}`}
          </Chip>
        ) : null}
        <button type="button" onClick={onCondiciones} className="inline-flex items-center gap-1 rounded-full border border-[#d5dcec] px-2.5 py-0.5 font-semibold text-[#33415f] hover:bg-[#f1f5fd]">
          <Settings2 size={13} /> Condiciones
        </button>
      </div>

      <div>
        <div className="h-2 overflow-hidden rounded-full bg-[#e9eef8]">
          <div className={`h-full rounded-full ${llega ? 'bg-[#1f9d55]' : 'bg-[#e0a100]'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className={`mt-1 text-[13px] font-semibold ${llega ? 'text-[#127a12]' : 'text-[#8a5a00]'}`}>
          {minimo == null ? 'Sin pedido mínimo (ponlo en «Condiciones»)' : llega ? `Llega al pedido mínimo (${eur0(minimo)})` : `Faltan ${eur0(minimo - r.importe)} para el mínimo (${eur0(minimo)})`}
        </div>
      </div>

      {r.aplazado_hasta ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-[#5b6680]">Aguantando hasta el {fecha(r.aplazado_hasta)}</span>
          <button type="button" onClick={() => onAplazar(0)} className="h-9 rounded-full border border-[#d5dcec] px-4 text-[14px] font-semibold hover:bg-[#f1f5fd]">
            Volver a decidir
          </button>
        </div>
      ) : (
        <div className="relative flex gap-2">
          <button type="button" onClick={onAbrir} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1d3a8a] text-[15px] font-semibold text-white hover:bg-[#16306f]">
            <Send size={15} /> Revisar y enviar
          </button>
          <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-[#d5dcec] px-4 text-[15px] font-semibold hover:bg-[#f1f5fd]">
            <AlarmClock size={15} /> Aguantar
          </button>
          {menu && (
            <div className="absolute bottom-11 right-0 z-10 flex flex-col overflow-hidden rounded-xl border border-[#d5dcec] bg-white text-[14px] shadow-lg">
              {[7, 14, 30].map((d) => (
                <button key={d} type="button" className="px-4 py-2 text-left hover:bg-[#f1f5fd]" onClick={() => (setMenu(false), onAplazar(d))}>
                  {d === 7 ? 'Una semana' : d === 14 ? 'Dos semanas' : 'Un mes'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function Chip({ children, color }: { children: React.ReactNode; color?: 'rojo' | 'ambar' | 'azul' }) {
  const c = color === 'rojo' ? 'bg-[#fdecea] text-[#b3261e]' : color === 'azul' ? 'bg-[#dfe9ff] text-[#16306f]' : color === 'ambar' ? 'bg-[#fff4d6] text-[#7a5200]' : 'bg-[#eef2fb] text-[#33415f]'
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${c}`}>{children}</span>
}

function Capa({ titulo, onCerrar, children, ancho = 'max-w-[1100px]' }: { titulo: string; onCerrar: () => void; children: React.ReactNode; ancho?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[#0b1530]/40 p-3 md:p-8" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <div role="dialog" aria-label={titulo} className={`w-full ${ancho} rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between gap-2 border-b border-[#e1e7f3] px-5 py-3">
          <h2 className="truncate text-[19px] font-bold">{titulo}</h2>
          <button type="button" aria-label="Cerrar" onClick={onCerrar} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f5fd]">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/** La propuesta de un proveedor: se quita lo que no se quiera, se cambian cantidades y se crea el pedido. */
function Propuesta({ r, onCerrar, onCreado }: { r: Resumen; onCerrar: () => void; onCreado: (texto: string, numero: number) => void }) {
  const [lineas, setLineas] = useState<Linea[] | null>(null)
  const [cant, setCant] = useState<Record<string, number>>({})
  const [fuera, setFuera] = useState<Set<string>>(new Set())
  const [bajoPedido, setBajoPedido] = useState<Set<string>>(new Set())

  async function noPedirSolo(l: Linea) {
    setError(null)
    const { error: e } = await supabase.rpc('fn_compras_articulo_decidir', { p_articulo: l.articulo_codigo, p_decision: 'bajo_pedido', p_motivo: 'Desde la propuesta semanal' })
    if (e) return setError(e.message)
    setBajoPedido(new Set(bajoPedido).add(l.articulo_codigo))
    setFuera(new Set(fuera).add(l.articulo_codigo))
  }

  async function deshacerBajoPedido(l: Linea) {
    setError(null)
    const { error: e } = await supabase.rpc('fn_compras_articulo_decidir', { p_articulo: l.articulo_codigo, p_decision: null, p_motivo: null })
    if (e) return setError(e.message)
    const b = new Set(bajoPedido)
    b.delete(l.articulo_codigo)
    setBajoPedido(b)
    const f = new Set(fuera)
    f.delete(l.articulo_codigo)
    setFuera(f)
  }
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    supabase.rpc('fn_compras_semanal_propuesta', { p_proveedor: r.proveedor_codigo }).then(({ data, error: e }) => {
      if (e) return setError(e.message)
      const ls = ((data ?? []) as Linea[]).map((l) => ({ ...l, stock_actual: num(l.stock_actual), pendiente_recibir: num(l.pendiente_recibir), stock_minimo: num(l.stock_minimo), stock_maximo: num(l.stock_maximo), peticiones: num(l.peticiones), cantidad_sugerida: num(l.cantidad_sugerida), coste: num(l.coste), importe: num(l.importe), mejor_coste: l.mejor_coste == null ? null : num(l.mejor_coste), venta_mes: l.venta_mes == null ? null : num(l.venta_mes), ultima_compra_uds: l.ultima_compra_uds == null ? null : num(l.ultima_compra_uds) }))
      ls.sort((a, b) => a.stock_actual - b.stock_actual || a.descripcion.localeCompare(b.descripcion))
      setLineas(ls)
      setCant(Object.fromEntries(ls.map((l) => [l.articulo_codigo, l.cantidad_sugerida])))
    })
  }, [r.proveedor_codigo])

  const elegidas = (lineas ?? []).filter((l) => !fuera.has(l.articulo_codigo) && (cant[l.articulo_codigo] ?? 0) > 0)
  const total = elegidas.reduce((s, l) => s + (cant[l.articulo_codigo] ?? 0) * l.coste, 0)
  const minimo = r.compra_minima && r.compra_minima > 0 ? r.compra_minima : null

  async function crear() {
    setError(null)
    if (!elegidas.length) return setError('No hay ninguna línea marcada.')
    setCreando(true)
    const { data, error: e } = await supabase.rpc('fn_compras_crear_pedido', {
      p_proveedor: r.proveedor_codigo,
      p_lineas: elegidas.map((l) => ({ articulo: l.articulo_codigo, cantidad: cant[l.articulo_codigo] })),
      p_almacen: null,
      p_observaciones: 'Propuesta semanal por mínimos y máximos (Gestor de Pedidos 2.0): revisar antes de confirmar',
      p_tienda: TIENDA,
    })
    setCreando(false)
    if (e) return setError(e.message)
    const d = data as { numero: number; lineas: number; total: number }
    onCreado(`Pedido ${d.numero} creado para ${r.proveedor_nombre ?? r.proveedor_codigo}: ${d.lineas} líneas, ${eur(num(d.total))}. Queda pendiente.`, d.numero)
  }

  return (
    <Capa titulo={`${r.proveedor_nombre ?? r.proveedor_codigo} · propuesta de pedido`} onCerrar={onCerrar}>
      {!lineas && !error && <p className="text-[15px] text-[#5b6680]">Cargando la propuesta…</p>}
      {lineas && (
        <div className="max-h-[58vh] overflow-auto rounded-xl border border-[#e1e7f3]">
          <table className="w-full border-collapse text-[14px]">
            <thead className="sticky top-0 z-10 bg-[#f4f7fc] text-left text-[12px] uppercase tracking-wide text-[#5b6680]">
              <tr>
                <th className="w-9 px-2 py-2" />
                <th className="px-2 py-2">Artículo</th>
                <th className="w-[190px] px-2 py-2">Stock · mín · máx</th>
                <th className="w-[100px] px-2 py-2 text-right">Pedir</th>
                <th className="w-[90px] px-2 py-2 text-right">Precio</th>
                <th className="w-[100px] px-2 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => {
                const quitada = fuera.has(l.articulo_codigo)
                const c = cant[l.articulo_codigo] ?? 0
                const tope = Math.max(l.stock_maximo, l.stock_actual, 1)
                return (
                  <tr key={l.articulo_codigo} className={`border-t border-[#eef2f8] ${quitada ? 'opacity-45' : ''}`}>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!quitada}
                        aria-label={`Incluir ${l.descripcion}`}
                        onChange={() => {
                          const s = new Set(fuera)
                          if (quitada) s.delete(l.articulo_codigo)
                          else s.add(l.articulo_codigo)
                          setFuera(s)
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-semibold">{l.descripcion}</div>
                      <div className="text-[12px] text-[#7a849c]">
                        {l.articulo_codigo}
                        {l.referencia_compra ? ` · ref. ${l.referencia_compra}` : ''}
                        {l.unidades_por_caja && l.unidades_por_caja > 1 ? ` · caja de ${uds(l.unidades_por_caja)}` : ''}
                      </div>
                      <div className="text-[12px] text-[#5b6680]">
                        {l.tipo === 'raro' ? <b className="text-[#7a5200]">Raro · </b> : l.tipo === 'intermitente' ? 'Intermitente · ' : ''}
                        {l.venta_mes ? `vende ~${uds(l.venta_mes)}/mes` : 'sin ventas en 12 meses'}
                        {l.ultima_compra_uds ? ` · última compra ${uds(l.ultima_compra_uds)} uds${l.ultima_compra_fecha ? ` el ${fecha(l.ultima_compra_fecha)}` : ''}` : ''}
                        {l.dias_dura_compra ? ` · le dura ~${l.dias_dura_compra} días` : ''}
                      </div>
                      {l.stock_actual < 0 && (
                        <div className="text-[12px] text-[#b42318]">Stock negativo en GeminisWin: se cuenta como 0.</div>
                      )}
                      {bajoPedido.has(l.articulo_codigo) ? (
                        <div className="text-[12px] font-semibold text-[#7a5200]">
                          Marcado «Bajo pedido»: ya no se propondrá solo (solo si lo pide un cliente).{' '}
                          <button type="button" onClick={() => void deshacerBajoPedido(l)} className="font-normal underline">
                            Deshacer
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void noPedirSolo(l)}
                          title="Marca el artículo «Bajo pedido»: deja de proponerse por mínimos y solo se pide cuando lo pide un cliente. Se puede deshacer aquí mismo"
                          className="mr-2 text-[12px] text-[#5b6680] underline hover:text-[#1d3a8a]"
                        >
                          No pedir solo
                        </button>
                      )}
                      {l.peticiones > 0 && (
                        <div className="mr-1 mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#dfe9ff] px-2 py-0.5 text-[12px] font-semibold text-[#16306f]">
                          <UserRound size={12} /> {uds(l.peticiones)} {l.peticiones === 1 ? 'pedida por un cliente' : 'pedidas por clientes'}
                        </div>
                      )}
                      {l.mejor_proveedor && l.mejor_coste != null && (
                        <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#fff4d6] px-2 py-0.5 text-[12px] font-semibold text-[#7a5200]">
                          <TrendingDown size={12} /> Más barato en {l.mejor_proveedor_nombre ?? l.mejor_proveedor}: {eur(l.mejor_coste)} ({Math.round((1 - l.mejor_coste / l.coste) * 100)} % menos)
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="relative h-2 rounded-full bg-[#e9eef8]">
                        <div className={`absolute inset-y-0 left-0 rounded-full ${l.stock_actual <= 0 ? 'bg-[#c42b1c]' : 'bg-[#e0a100]'}`} style={{ width: `${Math.max(0, Math.min(100, (l.stock_actual / tope) * 100))}%` }} />
                        <div className="absolute -top-0.5 h-3 w-0.5 bg-[#33415f]" style={{ left: `${Math.min(100, (l.stock_minimo / tope) * 100)}%` }} title="Mínimo" />
                      </div>
                      <div className="mt-1 text-[12px] tabular-nums text-[#5b6680]">
                        <b className={l.stock_actual <= 0 ? 'text-[#c42b1c]' : 'text-[#1b2540]'}>{uds(l.stock_actual)}</b> · {uds(l.stock_minimo)} · {uds(l.stock_maximo)}
                        {l.pendiente_recibir > 0 ? ` · +${uds(l.pendiente_recibir)} en camino` : ''}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        disabled={quitada}
                        aria-label={`Cantidad de ${l.descripcion}`}
                        className="h-8 w-[84px] rounded-lg border border-[#c9d3e8] px-2 text-right tabular-nums"
                        value={c}
                        onChange={(e) => setCant({ ...cant, [l.articulo_codigo]: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.coste ? eur(l.coste) : <span className="text-[#c42b1c]">sin precio</span>}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{quitada ? '' : eur(c * l.coste)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] text-[#5b6680]">
            {elegidas.length} {elegidas.length === 1 ? 'línea' : 'líneas'} · sin IGIC
          </div>
          <div className="text-[24px] font-bold tabular-nums">{eur(total)}</div>
          {minimo != null && <div className={`text-[13px] font-semibold ${total >= minimo ? 'text-[#127a12]' : 'text-[#8a5a00]'}`}>{total >= minimo ? `Llega al pedido mínimo (${eur0(minimo)})` : `Faltan ${eur0(minimo - total)} para el pedido mínimo`}</div>}
          {r.portes_gratis_desde ? (
            <div className={`text-[13px] font-semibold ${total >= r.portes_gratis_desde ? 'text-[#127a12]' : 'text-[#8a5a00]'}`}>
              {total >= r.portes_gratis_desde ? 'Portes pagados' : `Faltan ${eur0(r.portes_gratis_desde - total)} para portes gratis`}
            </div>
          ) : null}
          {error && (
            <div role="alert" className="text-[14px] font-bold text-[#c42b1c]">
              {error}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="h-10 rounded-full border border-[#d5dcec] px-5 text-[15px] font-semibold hover:bg-[#f1f5fd]">
            Cancelar
          </button>
          <button type="button" onClick={() => void crear()} disabled={creando || !elegidas.length} className="flex h-10 items-center gap-1.5 rounded-full bg-[#1d3a8a] px-5 text-[15px] font-semibold text-white hover:bg-[#16306f] disabled:opacity-50">
            <Send size={15} /> {creando ? 'Creando…' : 'Crear pedido'}
          </button>
        </div>
      </div>
    </Capa>
  )
}

/** Condiciones de compra del proveedor en el ERP: plazo real, pedido mínimo y portes gratis (mandan sobre GeminisWin). */
function Condiciones({ r, onCerrar, onGuardado }: { r: Resumen; onCerrar: () => void; onGuardado: (texto: string) => void }) {
  const [plazo, setPlazo] = useState(r.dias_entrega != null ? String(r.dias_entrega) : '')
  const [minimo, setMinimo] = useState(r.compra_minima != null ? String(r.compra_minima).replace('.', ',') : '')
  const [portes, setPortes] = useState(r.portes_gratis_desde != null ? String(r.portes_gratis_desde).replace('.', ',') : '')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const n = (t: string) => (t.trim() === '' ? null : Number(t.replace(/\./g, '').replace(',', '.')))

  useEffect(() => {
    supabase
      .from('compra_proveedor_condicion')
      .select('notas')
      .eq('proveedor_codigo', r.proveedor_codigo)
      .maybeSingle()
      .then(({ data }) => setNotas((data as { notas: string | null } | null)?.notas ?? ''))
  }, [r.proveedor_codigo])

  async function guardar() {
    const p = n(plazo)
    const m = n(minimo)
    const g = n(portes)
    if ([p, m, g].some((x) => x != null && !Number.isFinite(x))) return setError('Revisa los números: solo cifras, con coma para los decimales.')
    setGuardando(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_compras_proveedor_condicion_poner', {
      p_proveedor: r.proveedor_codigo,
      p_plazo_dias: p == null ? null : Math.round(p),
      p_pedido_minimo: m,
      p_portes_gratis_desde: g,
      p_notas: notas || null,
    })
    setGuardando(false)
    if (e) return setError(e.message)
    onGuardado(`${r.proveedor_nombre ?? r.proveedor_codigo}: condiciones guardadas; ${num((data as { articulos_recalculados: number }).articulos_recalculados)} artículos recalculados con el plazo nuevo.`)
  }

  const campo = 'h-10 w-full rounded-lg border border-[#c9d3e8] px-3 text-right text-[15px] tabular-nums'
  return (
    <Capa titulo={`${r.proveedor_nombre ?? r.proveedor_codigo} · condiciones de compra`} onCerrar={onCerrar} ancho="max-w-[520px]">
      <div className="flex flex-col gap-3 text-[14px]">
        {!r.condiciones_erp && (
          <p className="rounded-xl bg-[#fff4d6] px-3 py-2 text-[#6b4a00]">Ahora salen los datos de la ficha de GeminisWin. Lo que guardes aquí manda sobre ellos y el espejo no lo pisa.</p>
        )}
        <label className="flex items-center justify-between gap-3">
          <span>
            <b>Plazo de entrega</b> (días desde que se pide hasta que llega)
          </span>
          <input className={`${campo} max-w-[110px]`} inputMode="numeric" value={plazo} onChange={(e) => setPlazo(e.target.value)} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <b>Pedido mínimo</b> (€ sin IGIC)
          </span>
          <input className={`${campo} max-w-[140px]`} inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <b>Portes gratis desde</b> (€ sin IGIC)
          </span>
          <input className={`${campo} max-w-[140px]`} inputMode="decimal" value={portes} onChange={(e) => setPortes(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <b>Notas</b>
          <textarea className="min-h-[70px] rounded-lg border border-[#c9d3e8] p-2" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Día de reparto, persona de contacto, cómo se le pide…" />
        </label>
        <p className="text-[13px] text-[#5b6680]">Deja en blanco lo que no sepas. Al cambiar el plazo se recalculan al momento los mínimos de los artículos de este proveedor.</p>
        {error && (
          <p role="alert" className="font-bold text-[#c42b1c]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="h-10 rounded-full border border-[#d5dcec] px-5 font-semibold hover:bg-[#f1f5fd]">
            Cancelar
          </button>
          <button type="button" onClick={() => void guardar()} disabled={guardando} className="h-10 rounded-full bg-[#1d3a8a] px-5 font-semibold text-white hover:bg-[#16306f] disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Capa>
  )
}

/** Raros por decidir: los que se venden 3 meses o menos al año. Primero los que tienen stock parado. */
function Raros({ proveedores, onCambio, onError }: { proveedores: { codigo: string; nombre: string | null }[]; onCambio: () => void; onError: (t: string | null) => void }) {
  const [filtro, setFiltro] = useState('')
  const [filas, setFilas] = useState<Raro[] | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setFilas(null)
    const { data, error: e } = await supabase.rpc('fn_compras_raros', { p_proveedor: filtro || null, p_todos: false })
    if (e) return onError(e.message)
    setFilas(((data ?? []) as Raro[]).map((f) => ({ ...f, stock_actual: num(f.stock_actual), valor_stock: num(f.valor_stock), venta_12m: num(f.venta_12m), coste: num(f.coste) })))
    setMarcados(new Set())
  }, [filtro, onError])
  useEffect(() => {
    void cargar()
  }, [cargar])

  async function decidir(codigos: string[], decision: 'stock' | 'bajo_pedido') {
    setOcupado(true)
    onError(null)
    const { error: e } = await supabase.rpc('fn_compras_articulos_decidir', { p_articulos: codigos, p_decision: decision, p_motivo: null })
    setOcupado(false)
    if (e) return onError(e.message)
    await cargar()
    onCambio()
  }

  const conStock = (filas ?? []).filter((f) => f.stock_actual > 0)
  const todos = (filas ?? []).map((f) => f.articulo_codigo)
  const elegidos = [...marcados]
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[#e1e7f3] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <Sparkles size={16} className="text-[#7a5200]" />
        <b>Artículos raros</b>
        <span className="text-[#5b6680]">(se venden 3 meses o menos al año). Decide si se tienen en stock o se traen bajo pedido.</span>
        <select className="ml-auto h-9 rounded-full border border-[#d5dcec] px-3" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nombre ?? p.codigo}
            </option>
          ))}
        </select>
      </div>
      {filas && conStock.length > 0 && (
        <p className="rounded-xl bg-[#fff4d6] px-3 py-2 text-[14px] text-[#6b4a00]">
          <b>{conStock.length}</b> {conStock.length === 1 ? 'tiene' : 'tienen'} stock hoy ({eur0(conStock.reduce((s, f) => s + f.valor_stock, 0))} parados): salen arriba. Si no los marcas «En stock», no se repondrán.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <button type="button" className="h-9 rounded-full border border-[#d5dcec] px-3 hover:bg-[#f1f5fd]" onClick={() => setMarcados(new Set(marcados.size === todos.length ? [] : todos))}>
          {marcados.size === todos.length && todos.length ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
        <span className="text-[#5b6680]">{elegidos.length} marcados</span>
        <button type="button" disabled={ocupado || !elegidos.length} onClick={() => void decidir(elegidos, 'stock')} className="h-9 rounded-full bg-[#1f9d55] px-4 font-semibold text-white disabled:opacity-40">
          En stock
        </button>
        <button type="button" disabled={ocupado || !elegidos.length} onClick={() => void decidir(elegidos, 'bajo_pedido')} className="h-9 rounded-full bg-[#33415f] px-4 font-semibold text-white disabled:opacity-40">
          Bajo pedido
        </button>
        {ocupado && <span className="text-[#5b6680]">Guardando…</span>}
      </div>
      {!filas && <p className="text-[14px] text-[#5b6680]">Cargando…</p>}
      {filas && !filas.length && <p className="text-[14px] text-[#5b6680]">No queda ningún raro por decidir{filtro ? ' de este proveedor' : ''}.</p>}
      {filas && filas.length > 0 && (
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-[#e1e7f3]">
          <table className="w-full border-collapse text-[14px]">
            <thead className="sticky top-0 bg-[#f4f7fc] text-left text-[12px] uppercase tracking-wide text-[#5b6680]">
              <tr>
                <th className="w-9 px-2 py-2" />
                <th className="px-2 py-2">Artículo</th>
                <th className="px-2 py-2">Proveedor</th>
                <th className="px-2 py-2 text-right">Vendido en 12 meses</th>
                <th className="px-2 py-2 text-right">Stock hoy</th>
                <th className="px-2 py-2 text-right">Coste</th>
                <th className="w-[230px] px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.articulo_codigo} className="border-t border-[#eef2f8]">
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={marcados.has(f.articulo_codigo)}
                      aria-label={`Marcar ${f.descripcion}`}
                      onChange={() => {
                        const s = new Set(marcados)
                        if (s.has(f.articulo_codigo)) s.delete(f.articulo_codigo)
                        else s.add(f.articulo_codigo)
                        setMarcados(s)
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-semibold">{f.descripcion}</div>
                    <div className="text-[12px] text-[#7a849c]">
                      {f.articulo_codigo}
                      {f.peticiones_abiertas ? ` · ${uds(num(f.peticiones_abiertas))} pedidas por clientes` : ''}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-[13px]">{f.proveedor_nombre ?? f.proveedor_codigo ?? '—'}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {uds(f.venta_12m)} uds <span className="text-[12px] text-[#7a849c]">· {f.meses_con_venta} {f.meses_con_venta === 1 ? 'mes' : 'meses'}</span>
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${f.stock_actual > 0 ? 'font-semibold' : 'text-[#7a849c]'}`}>
                    {uds(f.stock_actual)}
                    {f.valor_stock > 0 ? <div className="text-[12px] font-normal text-[#7a849c]">{eur0(f.valor_stock)}</div> : null}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{f.coste ? eur(f.coste) : '—'}</td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" disabled={ocupado} onClick={() => void decidir([f.articulo_codigo], 'stock')} className="h-8 whitespace-nowrap rounded-full border border-[#1f9d55] px-3 text-[13px] font-semibold text-[#127a12] hover:bg-[#eaf7ef] disabled:opacity-40">
                        En stock
                      </button>
                      <button type="button" disabled={ocupado} onClick={() => void decidir([f.articulo_codigo], 'bajo_pedido')} className="h-8 whitespace-nowrap rounded-full border border-[#33415f] px-3 text-[13px] font-semibold text-[#33415f] hover:bg-[#eef2fb] disabled:opacity-40">
                        Bajo pedido
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[13px] text-[#5b6680]">Se enseñan como mucho 500 a la vez; al decidir salen de la lista y aparecen los siguientes. Las decisiones se pueden cambiar más adelante.</p>
    </section>
  )
}
