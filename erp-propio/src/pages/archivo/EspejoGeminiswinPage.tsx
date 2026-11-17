// Archivo → Espejo de GeminisWin (Rober, 17/11/2026; solo super administradores). Pantalla de control del
// espejo (docs/PLAN_ESPEJO_GEMINISWIN.md): un programa en un PC de la oficina lee GeminisWin cada pocos
// minutos y copia aquí lo que cambia. Aquí se ve, tabla por tabla, qué ha llegado, qué falta por pasar al
// ERP y si hubo algún fallo; y se abren o cierran las áreas de solo consulta (quién manda en cada dato).
// Datos: fn_espejo_gw_panel (contadores y fechas, ningún dato de clientes ni artículos), area_dueno y
// fn_area_poner.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { GwTabs } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'

interface FilaTabla {
  tabla: string
  destino: string
  en_erp: number | null
  recibidas: number
  pendientes: number
  ultima_recepcion: string | null
  ultimo_cambio: string | null
  ultima_carga: string | null
  ultimo_error: { en: string; texto: string } | null
}
interface Panel {
  ahora: string
  ultimo_contacto: string | null
  equipo: string | null
  tablas: FilaTabla[]
}
interface AreaDueno {
  area: string
  nombre: string
  dueno: 'geminiswin' | 'erp'
  desde: string
  cambiado_por: string | null
  nota: string | null
}

/** Nombre de cada fichero de GeminisWin en cristiano. */
const NOMBRE: Record<string, string> = {
  PAISES: 'Países',
  PROVINCIAS: 'Provincias',
  FOMA: 'Formas de pago',
  ALMACEN: 'Almacenes',
  OFICINA: 'Tiendas',
  ZONATERR: 'Zonas',
  RUTAS: 'Rutas de reparto',
  RUTAZONA: 'Zonas de cada ruta',
  REPARTIDOR: 'Repartidores',
  RUTAREPA: 'Repartidores de cada ruta',
  VENDEDOR: 'Vendedores',
  TRANSPOR: 'Transportistas',
  PLANTTAR: 'Plantillas de tarifa',
  FAMILIAS: 'Familias',
  MARCAS: 'Marcas',
  PROVEEDO: 'Proveedores',
  TIPOCLIE: 'Tipos de cliente',
  CLIENTES: 'Clientes',
  ARTICULO: 'Artículos y precios',
  ARTBARRA: 'Códigos de barras',
  ARTDPROV: 'Proveedor habitual de cada artículo',
  ARTPROV: 'Referencias y precios de proveedor',
  ARTICALM: 'Stock por almacén',
  CLIENART: 'Precios especiales por cliente',
}
/** Todavía no se copian (ver docs/PLAN_ESPEJO_GEMINISWIN.md): no es un fallo que no avancen. */
const APLAZADAS: Record<string, string> = { CLIENART: '6,5 millones de registros: se copiará aparte, solo los precios en vigor' }

// Con punto de millar también en los números de cuatro cifras (toLocaleString en español no lo pone).
const num = (n: number | null | undefined) => (n == null ? '—' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'))
const cuando = (v: string | null) => (v ? new Date(v).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
function hace(v: string | null, ahora: string) {
  if (!v) return 'nunca'
  const min = Math.max(0, Math.round((new Date(ahora).getTime() - new Date(v).getTime()) / 60000))
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  if (min < 1440) return `hace ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
  return `hace ${Math.floor(min / 1440)} día(s)`
}

export function EspejoGeminiswinPage() {
  const { superAdmin, cargando } = usePermisos()
  const [tab, setTab] = useState('estado')
  if (cargando) return <div className="p-3 text-[13px]">Cargando…</div>
  if (!superAdmin) return <div className="p-3 text-[13px]">Solo los super administradores pueden ver el espejo de GeminisWin.</div>
  return (
    <div className="p-2">
      <GwTabs
        rows={[
          [
            { key: 'estado', label: 'Estado del espejo' },
            { key: 'areas', label: 'Áreas de solo consulta' },
            { key: 'operativa', label: 'Operativa' },
          ],
        ]}
        active={tab}
        onChange={setTab}
      >
        <div className="p-2">
          {tab === 'estado' && <EspejoEstado />}
          {tab === 'areas' && <EspejoAreas />}
          {tab === 'operativa' && <Operativa />}
        </div>
      </GwTabs>
    </div>
  )
}

export function EspejoEstado() {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mirando, setMirando] = useState(false)

  const cargar = useCallback(async () => {
    setMirando(true)
    const { data, error: e } = await supabase.rpc('fn_espejo_gw_panel')
    setMirando(false)
    if (e) return setError(e.message)
    setError(null)
    setPanel(data as Panel)
  }, [])

  // Se refresca solo cada medio minuto: durante una carga grande se ve avanzar sin tocar nada.
  useEffect(() => {
    void cargar()
    const t = setInterval(() => void cargar(), 30_000)
    return () => clearInterval(t)
  }, [cargar])

  if (error) return <div className="text-[13px] text-[#b00020]">No se pudo leer el estado: {error}</div>
  if (!panel) return <div className="text-[13px]">Mirando…</div>

  const activas = panel.tablas.filter((t) => !APLAZADAS[t.tabla])
  const conError = activas.filter((t) => t.ultimo_error)
  // Lo que quedó de la muestra de prueba de una tabla que el espejo aún no ha enviado no cuenta como «cargando».
  const sinLlegar = activas.filter((t) => !t.ultima_recepcion)
  const pendientes = activas.filter((t) => t.ultima_recepcion).reduce((s, t) => s + t.pendientes, 0)
  const [texto, color] = conError.length
    ? [`Hay ${conError.length} tabla(s) con un fallo sin resolver`, '#b00020']
    : pendientes
      ? [`Cargando: quedan ${num(pendientes)} registros por pasar al ERP`, '#b26a00']
      : sinLlegar.length
        ? [`Al día en lo recibido. Faltan por llegar ${sinLlegar.length} tabla(s) por primera vez`, '#b26a00']
        : ['Todo al día', '#1b7a2f']

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 rounded border border-[#c9d3e6] bg-[#f4f7fc] px-3 py-2">
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
        <b className="text-[15px]" style={{ color }}>
          {texto}
        </b>
        <span className="text-[13px] text-[#444]">
          Último contacto del PC{panel.equipo ? ` (${panel.equipo})` : ''}: <b>{hace(panel.ultimo_contacto, panel.ahora)}</b>
          {panel.ultimo_contacto ? ` · ${cuando(panel.ultimo_contacto)}` : ''}
        </span>
        <button type="button" className="gw-btn ml-auto" onClick={() => void cargar()} disabled={mirando}>
          {mirando ? 'Mirando…' : 'Actualizar'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="gw-grid w-full text-[13px]">
          <thead>
            <tr>
              <th className="text-left">Qué se copia</th>
              <th className="text-left">Fichero</th>
              <th className="text-right">Recibidos de GeminisWin</th>
              <th className="text-right">Por pasar al ERP</th>
              <th className="text-right">En el ERP</th>
              <th className="text-left">Última vez que llegó algo</th>
              <th className="text-left">Último cambio</th>
              <th className="text-left">Situación</th>
            </tr>
          </thead>
          <tbody>
            {panel.tablas.map((t) => {
              const aplazada = APLAZADAS[t.tabla]
              const [sit, c] = aplazada
                ? ['Aplazada', '#666']
                : t.ultimo_error
                  ? ['Fallo', '#b00020']
                  : !t.ultima_recepcion
                    ? ['Sin llegar todavía', '#b26a00']
                    : t.pendientes
                      ? ['Cargando', '#b26a00']
                      : ['Al día', '#1b7a2f']
              return (
                <tr key={t.tabla} title={aplazada ?? t.ultimo_error?.texto ?? ''}>
                  <td>{NOMBRE[t.tabla] ?? t.tabla}</td>
                  <td className="text-[#666]">{t.tabla}</td>
                  <td className="text-right">{num(t.recibidas)}</td>
                  <td className="text-right" style={{ fontWeight: t.pendientes && t.ultima_recepcion ? 700 : 400 }}>
                    {aplazada || !t.ultima_recepcion ? '—' : num(t.pendientes)}
                  </td>
                  <td className="text-right">{num(t.en_erp)}</td>
                  <td>{cuando(t.ultima_recepcion)}</td>
                  <td>{cuando(t.ultimo_cambio)}</td>
                  <td style={{ color: c, fontWeight: 700 }}>
                    {sit}
                    {t.ultimo_error && <span className="font-normal text-[#333]"> · {cuando(t.ultimo_error.en)}: {t.ultimo_error.texto}</span>}
                    {aplazada && <span className="font-normal text-[#666]"> · {aplazada}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-[#666]">
        «En el ERP» cuenta la tabla del ERP donde acaba cada fichero; no siempre coincide con lo recibido (dos ficheros pueden acabar en la misma tabla, y el ERP
        puede tener altas propias). Se actualiza sola cada medio minuto.
      </div>
    </div>
  )
}

export function EspejoAreas() {
  const [areas, setAreas] = useState<AreaDueno[]>([])
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('area_dueno').select('area, nombre, dueno, desde, cambiado_por, nota').order('nombre')
    if (error) return setMensaje({ texto: error.message, error: true })
    setAreas((data ?? []) as AreaDueno[])
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  async function cambiar(a: AreaDueno) {
    const abrir = a.dueno === 'geminiswin'
    const pregunta = abrir
      ? `¿ABRIR «${a.nombre}» en el ERP?\n\nA partir de ahora se podrá dar de alta, modificar y eliminar aquí. Hazlo solo cuando eso ya NO se toque en GeminisWin: si se cambia en los dos sitios, lo de GeminisWin pisa lo del ERP en la siguiente copia.`
      : `¿CERRAR «${a.nombre}» (solo consulta)?\n\nEn el ERP se podrá consultar pero no cambiar: los cambios se hacen en GeminisWin y llegan aquí en unos minutos.`
    if (!confirm(pregunta)) return
    const nota = prompt('Nota (opcional): por qué se cambia', '') ?? ''
    setOcupada(a.area)
    const { error } = await supabase.rpc('fn_area_poner', { p_area: a.area, p_dueno: abrir ? 'erp' : 'geminiswin', p_nota: nota })
    setOcupada(null)
    if (error) return setMensaje({ texto: error.message, error: true })
    setMensaje({ texto: abrir ? `«${a.nombre}» queda abierta en el ERP.` : `«${a.nombre}» queda en solo consulta.` })
    void cargar()
  }

  return (
    <div className="flex max-w-[980px] flex-col gap-2">
      {mensaje && <div className={`text-[13px] ${mensaje.error ? 'text-[#b00020]' : 'text-[#1b7a2f]'}`}>{mensaje.texto}</div>}
      <table className="gw-grid w-full text-[13px]">
        <thead>
          <tr>
            <th className="text-left">Área</th>
            <th className="text-left">Quién manda</th>
            <th className="text-left">Desde</th>
            <th className="text-left">Lo cambió</th>
            <th className="text-left">Nota</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.area}>
              <td>{a.nombre}</td>
              <td style={{ fontWeight: 700, color: a.dueno === 'geminiswin' ? '#b26a00' : '#1b7a2f' }}>
                {a.dueno === 'geminiswin' ? 'GeminisWin · aquí solo consulta' : 'ERP · aquí se puede cambiar'}
              </td>
              <td>{cuando(a.desde)}</td>
              <td>{a.cambiado_por ?? ''}</td>
              <td>{a.nota ?? ''}</td>
              <td className="text-right">
                <button type="button" className="gw-btn whitespace-nowrap" onClick={() => void cambiar(a)} disabled={ocupada === a.area}>
                  {a.dueno === 'geminiswin' ? 'Abrir en el ERP' : 'Cerrar (solo consulta)'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[12px] text-[#666]">
        En un área cerrada siguen pudiéndose cambiar los datos propios del ERP: stock mínimo y máximo del artículo, y pedido mínimo y días de entrega del proveedor.
        El cambio se nota en las fichas en un máximo de 5 minutos.
      </div>
    </div>
  )
}

function Operativa() {
  return (
    <GwOperativa
      bloques={[
        {
          titulo: 'Qué es el espejo',
          notas: [
            'Un programa en un PC de la oficina lee los ficheros de GeminisWin (solo los lee, nunca escribe en ellos) y copia al ERP lo que ha cambiado.',
            'Mientras GeminisWin siga siendo el programa de trabajo, él manda: lo que se cambie allí aparece aquí en unos minutos.',
            'Las copias del espejo no se apuntan en la Auditoría: no son cambios hechos por una persona en el ERP.',
          ],
        },
        {
          titulo: 'Ver si está al día',
          pasos: [
            'Mira la franja de arriba: «Todo al día» en verde, «Cargando» en naranja mientras entra una tanda, o el aviso de fallo en rojo.',
            '«Último contacto del PC» dice cuándo habló el programa por última vez. Si lleva mucho sin contactar, el PC está apagado o el programa parado.',
            'En la tabla, cada fila es un fichero de GeminisWin: cuántos registros han llegado, cuántos faltan por pasar al ERP y cuándo llegó algo por última vez.',
            'Pasa el ratón por una fila con «Fallo» para leer el error completo.',
          ],
          notas: [
            '«Por pasar al ERP» distinto de cero es normal durante una carga grande: baja solo. Si se queda fijo mucho rato, avisa.',
            'Un fallo deja de enseñarse cuando esa tabla vuelve a cargar bien.',
            '«Aplazada» no es un fallo: es una tabla que todavía no se copia.',
          ],
        },
        {
          titulo: 'Áreas de solo consulta',
          pasos: [
            'Cada área (artículos, clientes, proveedores, stock) tiene un dueño: GeminisWin o el ERP.',
            'Si manda GeminisWin, en el ERP la ficha se puede consultar pero no cambiar: sale un aviso y los botones Nuevo, Modificar y Eliminar se apagan.',
            'Cuando un área deje de tocarse en GeminisWin, pulsa «Abrir en el ERP». Para volver atrás, «Cerrar (solo consulta)».',
          ],
          notas: [
            'No abras un área que todavía se trabaja en GeminisWin: lo que se cambie aquí lo pisaría la siguiente copia.',
            'Queda apuntado quién abrió o cerró cada área y cuándo.',
          ],
        },
      ]}
    />
  )
}
