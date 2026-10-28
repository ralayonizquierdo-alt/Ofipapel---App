// Archivo → Parámetros. SIN CAPTURA de GeminisWin: reúne en una ventana con pestañas los ajustes
// generales del programa que hoy estaban repartidos:
//   · Generales: tabla `parametro` (IGIC por defecto, decimales de precio, moneda de la empresa).
//     Se usan de verdad: IGIC de las líneas nuevas de venta y de la creación rápida de
//     artículos; decimales de precio en las líneas de pedidos, ventas y el ticket; moneda base de
//     Carga Cotización (src/lib/parametros.ts).
//   · Tiendas: lo que cada tienda/terminal propone por defecto (cliente de contado, almacén,
//     IGIC, fondo de caja). Es la misma tabla que la ficha de Tiendas.
//   · Empresa, VeriFactu y Web: consulta de su configuración, que se cambia en su pantalla
//     (Datos de Empresa, Web → Configuración) o el día del arranque real (VeriFactu).
// Solo los administradores pueden modificar (la RLS de `parametro` lo impone; las tiendas, por
// pantalla).

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwGroup, GwInput, GwNumber, GwSelect, GwTabs } from '../../components/gw'
import { supabase } from '../../lib/supabase'
import { cargarParametros } from '../../lib/parametros'
import { Mensaje } from '../utilidades/comun'
import { GwSpin, useEsAdministrador } from './comun'

interface ParamFila {
  clave: string
  valor: unknown
  descripcion: string | null
  actualizado_en: string | null
}

interface TiendaFila {
  codigo: string
  descripcion: string | null
  almacen_codigo: string | null
  cliente_contado_codigo: string | null
  igic_defecto_pct: number | null
  fondo_caja_inicial: number | null
  activa: boolean | null
}

const CLAVES_TIENDA = ['almacen_codigo', 'cliente_contado_codigo', 'igic_defecto_pct', 'fondo_caja_inicial'] as const

const TABS = [
  [
    { key: 'generales', label: 'Generales' },
    { key: 'tiendas', label: 'Tiendas / Terminales' },
    { key: 'empresa', label: 'Empresa' },
    { key: 'verifactu', label: 'VeriFactu' },
    { key: 'web', label: 'Web' },
  ],
]

type Registro = Record<string, unknown>

function Fila({ etiqueta, children, nota }: { etiqueta: string; children: ReactNode; nota?: string }) {
  return (
    <>
      <span className="gw-label">{etiqueta}:</span>
      <div className="flex items-center gap-2">{children}</div>
      <span className="text-[12px] text-[#555]">{nota}</span>
    </>
  )
}

function Consulta({ datos, campos }: { datos: Registro | null; campos: [string, string][] }) {
  if (!datos) return <div className="p-3 text-[13px] text-[#666]">Sin configuración guardada.</div>
  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
      {campos.map(([k, l]) => {
        const v = datos[k]
        return (
          <div key={k} className="contents">
            <span className="gw-label">{l}:</span>
            <GwInput readOnly value={Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : v == null ? '' : String(v)} />
          </div>
        )
      })}
    </div>
  )
}

export function ParametrosPage() {
  const navigate = useNavigate()
  const admin = useEsAdministrador()
  const [tab, setTab] = useState('generales')
  const [modo, setModo] = useState<'consulta' | 'edicion'>('consulta')
  const [params, setParams] = useState<Record<string, ParamFila>>({})
  const [borrador, setBorrador] = useState<Record<string, unknown>>({})
  const [tiendas, setTiendas] = useState<TiendaFila[]>([])
  const [tiendasEd, setTiendasEd] = useState<TiendaFila[]>([])
  const [monedas, setMonedas] = useState<{ codigo: string; descripcion: string }[]>([])
  const [almacenes, setAlmacenes] = useState<{ codigo: string; nombre: string | null }[]>([])
  const [empresa, setEmpresa] = useState<Registro | null>(null)
  const [verifactu, setVerifactu] = useState<Registro | null>(null)
  const [web, setWeb] = useState<Registro | null>(null)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const [p, t, m, a, e, v, w] = await Promise.all([
      supabase.from('parametro').select('clave, valor, descripcion, actualizado_en').order('clave'),
      supabase.from('tienda_terminal').select('codigo, descripcion, almacen_codigo, cliente_contado_codigo, igic_defecto_pct, fondo_caja_inicial, activa').order('codigo'),
      supabase.from('moneda').select('codigo, descripcion').eq('activo', true).order('codigo'),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
      supabase.from('empresa').select('codigo, nombre, nombre_comercial, cif, poblacion, email, smtp_servidor').order('codigo').limit(1).maybeSingle(),
      supabase.from('verifactu_configuracion').select('entorno, url_qr_pruebas, url_qr_produccion, software_nombre, software_version, leyenda').limit(1).maybeSingle(),
      supabase.from('web_configuracion').select('cliente_generico_codigo, tienda_terminal_codigo, almacen_codigo, articulo_portes_codigo, articulo_generico_codigo, estados_importables').limit(1).maybeSingle(),
    ])
    const err = p.error ?? t.error
    if (err) setMensaje({ texto: err.message, error: true })
    const mp = Object.fromEntries(((p.data ?? []) as ParamFila[]).map((r) => [r.clave, r]))
    setParams(mp)
    setBorrador(Object.fromEntries(Object.values(mp).map((r) => [r.clave, r.valor])))
    const lt = ((t.data ?? []) as TiendaFila[]).map((x) => ({ ...x, igic_defecto_pct: x.igic_defecto_pct == null ? null : Number(x.igic_defecto_pct), fondo_caja_inicial: x.fondo_caja_inicial == null ? null : Number(x.fondo_caja_inicial) }))
    setTiendas(lt)
    setTiendasEd(lt)
    setMonedas((m.data ?? []) as { codigo: string; descripcion: string }[])
    setAlmacenes((a.data ?? []) as { codigo: string; nombre: string | null }[])
    setEmpresa((e.data as Registro | null) ?? null)
    setVerifactu((v.data as Registro | null) ?? null)
    setWeb((w.data as Registro | null) ?? null)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const ro = modo === 'consulta'
  const val = (k: string) => borrador[k]
  const setVal = (k: string, v: unknown) => setBorrador((b) => ({ ...b, [k]: v }))
  const setTienda = (codigo: string, p: Partial<TiendaFila>) => setTiendasEd((l) => l.map((t) => (t.codigo === codigo ? { ...t, ...p } : t)))

  async function guardar() {
    setMensaje(null)
    const igic = Number(val('igic_defecto_pct'))
    const dec = Number(val('decimales_precio'))
    if (!Number.isFinite(igic) || igic < 0 || igic > 100) return setMensaje({ texto: 'El IGIC por defecto debe estar entre 0 y 100.', error: true })
    if (!Number.isInteger(dec) || dec < 0 || dec > 6) return setMensaje({ texto: 'Los decimales de precio van de 0 a 6.', error: true })
    setGuardando(true)
    const filas = Object.entries(borrador)
      .filter(([k, v]) => JSON.stringify(params[k]?.valor) !== JSON.stringify(v))
      .map(([clave, valor]) => ({ clave, valor, descripcion: params[clave]?.descripcion ?? null }))
    if (filas.length) {
      const { error } = await supabase.from('parametro').upsert(filas)
      if (error) {
        setGuardando(false)
        return setMensaje({ texto: error.message, error: true })
      }
    }
    let nTiendas = 0
    for (const t of tiendasEd) {
      const o = tiendas.find((x) => x.codigo === t.codigo)
      if (!o) continue
      const cambios = Object.fromEntries(CLAVES_TIENDA.filter((k) => o[k] !== t[k]).map((k) => [k, t[k] === '' ? null : t[k]]))
      if (!Object.keys(cambios).length) continue
      const { error } = await supabase.from('tienda_terminal').update(cambios).eq('codigo', t.codigo)
      if (error) {
        setGuardando(false)
        return setMensaje({ texto: `Tienda ${t.codigo}: ${error.message}`, error: true })
      }
      nTiendas++
    }
    await cargarParametros()
    setGuardando(false)
    setModo('consulta')
    setMensaje({ texto: filas.length || nTiendas ? `Parámetros guardados${nTiendas ? ` (${nTiendas} tienda(s))` : ''}.` : 'No había cambios.' })
    cargar()
  }

  function cancelar() {
    setBorrador(Object.fromEntries(Object.values(params).map((r) => [r.clave, r.valor])))
    setTiendasEd(tiendas)
    setModo('consulta')
    setMensaje(null)
  }

  return (
    <div className="flex w-[980px] max-w-full flex-col gap-1.5 text-[12px]">
      <GwTabs rows={TABS} active={tab} onChange={setTab}>
        <div className="h-[400px] overflow-auto p-1">
          {tab === 'generales' && (
            <GwGroup title="Parámetros generales del programa">
              <div className="grid grid-cols-[200px_160px_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
                <Fila etiqueta="IGIC por defecto (%)" nota="Líneas nuevas de venta, TPV y Creación rápida de artículos (antes fijo en 7 %)">
                  <GwNumber value={val('igic_defecto_pct') == null ? null : Number(val('igic_defecto_pct'))} decimals={2} emptyAsZero disabled={ro} onChange={ro ? undefined : (v) => setVal('igic_defecto_pct', v ?? 0)} />
                </Fila>
                <Fila etiqueta="Decimales de precio" nota="Precio de las líneas de Pedidos, Ventas / TPV y del ticket (antes fijo en 3)">
                  <GwSpin value={val('decimales_precio') == null ? 3 : Number(val('decimales_precio'))} max={6} disabled={ro} title="DECIMALES" onChange={(v) => setVal('decimales_precio', v ?? 0)} />
                </Fila>
                <Fila etiqueta="Moneda de la empresa" nota="Base de las cotizaciones de Carga Cotización">
                  <GwSelect value={String(val('moneda_empresa') ?? 'EUR')} disabled={ro} onChange={(e) => setVal('moneda_empresa', e.target.value)}>
                    <option value="EUR">EUR - Euro</option>
                    {monedas
                      .filter((m) => m.codigo !== 'EUR')
                      .map((m) => (
                        <option key={m.codigo} value={m.codigo}>
                          {m.codigo} - {m.descripcion}
                        </option>
                      ))}
                  </GwSelect>
                </Fila>
              </div>
              <p className="mt-3 text-[12px] text-[#555]">
                Otros ajustes tienen su sitio propio y no se duplican aquí: días de pago y vencimientos en Formas de Pago y en la ficha de cada cliente; periodo de
                trabajo en Seleccionar Periodo; cuentas contables en Contabilidad → Configuración Contable.
              </p>
            </GwGroup>
          )}
          {tab === 'tiendas' && (
            <GwGroup title="Valores por defecto de cada tienda / terminal (los mismos de la ficha de Tiendas)">
              <table className="gw-grid">
                <thead>
                  <tr>
                    <th className="w-[50px]">Tienda</th>
                    <th>Descripción</th>
                    <th className="w-[150px]">Almacén</th>
                    <th className="w-[120px]">Cliente contado</th>
                    <th className="w-[90px] text-right!">IGIC def. %</th>
                    <th className="w-[110px] text-right!">Fondo de caja</th>
                  </tr>
                </thead>
                <tbody>
                  {tiendasEd.map((t) => (
                    <tr key={t.codigo} className={t.activa === false ? 'text-[#888]' : ''}>
                      <td>{t.codigo}</td>
                      <td className="truncate">{t.descripcion}</td>
                      <td className="p-0!">
                        <GwSelect className="h-[20px]! w-full! border-0!" value={t.almacen_codigo ?? ''} disabled={ro} onChange={(e) => setTienda(t.codigo, { almacen_codigo: e.target.value || null })}>
                          <option value="" />
                          {almacenes.map((a) => (
                            <option key={a.codigo} value={a.codigo}>
                              {a.codigo} {a.nombre}
                            </option>
                          ))}
                        </GwSelect>
                      </td>
                      <td className="p-0!">
                        <GwInput className="h-[20px]! w-full! border-0!" value={t.cliente_contado_codigo ?? ''} readOnly={ro} maxLength={10} onChange={(e) => setTienda(t.codigo, { cliente_contado_codigo: e.target.value.trim() || null })} />
                      </td>
                      <td className="p-0!">
                        <GwNumber className="h-[20px]! w-full! border-0!" value={t.igic_defecto_pct} decimals={2} disabled={ro} onChange={ro ? undefined : (v) => setTienda(t.codigo, { igic_defecto_pct: v })} />
                      </td>
                      <td className="p-0!">
                        <GwNumber className="h-[20px]! w-full! border-0!" value={t.fondo_caja_inicial} decimals={2} disabled={ro} onChange={ro ? undefined : (v) => setTienda(t.codigo, { fondo_caja_inicial: v })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[12px] text-[#555]">El resto de datos de cada tienda (dirección, contadores, cuentas, SMTP…) se cambia en Archivo → Tiendas.</p>
            </GwGroup>
          )}
          {tab === 'empresa' && (
            <GwGroup title="Datos de empresa (se modifican en Archivo → Datos de Empresa)">
              <Consulta
                datos={empresa}
                campos={[
                  ['codigo', 'Código'],
                  ['nombre', 'Nombre'],
                  ['nombre_comercial', 'Nombre comercial'],
                  ['cif', 'C.I.F.'],
                  ['poblacion', 'Población'],
                  ['email', 'E-mail'],
                  ['smtp_servidor', 'Servidor SMTP'],
                ]}
              />
            </GwGroup>
          )}
          {tab === 'verifactu' && (
            <GwGroup title="VeriFactu (solo consulta: el paso a producción se decide el día del arranque real)">
              <Consulta
                datos={verifactu}
                campos={[
                  ['entorno', 'Entorno'],
                  ['url_qr_pruebas', 'URL del QR (pruebas)'],
                  ['url_qr_produccion', 'URL del QR (producción)'],
                  ['software_nombre', 'Software'],
                  ['software_version', 'Versión'],
                  ['leyenda', 'Leyenda'],
                ]}
              />
            </GwGroup>
          )}
          {tab === 'web' && (
            <GwGroup title="Conexión con la web (se modifica en Web → Configuración de la Conexión)">
              <Consulta
                datos={web}
                campos={[
                  ['cliente_generico_codigo', 'Cliente genérico'],
                  ['tienda_terminal_codigo', 'Tienda de los pedidos'],
                  ['almacen_codigo', 'Almacén'],
                  ['articulo_portes_codigo', 'Artículo de portes'],
                  ['articulo_generico_codigo', 'Artículo genérico'],
                  ['estados_importables', 'Estados que se importan'],
                ]}
              />
            </GwGroup>
          )}
        </div>
      </GwTabs>
      {mensaje && <Mensaje texto={mensaje.texto} error={mensaje.error} />}
      <div className="flex items-center gap-1.5">
        <span className="gw-label">
          {admin === false
            ? 'Solo los administradores pueden modificar los parámetros.'
            : params.igic_defecto_pct?.actualizado_en
              ? `Última modificación: ${new Date(Math.max(...Object.values(params).map((p) => +new Date(p.actualizado_en ?? 0)))).toLocaleString('es-ES')}`
              : ''}
        </span>
        <span className="flex-1" />
        <button type="button" className="gw-btn w-[90px]" disabled={!admin || !ro} onClick={() => setModo('edicion')}>
          Modificar
        </button>
        <button type="button" className="gw-btn w-[90px]" disabled={ro || guardando} onClick={guardar}>
          Aceptar
        </button>
        <button type="button" className="gw-btn w-[90px]" disabled={ro} onClick={cancelar}>
          Cancelar
        </button>
        <button type="button" className="gw-btn w-[90px]" onClick={() => navigate('/')}>
          Salir
        </button>
      </div>
    </div>
  )
}
