import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwDate, GwField, GwGroup, GwInput, GwNumber, GwSelect, GwTabs, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { useFichaMaestro } from '../almacen/useFichaMaestro'
import { PieEstado } from '../almacen/piezas'
import { BotonCasilla } from '../ventas/maestros/common'
import { BloqueDireccion, CampoEnlace, GrupoSmtp, ObservacionesImagen, PestanaPendiente, PestanasAbajo, hoy, useEsAdministrador } from './comun'
import { ContadoresTienda, guardarContadores, type EdicionContadores } from './ContadoresTienda'

export interface Tienda {
  codigo: string
  descripcion: string
  nif: string | null
  fecha_alta: string | null
  fecha_baja: string | null
  activa: boolean
  codigo_postal: string | null
  direccion: string | null
  poblacion: string | null
  provincia_codigo: string | null
  pais_codigo: string | null
  telefono_fijo: string | null
  telefono_movil: string | null
  fax: string | null
  email: string | null
  web: string | null
  smtp_servidor: string | null
  smtp_usuario: string | null
  smtp_puerto: number | null
  smtp_ssl: boolean
  almacen_codigo: string | null
  zona_territorial_codigo: string | null
  cuenta_centro_coste: string | null
  cuenta_caja: string | null
  cuenta_compras: string | null
  cuenta_banco_compras: string | null
  cuenta_efectos_pagar: string | null
  cuenta_ventas: string | null
  cuenta_banco_ventas: string | null
  cuenta_efectos_cobrar: string | null
  cuenta_efectos_impagados: string | null
  asignar_vendedor_cliente: boolean
  parametros_exclusivos: boolean
  generar_pagos_con_tienda: boolean
  generar_mov_caja_con_tienda: boolean
  igic_en_linea_defecto: boolean
  igic_modo: number
  igic_defecto_pct: number | null
  oficina_central_codigo: string | null
  es_caja_central: boolean
  fp_cierre_efectivo_codigo: string | null
  fp_cierre_tarjetas_codigo: string | null
  fp_cierre_talones_codigo: string | null
  fp_cierre_efectos_codigo: string | null
  contadores_externos: Record<string, unknown>
  bloqueo_contadores: number | null
  tarifa_acceso: Record<string, number | null>
  igic_incluido_nivel0: boolean
  igic_incluido_nivel1: boolean
  igic_incluido_nivel2: boolean
  igic_incluido_nivel3: boolean
  igic_incluido_nivel4: boolean
  igic_incluido_nivel5: boolean
  igic_incluido_nivel6: boolean
  observaciones: string | null
  imagen_url: string | null
  imagen_modo: number
  tipo: string
  actualizado_en?: string
}

const VACIA: Tienda = {
  codigo: '',
  descripcion: '',
  nif: null,
  fecha_alta: null,
  fecha_baja: null,
  activa: true,
  codigo_postal: null,
  direccion: null,
  poblacion: null,
  provincia_codigo: null,
  pais_codigo: null,
  telefono_fijo: null,
  telefono_movil: null,
  fax: null,
  email: null,
  web: null,
  smtp_servidor: null,
  smtp_usuario: null,
  smtp_puerto: null,
  smtp_ssl: false,
  almacen_codigo: null,
  zona_territorial_codigo: null,
  cuenta_centro_coste: null,
  cuenta_caja: null,
  cuenta_compras: null,
  cuenta_banco_compras: null,
  cuenta_efectos_pagar: null,
  cuenta_ventas: null,
  cuenta_banco_ventas: null,
  cuenta_efectos_cobrar: null,
  cuenta_efectos_impagados: null,
  asignar_vendedor_cliente: false,
  parametros_exclusivos: false,
  generar_pagos_con_tienda: false,
  generar_mov_caja_con_tienda: false,
  igic_en_linea_defecto: false,
  igic_modo: 0,
  igic_defecto_pct: null,
  oficina_central_codigo: null,
  es_caja_central: false,
  fp_cierre_efectivo_codigo: null,
  fp_cierre_tarjetas_codigo: null,
  fp_cierre_talones_codigo: null,
  fp_cierre_efectos_codigo: null,
  contadores_externos: {},
  bloqueo_contadores: null,
  tarifa_acceso: {},
  igic_incluido_nivel0: false,
  igic_incluido_nivel1: false,
  igic_incluido_nivel2: false,
  igic_incluido_nivel3: false,
  igic_incluido_nivel4: false,
  igic_incluido_nivel5: false,
  igic_incluido_nivel6: false,
  observaciones: null,
  imagen_url: null,
  imagen_modo: 1,
  tipo: 'tienda',
}

const TABS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'enlaces', label: 'Enlaces' },
    { key: 'parametros', label: 'Parámetros' },
    { key: 'bancos', label: 'Bancos' },
    { key: 'obs', label: 'Observaciones e Imagen' },
  ],
]

const SUBTABS = [
  { key: 'generales', label: 'Parámetros Generales' },
  { key: 'contadores', label: 'Contadores' },
  { key: 'tarifas', label: 'Parametrización de las Tarifas de los PVPs' },
]

/** Alto del panel de pestañas, igual en todas (como la ventana fija de GeminisWin). */
const ALTO = 468

type Patch = (p: Partial<Tienda>) => void

/** Archivo → Tiendas, calcada de la ficha TIENDAS de GeminisWin (capturas 05-01 a 05-06). */
export function TiendaFichaPage() {
  const f = useFichaMaestro<Tienda>({
    tabla: 'tienda_terminal',
    base: '/tiendas',
    vacio: VACIA,
    campoNombre: 'descripcion',
    que: 'la tienda',
    titulo: 'Tiendas',
    rpc: 'gw_lista_ordenada_maestros',
  })
  const { draft, patch, editing, mode } = f
  const admin = useEsAdministrador()
  const [tab, setTab] = useState('generales')
  const [subtab, setSubtab] = useState('generales')
  const [buscar, setBuscar] = useState(false)
  const [contadores, setContadores] = useState<EdicionContadores>({})
  const [recargaContadores, setRecargaContadores] = useState(0)

  useEffect(() => setContadores({}), [f.registro.codigo, mode])

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing
  const d = draft

  async function aceptar() {
    const cambios = Object.keys(contadores).length
    if (
      cambios &&
      !confirm(
        `Vas a cambiar ${cambios} contador(es) de numeración de la tienda ${d.codigo}.\n\n` +
          'Los contadores dan el número legal de facturas, ventas y demás documentos (VeriFactu): ' +
          'un número mal puesto deja huecos o repite numeración. ¿Seguro?',
      )
    )
      return
    const ok = await f.guardar(
      () => (!d.codigo.trim() || !d.descripcion.trim() ? 'El código y la descripción son obligatorios.' : null),
      cambios ? (cod) => guardarContadores(cod, contadores) : undefined,
    )
    if (ok) {
      setContadores({})
      setRecargaContadores((n) => n + 1)
    }
  }

  async function baja() {
    if (f.sinRegistros || !f.registro.codigo) return
    if (!confirm(`¿Dar de baja la tienda ${f.registro.codigo} ${f.registro.descripcion}? Queda marcada con fecha de baja, no se borra.`)) return
    const { error } = await supabase.from('tienda_terminal').update({ activa: false, fecha_baja: hoy() }).eq('codigo', f.registro.codigo)
    if (error) return f.setError(error.message)
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[96px_minmax(0,1fr)_205px_175px] gap-x-3">
        <GwField label="Código">
          <GwCampoBusqueda
            value={d.codigo}
            editable={mode === 'alta'}
            disabled={mode === 'edicion'}
            title="CODIGO"
            maxLength={4}
            onChange={(v) => patch({ codigo: v.toUpperCase() })}
            {...f.busqueda('codigo')}
          />
        </GwField>
        <GwField label="Descripción">
          <GwCampoBusqueda value={d.descripcion} editable={editing} title="DESCRIPCION" onChange={(v) => patch({ descripcion: v })} {...f.busqueda('nombre')} />
        </GwField>
        <GwField label="Cif/Nif">
          <GwInput value={d.nif ?? ''} disabled={ro} title="NIF" onChange={(e) => patch({ nif: e.target.value || null })} />
        </GwField>
        <GwField label="Fecha de alta">
          <GwDate value={d.fecha_alta} disabled={ro} title="F_ALTA" onChange={(v) => patch({ fecha_alta: v })} />
        </GwField>
      </div>
      {(f.error || (!f.registro.activa && !f.sinRegistros && mode !== 'alta')) && (
        <div className="text-[13px] text-[#c42b1c]">{f.error ?? 'Tienda dada de baja.'}</div>
      )}

      <GwTabs rows={TABS} active={tab} onChange={setTab}>
        {f.sinRegistros ? (
          <PestanaPendiente texto="No hay ninguna tienda. Pulsa Nuevo para dar de alta la primera." alto={ALTO} />
        ) : (
          <div style={{ height: ALTO }} className="overflow-hidden">
            {tab === 'generales' && <DatosGenerales d={d} ro={ro} onChange={patch} />}
            {tab === 'enlaces' && <Enlaces d={d} ro={ro} onChange={patch} />}
            {tab === 'parametros' && (
              <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1 overflow-hidden">
                  {subtab === 'generales' && <ParametrosGenerales d={d} ro={ro} onChange={patch} />}
                  {subtab === 'contadores' && (
                    <ContadoresTienda
                      key={`${f.registro.codigo}-${recargaContadores}`}
                      tienda={mode === 'alta' ? null : f.registro.codigo}
                      admin={admin === true}
                      editando={editing}
                      externos={d.contadores_externos}
                      bloqueo={d.bloqueo_contadores}
                      edicion={contadores}
                      onEdicion={setContadores}
                      onExternos={(v) => patch({ contadores_externos: v })}
                      onBloqueo={(v) => patch({ bloqueo_contadores: v })}
                    />
                  )}
                  {subtab === 'tarifas' && <TarifasPvp d={d} ro={ro} onChange={patch} />}
                </div>
                <PestanasAbajo tabs={SUBTABS} active={subtab} onChange={setSubtab} />
              </div>
            )}
            {tab === 'bancos' && (
              <PestanaPendiente texto="Bancos de la tienda: pendiente. Las cuentas bancarias no se cargan ni se muestran en el ERP." alto={ALTO} />
            )}
            {tab === 'obs' && (
              <ObservacionesImagen
                nombre="tienda"
                observaciones={d.observaciones}
                imagenUrl={d.imagen_url}
                imagenModo={d.imagen_modo ?? 1}
                ro={ro}
                alto={ALTO - 12}
                onChange={(p) => patch(p)}
              />
            )}
          </div>
        )}
      </GwTabs>

      <GwRecordBar
        mode={mode}
        canNavigate={f.canNavigate}
        saving={f.saving}
        onFirst={() => f.irA('primero')}
        onPrev={() => f.irA('anterior')}
        onNext={() => f.irA('siguiente')}
        onLast={() => f.irA('ultimo')}
        onSort={() => f.setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={() => f.navigate('/tiendas/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={baja}
        onSave={aceptar}
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.total} mode={mode} que="tienda" />

      {buscar && (
        <GwLookupDialog<{ codigo: string; descripcion: string; poblacion: string | null }>
          title="Buscar Tienda"
          table="tienda_terminal"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'poblacion', label: 'Población', width: 160 },
          ]}
          searchColumns={['codigo', 'descripcion', 'poblacion']}
          orderBy={f.orden === 'codigo' ? 'codigo' : 'descripcion'}
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(false)
            f.goTo(r.codigo)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
      {f.dialogoLista}
    </div>
  )
}

function DatosGenerales({ d, ro, onChange }: { d: Tienda; ro: boolean; onChange: Patch }) {
  return (
    <div className="flex flex-col gap-1.5 px-2 pt-4">
      <BloqueDireccion
        r={d}
        ro={ro}
        onChange={onChange}
        derechaFila1={
          <GwField label="Fecha de Baja">
            <GwDate value={d.fecha_baja} disabled={ro} title="F_BAJA" onChange={(v) => onChange({ fecha_baja: v })} />
          </GwField>
        }
      />
      <div className="mr-[37%] flex flex-col gap-1.5">
        <GwField label="Dirección E-mail (Correo Electrónico)">
          <GwInput value={d.email ?? ''} disabled={ro} title="DIREMAIL" onChange={(e) => onChange({ email: e.target.value || null })} />
        </GwField>
        <GwField label="Dirección Web (URL)">
          <GwInput value={d.web ?? ''} disabled={ro} title="DIRWEB" onChange={(e) => onChange({ web: e.target.value || null })} />
        </GwField>
      </div>
      <GrupoSmtp r={d} ro={ro} onChange={onChange} />
    </div>
  )
}

function Cuenta({ label, value, ro, title, onChange }: { label: string; value: string | null; ro: boolean; title: string; onChange: (v: string | null) => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_178px] items-center gap-2 px-1.5 py-[3px]">
      <span className="text-[15px]">{label}</span>
      <GwInput value={value ?? ''} disabled={ro} title={title} onChange={(e) => onChange(e.target.value || null)} />
    </div>
  )
}

function Enlaces({ d, ro, onChange }: { d: Tienda; ro: boolean; onChange: Patch }) {
  return (
    <div className="flex flex-col gap-2 px-1.5 pt-4">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <GwGroup title={<span className="text-[15px]">Almacen predeterminado asignado a esta tienda</span>}>
          <CampoEnlace tabla="almacen" campoNombre="nombre" titulo="Almacenes" anchoCodigo={130} title="ALMACEN" value={d.almacen_codigo} disabled={ro} onChange={(v) => onChange({ almacen_codigo: v })} />
        </GwGroup>
        <GwGroup title={<span className="text-[15px]">Zona Territorial</span>}>
          <CampoEnlace tabla="zona_territorial" campoNombre="descripcion" titulo="Zonas Territoriales" anchoCodigo={130} title="ZONA" value={d.zona_territorial_codigo} disabled={ro} onChange={(v) => onChange({ zona_territorial_codigo: v })} />
        </GwGroup>
      </div>
      <div className="mt-3 border-b border-[var(--gw-border-light)] pl-6 text-[17px]">Enlace Contable</div>
      <div className="grid grid-cols-[575px_505px] gap-x-8 px-4">
        <div className="border border-[var(--gw-border-light)]">
          <Cuenta label="Código Centro de Coste:" value={d.cuenta_centro_coste} ro={ro} title="CENTROCOSTE" onChange={(v) => onChange({ cuenta_centro_coste: v })} />
          <Cuenta label="Cuenta de Caja (570):" value={d.cuenta_caja} ro={ro} title="CTACAJA" onChange={(v) => onChange({ cuenta_caja: v })} />
          <div className="border-y border-[var(--gw-border-light)] px-1.5 py-1 text-[16px]">Cuentas Contables Compras</div>
          <Cuenta label="Cuenta de compras (600):" value={d.cuenta_compras} ro={ro} title="CTACOMPRAS" onChange={(v) => onChange({ cuenta_compras: v })} />
          <Cuenta label="Banco C/C vista (572):" value={d.cuenta_banco_compras} ro={ro} title="CTABANCOCOMP" onChange={(v) => onChange({ cuenta_banco_compras: v })} />
          <Cuenta label="Efectos a Pagar (401):" value={d.cuenta_efectos_pagar} ro={ro} title="CTAEFECPAGAR" onChange={(v) => onChange({ cuenta_efectos_pagar: v })} />
        </div>
        <div className="self-end">
          <div className="px-1.5 py-1 text-[16px]">Cuentas Contables Ventas</div>
          <div className="border border-[var(--gw-border-light)]">
            <Cuenta label="Ventas (700):" value={d.cuenta_ventas} ro={ro} title="CTAVENTAS" onChange={(v) => onChange({ cuenta_ventas: v })} />
            <Cuenta label="Banco C/C vista (572):" value={d.cuenta_banco_ventas} ro={ro} title="CTABANCOVENT" onChange={(v) => onChange({ cuenta_banco_ventas: v })} />
            <Cuenta label="Efectos a cobrar (4310):" value={d.cuenta_efectos_cobrar} ro={ro} title="CTAEFECCOBRAR" onChange={(v) => onChange({ cuenta_efectos_cobrar: v })} />
            <Cuenta label="Efct. impagados (4315):" value={d.cuenta_efectos_impagados} ro={ro} title="CTAEFECIMPAG" onChange={(v) => onChange({ cuenta_efectos_impagados: v })} />
          </div>
        </div>
      </div>
    </div>
  )
}

const IGIC_MODOS = ['Predeterminado', 'Siempre', 'Nunca']

function ParametrosGenerales({ d, ro, onChange }: { d: Tienda; ro: boolean; onChange: Patch }) {
  const [ejercicio, setEjercicio] = useState<number | null>(null)
  useEffect(() => {
    if (!d.codigo) return
    supabase
      .from('caja_apertura_cierre')
      .select('ejercicio')
      .eq('tienda_terminal_codigo', d.codigo)
      .order('ejercicio', { ascending: false })
      .limit(1)
      .then(({ data }) => setEjercicio((data as { ejercicio: number }[] | null)?.[0]?.ejercicio ?? 0))
  }, [d.codigo])

  const check = (k: keyof Tienda, label: string, title: string) => (
    <GwCheck className="text-[17px]" label={<span title={title}>{label}</span>} checked={Boolean(d[k])} disabled={ro} onChange={(v) => onChange({ [k]: v } as Partial<Tienda>)} />
  )
  const fp = (k: keyof Tienda, titulo: string, title: string) => (
    <GwGroup title={<span className="text-[15px]">{titulo}</span>} className="!py-1">
      <CampoEnlace tabla="forma_pago" campoNombre="descripcion" titulo="Formas de Pago" desplegable title={title} value={(d[k] as string | null) ?? null} disabled={ro || !d.es_caja_central} onChange={(v) => onChange({ [k]: v } as Partial<Tienda>)} />
    </GwGroup>
  )
  return (
    <div className="grid h-full grid-cols-[minmax(0,690px)_minmax(0,545px)] justify-between gap-x-4 px-3 pt-3">
      <div className="flex flex-col gap-3">
        {check('asignar_vendedor_cliente', 'Asignar el Vendedor del Cliente en Ventas y Pedidos', 'ASIGVENDCLI')}
        <div className="flex flex-col gap-1">
          {check('parametros_exclusivos', 'Activar parámetros exclusivos para ésta tienda', 'PARAMEXCLU')}
          {check('generar_pagos_con_tienda', 'Generar los pagos de las facturas con ésta tienda', 'GENPAGOSTDA')}
          {check('generar_mov_caja_con_tienda', 'Generar los movimientos de caja con ésta tienda', 'GENMOVCAJATDA')}
        </div>
        <GwGroup title={<span className="text-[17px]">IGIC en Ventas y Facturas</span>} className="mr-[10%] flex flex-col gap-1">
          {check('igic_en_linea_defecto', 'Utilizar por Defecto el IGIC en Linea', 'IGICLINEA')}
          <div className="grid grid-cols-[minmax(0,1fr)_210px] gap-x-3">
            <GwField label={<i className="text-[15px]">Utilizar IGIC en Ventas y Facturas</i>}>
              <GwSelect value={d.igic_modo ?? 0} disabled={ro} title="USARIGIC" onChange={(e) => onChange({ igic_modo: Number(e.target.value) })}>
                {IGIC_MODOS.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </GwSelect>
            </GwField>
            <GwField label={<i className="text-[15px]">IGIC Por Defecto</i>}>
              <GwNumber value={d.igic_defecto_pct} decimals={2} emptyAsZero disabled={ro} onChange={ro ? undefined : (v) => onChange({ igic_defecto_pct: v })} />
            </GwField>
          </div>
        </GwGroup>
      </div>
      <GwGroup className="flex flex-col gap-1 !pt-0">
        <span className="text-[15px]">Ejercicios de Caja</span>
        <div className="grid grid-cols-[minmax(0,1fr)_180px] items-center gap-2">
          <span className="text-[15px]">Nº Último Ejercicio de Caja:</span>
          <GwInput readOnly className="text-right" value={ejercicio ?? ''} title="Último ejercicio (apertura) de caja de la tienda — lo lleva Caja" />
        </div>
        <GwGroup title={<span className="text-[15px]">Tienda Caja Central</span>} className="!py-1">
          <CampoEnlace tabla="tienda_terminal" campoNombre="descripcion" titulo="Tiendas" anchoCodigo={52} title="TDACAJACEN" value={d.oficina_central_codigo} disabled={ro} onChange={(v) => onChange({ oficina_central_codigo: v })} />
        </GwGroup>
        <fieldset className="gw-group flex flex-col gap-0.5">
          <legend>
            <GwCheck className="text-[15px]" label="Esta tienda actúa de caja central" checked={d.es_caja_central} disabled={ro} onChange={(v) => onChange({ es_caja_central: v })} />
          </legend>
          {fp('fp_cierre_efectivo_codigo', 'F.P. del efectivo retirado en los cierres', 'FPEFECTIVO')}
          {fp('fp_cierre_tarjetas_codigo', 'F.P. del Total de Tarjetas en los cierres', 'FPTARJETAS')}
          {fp('fp_cierre_talones_codigo', 'F.P. de talones retirados en los cierres', 'FPTALONES')}
          {fp('fp_cierre_efectos_codigo', 'F.P. de efectos retirados en los cierres', 'FPEFECTOS')}
        </fieldset>
      </GwGroup>
    </div>
  )
}

const TARIFAS = ['General', 'MAYOR  M-1', 'MAYOR  M-2', 'MAYOR  M-3', 'Tarifa Dcto -4', 'Tarifa Dcto -5', 'Tarifa Dcto -6']

function TarifasPvp({ d, ro, onChange }: { d: Tienda; ro: boolean; onChange: Patch }) {
  const [roles, setRoles] = useState<{ id: number; nombre: string }[]>([])
  useEffect(() => {
    supabase
      .from('rol')
      .select('id, nombre')
      .order('id')
      .then(({ data }) => setRoles((data ?? []) as { id: number; nombre: string }[]))
  }, [])
  const acceso = d.tarifa_acceso ?? {}
  return (
    <div className="px-4 pt-3">
      <div className="grid w-[745px] grid-cols-[340px_270px_120px] items-end gap-x-2 text-[16px]">
        <span className="pl-3">Descripción de las tarifas</span>
        <span className="text-center">Permitir Acceso</span>
        <span className="text-center">IGIC incluido</span>
      </div>
      <div className="w-[745px] border border-[var(--gw-border-light)]">
        {TARIFAS.map((t, n) => {
          const k = `igic_incluido_nivel${n}` as keyof Tienda
          return (
            <div key={t} className="grid grid-cols-[340px_270px_120px] items-center gap-x-2 border-b border-[var(--gw-border-light)] px-1 py-[3px] last:border-b-0">
              <span className="border border-[var(--gw-border-light)] bg-[var(--gw-face)] px-2 py-[5px] text-[17px] whitespace-pre" title={`Nivel de tarifa ${n}`}>
                {t}
              </span>
              {n === 0 ? (
                <span className="text-center text-[17px]">A Todos</span>
              ) : (
                <GwSelect
                  value={acceso[String(n)] ?? ''}
                  disabled={ro}
                  title="Grupo de empleados que puede usar esta tarifa (vacío: todos)"
                  onChange={(e) => {
                    const nuevo = { ...acceso }
                    if (e.target.value === '') delete nuevo[String(n)]
                    else nuevo[String(n)] = Number(e.target.value)
                    onChange({ tarifa_acceso: nuevo })
                  }}
                >
                  <option value="" />
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </GwSelect>
              )}
              <BotonCasilla label="" checked={Boolean(d[k])} disabled={ro} title={`IGIC incluido en la tarifa ${t.trim()}`} className="h-[30px] justify-center" onChange={(v) => onChange({ [k]: v } as Partial<Tienda>)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
