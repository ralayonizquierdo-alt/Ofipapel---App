// Archivo → Auditoría (Luis, 30/10/2026): quién cambió qué y cuándo. Solo super administradores
// (Luis, David y Rober); para el resto la opción sale apagada y la base de datos tampoco les deja
// leerla. Se registra solo lo que cambia (altas, cambios campo a campo y bajas), se guarda 5 años
// y no se puede modificar ni borrar. Cada consulta hecha aquí queda también registrada.
// Datos: fn_auditoria_consultar (migración 20261030_auditoria_completa).

import { useEffect, useMemo, useState } from 'react'
import { GwDate, GwInput, GwSelect } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { AuditoriaDocumentos } from './AuditoriaDocumentos'
import { AuditoriaConformidades } from './AuditoriaConformidades'

interface Fila {
  id: number
  ocurrido_en: string
  tabla: string
  operacion: 'INSERT' | 'UPDATE' | 'DELETE' | 'CONSULTA' | 'DEPURACION'
  registro: string | null
  tienda: string | null
  empleado: string | null
  empleado_nombre: string | null
  empleado_numero: string | null
  campos: string[] | null
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
}

/** Nombre de la pantalla para cada tabla; las que no están, con el nombre de la tabla legible. */
const PANTALLA: Record<string, string> = {
  articulo: 'Artículos',
  articulo_codigo_barras: 'Artículos · códigos de barras',
  articulo_precio_nivel: 'Artículos · tarifas',
  articulo_proveedor: 'Artículos · proveedores',
  articulo_oferta: 'Artículos · ofertas',
  articulo_lote: 'Artículos · lotes',
  auditoria: 'Auditoría (consultas)',
  caja_apertura_cierre: 'Caja · aperturas y cierres',
  cliente: 'Clientes',
  cliente_contacto: 'Clientes · contactos',
  cliente_sucursal: 'Clientes · sucursales',
  cliente_articulo_precio: 'Clientes · precios especiales',
  cobro_cliente: 'Cobros de clientes',
  empleado: 'Empleados',
  empleado_acceso: 'Empleados · límites de acceso',
  empleado_permiso: 'Empleados · permisos',
  empresa: 'Datos de Empresa',
  ejercicio: 'Periodos',
  factura: 'Facturas',
  factura_proveedor: 'Facturas de proveedor',
  familia: 'Familias',
  forma_pago: 'Formas de Pago',
  listado_guardado: 'Listados guardados',
  marca: 'Marcas',
  modificacion_precio: 'Modificación de precios',
  movimiento_caja: 'Caja · movimientos',
  movimiento_stock: 'Stock · movimientos (cambios y bajas)',
  pago_proveedor: 'Pagos a proveedores',
  parametro: 'Parámetros',
  parametro_empleado: 'Parámetros por empleado',
  pedido_cliente: 'Pedidos / Presupuestos',
  pedido_cliente_linea: 'Pedidos / Presupuestos · líneas',
  pedido_proveedor: 'Compras',
  pedido_proveedor_linea: 'Compras · líneas',
  permiso: 'Permisos',
  peticion: 'Peticiones',
  presupuesto_contacto: 'Presupuestos · seguimiento',
  presupuesto_correo: 'Presupuestos · correos',
  proveedor: 'Proveedores',
  repartidor: 'Repartidores',
  reparto: 'Repartos',
  reparto_linea: 'Repartos · entregas',
  rol: 'Grupos de Acceso',
  rol_permiso: 'Grupos de Acceso · permisos',
  ruta_reparto: 'Rutas de reparto',
  tienda_terminal: 'Tiendas',
  traspaso_almacen: 'Traspasos',
  vendedor: 'Vendedores',
  venta: 'Ventas / TPV',
  venta_linea: 'Ventas / TPV · líneas',
}
const pantalla = (t: string) => PANTALLA[t] ?? t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

const OPERACION: Record<Fila['operacion'], { texto: string; color: string }> = {
  INSERT: { texto: 'Alta', color: '#127a12' },
  UPDATE: { texto: 'Cambio', color: '#1d5fb4' },
  DELETE: { texto: 'Baja', color: '#c42b1c' },
  CONSULTA: { texto: 'Consulta auditoría', color: '#8a5a00' },
  DEPURACION: { texto: 'Depuración (+5 años)', color: '#8a5a00' },
}

const hoy = () => new Date().toLocaleDateString('sv-SE')
const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE')
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
const valor = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const CAMPOS_NOMBRE = ['nombre', 'descripcion', 'nombre_cliente', 'concepto', 'titulo']

/** Una línea para la lista: qué cambió (campo: antes → después) o qué se dio de alta / baja. */
function resumen(f: Fila): string {
  if (f.operacion === 'UPDATE') return (f.campos ?? []).map((c) => `${c}: ${valor(f.antes?.[c])} → ${valor(f.despues?.[c])}`).join(' · ')
  if (f.operacion === 'CONSULTA' || f.operacion === 'DEPURACION')
    return Object.entries(f.despues ?? {})
      .map(([k, v]) => `${k}: ${valor(v)}`)
      .join(' · ')
  const d = (f.operacion === 'DELETE' ? f.antes : f.despues) ?? {}
  const nombre = CAMPOS_NOMBRE.map((c) => d[c]).find((v) => v != null && v !== '')
  return nombre != null ? String(nombre) : ''
}

const POR_PAGINA = 200

export function AuditoriaPage() {
  const { superAdmin, cargando } = usePermisos()
  const [desde, setDesde] = useState(haceDias(7))
  const [hasta, setHasta] = useState(hoy())
  const [empleado, setEmpleado] = useState('')
  const [tabla, setTabla] = useState('')
  const [operacion, setOperacion] = useState('')
  const [texto, setTexto] = useState('')
  const [empleados, setEmpleados] = useState<{ codigo: string; nombre: string; numero_operario: string | null }[]>([])
  const [tablas, setTablas] = useState<string[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [sel, setSel] = useState<Fila | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState(false)
  const [pestana, setPestana] = useState<'registro' | 'documentos' | 'conformidades'>('registro')

  useEffect(() => {
    if (!superAdmin) return
    supabase
      .from('empleado')
      .select('codigo, nombre, numero_operario')
      .order('nombre')
      .then(({ data }) => setEmpleados((data ?? []) as typeof empleados))
    supabase
      .rpc('fn_auditoria_tablas')
      .then(({ data }) => setTablas(((data as string[]) ?? []).slice().sort((a, b) => pantalla(a).localeCompare(pantalla(b), 'es'))))
  }, [superAdmin])

  const buscar = async (mas = false) => {
    setBuscando(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_auditoria_consultar', {
      p_desde: desde,
      p_hasta: hasta,
      p_empleado: empleado || null,
      p_tabla: tabla || null,
      p_operacion: operacion || null,
      p_texto: texto || null,
      p_limite: POR_PAGINA,
      p_desplazamiento: mas ? filas.length : 0,
    })
    setBuscando(false)
    if (e) return setError(e.message)
    const r = data as { total: number; filas: Fila[] }
    setTotal(r.total)
    setFilas((prev) => (mas ? [...prev, ...r.filas] : r.filas))
    if (!mas) setSel(r.filas[0] ?? null)
  }

  // Primera búsqueda al entrar: los últimos 7 días.
  useEffect(() => {
    if (superAdmin) void buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superAdmin])

  const detalle = useMemo(() => {
    if (!sel) return []
    const claves = new Set([...Object.keys(sel.antes ?? {}), ...Object.keys(sel.despues ?? {})])
    const cambiados = new Set(sel.campos ?? [])
    return [...claves]
      .filter((k) => !['actualizado_en'].includes(k))
      .sort((a, b) => Number(cambiados.has(b)) - Number(cambiados.has(a)) || a.localeCompare(b))
      .map((k) => ({
        campo: k,
        antes: sel.antes?.[k],
        despues: sel.despues?.[k],
        cambiado: cambiados.has(k),
      }))
  }, [sel])

  if (cargando) return <div className="p-3 text-[13px]">Comprobando permisos…</div>
  if (!superAdmin) return <div className="p-3 text-[13px] font-bold text-[#c42b1c]">La auditoría solo la pueden ver los super administradores.</div>

  return (
    <div className="flex w-[1180px] max-w-full flex-col gap-1.5 text-[13px]">
      <div className="flex gap-1 border-b border-[var(--gw-border)]">
        {(
          [
            ['registro', 'Registro de cambios'],
            ['documentos', 'Documentos legales'],
            ['conformidades', 'Conformidades'],
          ] as const
        ).map(([v, t]) => (
          <button
            key={v}
            type="button"
            className={`-mb-px border border-[var(--gw-border)] px-3 py-1 ${pestana === v ? 'border-b-white bg-white font-bold' : 'bg-[var(--gw-face)]'}`}
            onClick={() => setPestana(v)}
          >
            {t}
          </button>
        ))}
      </div>
      {pestana === 'documentos' ? (
        <AuditoriaDocumentos />
      ) : pestana === 'conformidades' ? (
        <AuditoriaConformidades />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              <span className="gw-label">Desde</span>
              <GwDate value={desde} onChange={(v) => setDesde(v ?? hoy())} style={{ width: 100 }} />
            </label>
            <label className="flex flex-col">
              <span className="gw-label">Hasta</span>
              <GwDate value={hasta} onChange={(v) => setHasta(v ?? hoy())} style={{ width: 100 }} />
            </label>
            <label className="flex flex-col">
              <span className="gw-label">Empleado</span>
              <GwSelect className="w-[200px]" value={empleado} onChange={(e) => setEmpleado(e.target.value)}>
                <option value="">Todos</option>
                {empleados.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.numero_operario ?? e.codigo} · {e.nombre}
                  </option>
                ))}
              </GwSelect>
            </label>
            <label className="flex flex-col">
              <span className="gw-label">Pantalla</span>
              <GwSelect className="w-[230px]" value={tabla} onChange={(e) => setTabla(e.target.value)}>
                <option value="">Todas</option>
                {tablas.map((t) => (
                  <option key={t} value={t}>
                    {pantalla(t)}
                  </option>
                ))}
              </GwSelect>
            </label>
            <label className="flex flex-col">
              <span className="gw-label">Qué</span>
              <GwSelect className="w-[150px]" value={operacion} onChange={(e) => setOperacion(e.target.value)}>
                <option value="">Todo</option>
                <option value="INSERT">Altas</option>
                <option value="UPDATE">Cambios</option>
                <option value="DELETE">Bajas</option>
                <option value="CONSULTA">Consultas de la auditoría</option>
              </GwSelect>
            </label>
            <label className="flex flex-col">
              <span className="gw-label">Buscar (nº, código o valor)</span>
              <GwInput className="w-[180px]" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void buscar()} />
            </label>
            <button type="button" className="gw-btn h-[26px] font-bold" disabled={buscando} onClick={() => void buscar()}>
              {buscando ? 'Buscando…' : 'Buscar'}
            </button>
            <span className="flex-1" />
            <button type="button" className="gw-btn h-[26px]" onClick={() => setAyuda((a) => !a)}>
              Operativa
            </button>
          </div>

          {ayuda && (
            <div className="border border-[var(--gw-border)] bg-white p-2">
              <GwOperativa
                bloques={[
                  {
                    titulo: 'Consultar la auditoría',
                    pasos: [
                      'Elige las fechas y, si quieres, el empleado, la pantalla, el tipo (altas, cambios, bajas) o un nº / código / valor.',
                      'Pulsa Buscar (o Intro en el cuadro de buscar).',
                      'Pulsa una línea: abajo sale el detalle, campo a campo, antes y después (lo cambiado en amarillo).',
                      'Si hay más de 200, «Ver más» trae los siguientes.',
                    ],
                  },
                  {
                    titulo: 'Documentos legales (segunda pestaña)',
                    pasos: [
                      'Ahí está el texto de aviso a los empleados: «🖨 Imprimir texto», que lo firme cada uno y guarda la copia firmada.',
                      'Para guardar la copia firmada u otro documento: «＋ Nuevo documento», título, texto si quieres, y elige el archivo (PDF o foto, máx. 8 MB) → 💾 Guardar.',
                      'Para cambiar el texto o añadir un archivo a uno que ya existe: «Modificar / adjuntar archivo».',
                      'Los documentos no se borran: «Retirar» los quita de la lista (marca «Ver retirados» para verlos).',
                    ],
                  },
                  {
                    titulo: 'Conformidades (tercera pestaña)',
                    pasos: [
                      'Al entrar al programa, a cada empleado le sale el aviso legal hasta que marca «He leído…» y pulsa «Doy mi conformidad» (queda con día y hora).',
                      'Mientras no la dé, solo puede consultar: no puede modificar nada. En la columna «Sin conformidad» un super administrador puede elegir dejarle trabajar igualmente.',
                      'Aquí ves quién la ha dado y quién no (en rojo), con cuántos cambios ha hecho cada uno y el último.',
                      'Si se cambia el texto legal, a todos les vuelve a salir y aquí pone «PENDIENTE (dio la anterior…)».',
                      '🖨 Imprimir listado lo saca en papel.',
                    ],
                  },
                  {
                    titulo: 'Bueno es saber',
                    notas: [
                      'Se apunta solo lo que cambia: altas, bajas y cada campo modificado, con empleado, día, hora y tienda. Mirar una ficha no se apunta.',
                      'Nadie puede modificar ni borrar la auditoría, tampoco un super administrador. Se guarda 5 años.',
                      'Solo la ven los super administradores (Luis, David y Rober). Cada consulta queda también apuntada (Qué → Consultas de la auditoría).',
                      'Los empleados tienen que estar avisados por escrito de este registro (ley de protección de datos): pestaña «Documentos legales».',
                    ],
                  },
                ]}
              />
            </div>
          )}
          {error && <div className="font-bold text-[#c42b1c]">{error}</div>}

          <div className="text-[12px] text-[#555]">{total == null ? '' : `${total} registro(s)${filas.length < total ? ` · se ven ${filas.length}` : ''}`}</div>
          <div className="max-h-[42vh] overflow-auto border border-[var(--gw-border)]">
            <table className="gw-grid">
              <thead>
                <tr>
                  <th className="w-[150px]">Fecha y hora</th>
                  <th className="w-[150px]">Empleado</th>
                  <th className="w-[190px]">Pantalla</th>
                  <th className="w-[110px]">Registro</th>
                  <th className="w-[40px]">Ti.</th>
                  <th className="w-[120px]">Qué</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className={`cursor-pointer ${sel?.id === f.id ? 'gw-selected' : 'hover:bg-[#e5f1fb]'}`} onClick={() => setSel(f)}>
                    <td className="tabular-nums">{fechaHora(f.ocurrido_en)}</td>
                    <td className="truncate" title={f.empleado ?? ''}>
                      {f.empleado ? `${f.empleado_numero ?? f.empleado} · ${f.empleado_nombre ?? ''}` : '— (sistema)'}
                    </td>
                    <td className="truncate">{pantalla(f.tabla)}</td>
                    <td className="truncate">{f.registro ?? ''}</td>
                    <td>{f.tienda ?? ''}</td>
                    <td className="font-bold" style={{ color: OPERACION[f.operacion]?.color }}>
                      {OPERACION[f.operacion]?.texto ?? f.operacion}
                    </td>
                    <td className="max-w-0 truncate" title={resumen(f)}>
                      {resumen(f)}
                    </td>
                  </tr>
                ))}
                {total === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-[#777]">
                      No hay nada con esos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {total != null && filas.length < total && (
            <div>
              <button type="button" className="gw-btn" disabled={buscando} onClick={() => void buscar(true)}>
                Ver más
              </button>
            </div>
          )}

          {sel && (
            <fieldset className="gw-group !pt-0">
              <legend className="font-bold text-[#1d3a8a]">
                {OPERACION[sel.operacion]?.texto} · {pantalla(sel.tabla)} {sel.registro ? `· ${sel.registro}` : ''} · {fechaHora(sel.ocurrido_en)} ·{' '}
                {sel.empleado ? `Empl. ${sel.empleado_numero ?? sel.empleado} ${sel.empleado_nombre ?? ''}` : 'sistema'}
              </legend>
              <div className="max-h-[30vh] overflow-auto">
                <table className="gw-grid">
                  <thead>
                    <tr>
                      <th className="w-[220px]">Campo</th>
                      <th>Antes</th>
                      <th>Después</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((d) => (
                      <tr key={d.campo} style={d.cambiado ? { background: '#fff6d5' } : undefined}>
                        <td className={d.cambiado ? 'font-bold' : ''}>{d.campo}</td>
                        <td className="max-w-0 truncate" title={valor(d.antes)}>
                          {sel.operacion === 'INSERT' ? '' : valor(d.antes)}
                        </td>
                        <td className="max-w-0 truncate" title={valor(d.despues)}>
                          {sel.operacion === 'DELETE' ? '' : valor(d.despues)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
          )}
        </>
      )}
    </div>
  )
}
