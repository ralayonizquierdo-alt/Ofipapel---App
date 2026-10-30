// Piezas comunes de la auditoría (Archivo → Auditoría y el botón «Historial» de cada ventana):
// nombres de pantallas y campos, una línea por campo cambiado, la lista con la cabecera fija, el
// panel de detalle y la exportación a Excel / PDF. Diseño del boceto de Luis (30/10/2026).

export interface Fila {
  id: number
  ocurrido_en: string
  tabla: string
  operacion: 'INSERT' | 'UPDATE' | 'DELETE' | 'CONSULTA' | 'DEPURACION' | 'ENTRADA' | 'SALIDA' | 'FALLO_CLAVE' | 'FUERA_HORARIO'
  registro: string | null
  /** Nombre del registro (cliente, artículo, descripción…), si se apuntó. */
  nombre?: string | null
  tienda: string | null
  empleado: string | null
  empleado_nombre: string | null
  empleado_numero: string | null
  campos: string[] | null
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
  /** Grupo de acceso del empleado («Super admin», «Administrador», «Dependiente»…). */
  grupo?: string | null
  ip?: string | null
  dispositivo?: string | null
  /** Si no lo hizo una persona: «Sistema», «Web»… */
  origen?: string | null
  /** En los avisos: por qué es un aviso. */
  motivo?: string | null
}

/** Nombre de la pantalla para cada tabla; las que no están, con el nombre de la tabla legible. */
const PANTALLA: Record<string, string> = {
  articulo: 'Artículos',
  articulo_codigo_barras: 'Artículos · códigos de barras',
  articulo_precio_nivel: 'Artículos · tarifas',
  articulo_proveedor: 'Artículos · proveedores',
  articulo_oferta: 'Artículos · ofertas',
  articulo_lote: 'Artículos · lotes',
  acceso: 'Entrada / salida del programa',
  auditoria: 'Auditoría (consultas)',
  auditoria_documento: 'Textos legales · documentos',
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
export const pantalla = (t: string) => PANTALLA[t] ?? t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export const OPERACION: Record<Fila['operacion'], { texto: string; color: string }> = {
  INSERT: { texto: 'Alta', color: '#127a12' },
  UPDATE: { texto: 'Cambio', color: '#1d5fb4' },
  DELETE: { texto: 'Baja', color: '#c42b1c' },
  CONSULTA: { texto: 'Consulta auditoría', color: '#8a5a00' },
  DEPURACION: { texto: 'Depuración (+5 años)', color: '#8a5a00' },
  ENTRADA: { texto: 'Entrada', color: '#127a12' },
  SALIDA: { texto: 'Salida', color: '#555' },
  FALLO_CLAVE: { texto: 'Contraseña incorrecta', color: '#c42b1c' },
  FUERA_HORARIO: { texto: 'Fuera de horario', color: '#c42b1c' },
}

export const hoy = () => new Date().toLocaleDateString('sv-SE')
export const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE')
export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
export const valor = (v: unknown) =>
  v == null || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : typeof v === 'object' ? JSON.stringify(v) : String(v)

/** Nombre de cada campo para leer (los que no están, con el nombre de la columna legible). */
const ETIQUETA: Record<string, string> = {
  nombre: 'Nombre',
  nombre_corto: 'Nombre corto',
  razon_social: 'Razón social',
  descripcion: 'Descripción',
  descripcion_corta: 'Descripción corta',
  nombre_cliente: 'Cliente',
  cliente_codigo: 'Nº cliente',
  proveedor_codigo: 'Proveedor',
  nif: 'NIF',
  nif_cliente: 'NIF cliente',
  contacto: 'Persona de contacto',
  direccion: 'Dirección',
  poblacion: 'Población',
  codigo_postal: 'Código postal',
  telefono_fijo: 'Teléfono',
  telefono_movil: 'Móvil',
  email: 'Correo',
  pvp: 'PVP',
  precio: 'Precio',
  precio_compra: 'Precio de compra',
  coste_puro: 'Coste',
  coste_neto: 'Coste neto',
  precio_medio_compra: 'Precio medio de compra',
  cantidad: 'Cantidad',
  descuento_pct: 'Dto. %',
  descuento_pie_pct: 'Dto. pie %',
  igic_pct: 'IGIC %',
  subtotal: 'Subtotal',
  total: 'Total',
  total_pagado: 'Pagado',
  total_pendiente: 'Pendiente',
  importe_cobrado: 'Importe cobrado',
  ingreso: 'Ingreso',
  gasto: 'Gasto',
  estado: 'Estado',
  presupuesto_estado: 'Estado del presupuesto',
  proximo_contacto: 'Próximo contacto',
  responsable_codigo: 'Responsable',
  motivo_perdida: 'Motivo de pérdida',
  vendedor_codigo: 'Comercial',
  empleado_codigo: 'Empleado',
  repartidor_codigo: 'Repartidor',
  ruta_codigo: 'Ruta',
  forma_pago_codigo: 'Forma de pago',
  tipo_credito: 'Contado / Crédito',
  tarifa_nivel: 'Tarifa',
  familia_codigo: 'Familia',
  codigo_venta: 'Código de venta',
  codigo_compra_habitual: 'Código de compra',
  codigo_barras_principal: 'Código de barras',
  stock_minimo: 'Stock mínimo',
  observaciones: 'Observaciones',
  fecha: 'Fecha',
  hora: 'Hora',
  fecha_inicio: 'Válido desde',
  fecha_fin: 'Válido hasta',
  fecha_entrega: 'Fecha de entrega',
  aceptado: 'Aceptado',
  preparado: 'Preparado',
  entregado: 'Entregado',
  anulado: 'Anulado',
  va_a_reparto: 'Va a reparto',
  activo: 'Activo',
  bloqueado: 'Bloqueado',
  limite_deuda: 'Límite de deuda',
  titulo: 'Título',
  contenido: 'Texto',
  archivo_nombre: 'Archivo',
  super_administrador: 'Super administrador',
  conformidad_obligatoria: 'Exige conformidad',
  rol_id: 'Grupo de acceso',
  numero_operario: 'Nº de empleado',
  valor: 'Valor',
}
export const etiqueta = (c: string) => ETIQUETA[c] ?? c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase())
const IGNORAR = new Set(['actualizado_en', 'creado_en', 'fecha_hora_actualizacion'])

/** Campos que cambiaron (los apuntes antiguos no los traen: se sacan comparando antes y después). */
export function cambiados(f: Fila): string[] {
  if (f.campos?.length) return f.campos
  if (f.operacion !== 'UPDATE') return []
  const claves = new Set([...Object.keys(f.antes ?? {}), ...Object.keys(f.despues ?? {})])
  return [...claves].filter((k) => !IGNORAR.has(k) && JSON.stringify(f.antes?.[k] ?? null) !== JSON.stringify(f.despues?.[k] ?? null)).sort()
}
const CAMPOS_NOMBRE = ['nombre_cliente', 'nombre', 'descripcion', 'titulo', 'concepto']

/** Nombre del registro: el apuntado o, en apuntes antiguos, el de los datos. */
export function nombreRegistro(f: Fila): string {
  if (f.nombre) return f.nombre
  const d = { ...(f.antes ?? {}), ...(f.despues ?? {}) }
  const n = CAMPOS_NOMBRE.map((c) => d[c]).find((v) => v != null && v !== '')
  return n != null ? String(n) : ''
}

/** Una línea para la lista: qué datos cambiaron (antes → después), o qué se dio de alta / baja. */
export function resumen(f: Fila): string {
  if (f.operacion === 'UPDATE')
    return (
      cambiados(f)
        .map((c) => `${etiqueta(c)}: ${valor(f.antes?.[c])} → ${valor(f.despues?.[c])}`)
        .join(' · ') || 'Sin cambios en los datos'
    )
  if (['ENTRADA', 'SALIDA', 'FALLO_CLAVE', 'FUERA_HORARIO'].includes(f.operacion))
    return [nombreRegistro(f), f.despues?.usuario ? `usuario: ${valor(f.despues.usuario)}` : ''].filter(Boolean).join(' · ')
  if (f.operacion === 'CONSULTA' || f.operacion === 'DEPURACION')
    return Object.entries(f.despues ?? {})
      .map(([k, v]) => `${k === 'tabla' ? 'pantalla' : k}: ${k === 'tabla' ? pantalla(String(v)) : valor(v)}`)
      .join(' · ')
  const n = nombreRegistro(f)
  return `${f.operacion === 'DELETE' ? 'Baja' : 'Alta'} de ${pantalla(f.tabla).toLowerCase()}${f.registro ? ` ${f.registro}` : ''}${n ? ` · ${n}` : ''}`
}

/** ¿Hubo modificación? Altas, cambios y bajas sí; consultas, entradas y salidas no. */
export const modifico = (f: Fila) => f.operacion === 'INSERT' || f.operacion === 'UPDATE' || f.operacion === 'DELETE'

/** Quién: «410 · Luis», o «Sistema» si no lo hizo una persona con sesión. */
export const quien = (f: Fila) => (f.empleado ? `${f.empleado_numero ?? f.empleado} · ${f.empleado_nombre ?? ''}` : (f.origen ?? 'Sistema'))

/** Una línea de la lista: en los cambios, una por cada campo cambiado. */
export interface Linea {
  clave: string
  fila: Fila
  campo: string | null
}
export function lineas(filas: Fila[]): Linea[] {
  return filas.flatMap((f): Linea[] => {
    const cs = f.operacion === 'UPDATE' ? cambiados(f) : []
    return cs.length ? cs.map((c) => ({ clave: `${f.id}-${c}`, fila: f, campo: c })) : [{ clave: String(f.id), fila: f, campo: null }]
  })
}

/** Texto de «Campo modificado» y de «Detalle» de una línea. */
export function textoLinea(l: Linea): { campo: string; antes: string | null; ahora: string | null; detalle: string } {
  const f = l.fila
  if (l.campo) return { campo: etiqueta(l.campo), antes: valor(f.antes?.[l.campo]), ahora: valor(f.despues?.[l.campo]), detalle: '' }
  const campo = f.operacion === 'INSERT' ? 'Alta' : f.operacion === 'DELETE' ? 'Baja' : (OPERACION[f.operacion]?.texto ?? f.operacion)
  return { campo, antes: null, ahora: null, detalle: resumen(f) }
}

const AZUL = '#1d3a8a'

/** Lista de la auditoría con la cabecera fija (como el boceto de Luis, 30/10/2026). */
export function TablaAuditoria({
  filas,
  sel,
  onSel,
  conMotivo = false,
  className = 'h-[52vh]',
}: {
  filas: Fila[]
  sel: Fila | null
  onSel: (f: Fila) => void
  conMotivo?: boolean
  className?: string
}) {
  const ls = lineas(filas)
  const th = 'sticky top-0 z-[1] whitespace-nowrap border-r border-[#3c5aa8] px-2.5 py-2 text-left text-[13px] font-bold text-white'
  const td = 'border-b border-r border-[#e6e6e6] px-2.5 py-1.5 align-top'
  return (
    <div className={`overflow-auto border border-[var(--gw-border)] bg-white ${className}`}>
      <table className="w-full border-separate border-spacing-0 text-[13.5px] leading-[18px]">
        <thead>
          <tr>
            {[
              'Fecha y hora',
              'Empleado',
              'Tipo clave acceso',
              'Pantalla',
              'Registro utilizado',
              'Terminal',
              '¿Modificó?',
              'Campo modificado',
              'Detalle (antes → ahora)',
            ]
              .concat(conMotivo ? ['Aviso'] : [])
              .map((t) => (
                <th key={t} className={th} style={{ background: AZUL }}>
                  {t}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {ls.map((l, i) => {
            const f = l.fila
            const t = textoLinea(l)
            const n = nombreRegistro(f)
            const fondo = sel?.id === f.id ? '#fff3c4' : i % 2 ? '#f6f9fd' : '#fff'
            return (
              <tr key={l.clave} className="cursor-pointer" onClick={() => onSel(f)} style={{ background: fondo }}>
                <td className={`${td} whitespace-nowrap tabular-nums`}>{fechaHora(f.ocurrido_en)}</td>
                <td className={`${td} whitespace-nowrap`}>{f.empleado ? quien(f) : <i className="text-[#666]">{quien(f)}</i>}</td>
                <td className={td}>
                  {f.grupo ? (
                    <span className="whitespace-nowrap rounded-[3px] border border-[#c9d7ee] bg-[#eef3fb] px-1.5 text-[12px] text-[#1d3a8a]">
                      {f.grupo === 'Super admin' ? '👑 ' : ''}
                      {f.grupo}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={td}>{pantalla(f.tabla)}</td>
                <td className={`${td} min-w-[180px]`}>
                  {f.registro || '—'}
                  {n ? <span className="text-[#444]"> · {n}</span> : null}
                </td>
                <td className={`${td} text-center`}>{f.tienda ?? '—'}</td>
                <td className={`${td} text-center`}>
                  {modifico(f) ? (
                    <span className="rounded-[10px] bg-[#d9f2d9] px-2.5 font-bold text-[#0d5c0d]">Sí</span>
                  ) : (
                    <span className="rounded-[10px] bg-[#eee] px-2.5 text-[#666]">No</span>
                  )}
                </td>
                <td className={`${td} font-bold`} style={{ color: l.campo ? AZUL : OPERACION[f.operacion]?.color }}>
                  {t.campo}
                </td>
                <td className={`${td} min-w-[220px]`}>
                  {t.antes != null ? (
                    <>
                      <span className="text-[#a33] line-through">{t.antes}</span> → <b className="text-[#127a12]">{t.ahora}</b>
                    </>
                  ) : (
                    t.detalle
                  )}
                </td>
                {conMotivo && <td className={`${td} font-bold text-[#c42b1c]`}>{f.motivo}</td>}
              </tr>
            )
          })}
          {!ls.length && (
            <tr>
              <td colSpan={conMotivo ? 10 : 9} className="p-3 text-center text-[#777]">
                No hay nada con esos filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Panel de la derecha: el apunte elegido, campo a campo. */
export function DetalleAuditoria({ fila }: { fila: Fila | null }) {
  if (!fila) return <div className="p-3 text-[13px] text-[#777]">Pulsa una línea para ver el detalle.</div>
  const cs = new Set(cambiados(fila))
  const claves = [...new Set([...Object.keys(fila.antes ?? {}), ...Object.keys(fila.despues ?? {})])]
    .filter((k) => !IGNORAR.has(k))
    .sort((a, b) => Number(cs.has(b)) - Number(cs.has(a)) || a.localeCompare(b))
  const n = nombreRegistro(fila)
  return (
    <div className="flex flex-col gap-1.5 p-2.5 text-[13px]">
      <div className="font-bold" style={{ color: AZUL }}>
        {OPERACION[fila.operacion]?.texto} · {pantalla(fila.tabla)}
      </div>
      {(fila.registro || n) && (
        <div>
          <b>{fila.registro}</b> {n}
        </div>
      )}
      <div>
        <b>Quién:</b> {quien(fila)}
        {fila.grupo ? ` (${fila.grupo})` : ''}
      </div>
      <div>
        <b>Cuándo:</b> {fechaHora(fila.ocurrido_en)}
      </div>
      <div>
        <b>Terminal:</b> {fila.tienda ?? '—'}
      </div>
      {fila.ip && (
        <div>
          <b>Conexión:</b> {fila.ip}
        </div>
      )}
      {fila.dispositivo && (
        <div className="text-[11px] text-[#666]" title={fila.dispositivo}>
          <b>Equipo:</b> {fila.dispositivo.slice(0, 90)}
        </div>
      )}
      {fila.motivo && <div className="font-bold text-[#c42b1c]">⚠ {fila.motivo}</div>}
      {claves.length > 0 && (
        <table className="mt-1 w-full border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              {['Campo', fila.operacion === 'INSERT' ? '' : 'Antes', fila.operacion === 'DELETE' ? '' : 'Ahora'].map((t, i) => (
                <th key={i} className="sticky top-0 px-2 py-1 text-left text-white" style={{ background: AZUL }}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {claves.map((k) => (
              <tr key={k} style={cs.has(k) ? { background: '#fff6d5' } : undefined}>
                <td className="border-b border-[#eee] px-2 py-1 font-bold" style={{ color: AZUL }} title={k}>
                  {etiqueta(k)}
                </td>
                <td className={`max-w-[120px] break-words border-b border-[#eee] px-2 py-1 ${cs.has(k) ? 'text-[#a33] line-through' : ''}`}>
                  {fila.operacion === 'INSERT' ? '' : valor(fila.antes?.[k])}
                </td>
                <td className={`max-w-[120px] break-words border-b border-[#eee] px-2 py-1 ${cs.has(k) ? 'font-bold text-[#127a12]' : ''}`}>
                  {fila.operacion === 'DELETE' ? '' : valor(fila.despues?.[k])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const COLUMNAS_EXPORTAR = [
  'Fecha y hora',
  'Empleado',
  'Tipo clave acceso',
  'Pantalla',
  'Registro utilizado',
  'Terminal',
  '¿Modificó?',
  'Campo modificado',
  'Antes',
  'Ahora',
  'Detalle',
  'Conexión',
]
function filasExportar(filas: Fila[]): string[][] {
  return lineas(filas).map((l) => {
    const f = l.fila
    const t = textoLinea(l)
    const n = nombreRegistro(f)
    return [
      fechaHora(f.ocurrido_en),
      quien(f),
      f.grupo ?? '',
      pantalla(f.tabla),
      `${f.registro ?? ''}${n ? ` · ${n}` : ''}`,
      f.tienda ?? '',
      modifico(f) ? 'Sí' : 'No',
      t.campo,
      t.antes ?? '',
      t.ahora ?? '',
      t.detalle,
      f.ip ?? '',
    ]
  })
}

/** Excel: un CSV con «;» y BOM, que Excel abre directamente con las tildes bien. */
export function exportarExcel(filas: Fila[], nombre: string) {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const csv = [COLUMNAS_EXPORTAR, ...filasExportar(filas)].map((r) => r.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** Imprimir / guardar en PDF (el navegador deja elegir «Guardar como PDF»). */
export function imprimirAuditoria(filas: Fila[], titulo: string) {
  const w = window.open('', '_blank')
  if (!w) return
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
  const cab = COLUMNAS_EXPORTAR.map((c) => `<th>${esc(c)}</th>`).join('')
  const cuerpo = filasExportar(filas)
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>` +
      `@page{size:A4 landscape;margin:10mm}body{font:9pt Arial,sans-serif}table{border-collapse:collapse;width:100%}` +
      `th{background:#1d3a8a;color:#fff;text-align:left}th,td{border:1px solid #bbb;padding:3px 5px;vertical-align:top}thead{display:table-header-group}` +
      `</style></head><body><h3>${esc(titulo)} · ${new Date().toLocaleString('es-ES')}</h3><table><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></body></html>`,
  )
  w.document.close()
  w.focus()
  w.print()
}
