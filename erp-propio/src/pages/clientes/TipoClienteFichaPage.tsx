import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwDate, GwField, GwGroup, GwInline, GwInput, GwNumber, GwSelect, GwTabs, GwTextArea, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { FilasVacias, GridMiniBar } from '../../components/gw/GwGridParts'
import { useFichaMaestro } from '../almacen/useFichaMaestro'
import { PieEstado } from '../almacen/piezas'
import { CampoEnlace, GwSpin, PestanaPendiente, hoy } from '../archivo/comun'
import { TEXTO_BAJA, bajaOReactivar } from '../archivo/bajaLogica'

interface TipoCliente {
  codigo: string
  descripcion: string
  actividad: string | null
  productos: string | null
  forma_pago_codigo: string | null
  zona_territorial_codigo: string | null
  vendedor_codigo: string | null
  tarifa_nivel_defecto: number | null
  no_permite_modificar_tarifa: boolean
  descuento_pct: number | null
  limite_deuda: number | null
  previsto_ventas: number | null
  observaciones: string | null
  'nº_copias_factura': number | null
  tienda_defecto_codigo: string | null
  tipo_factura: number | null
  incremento_sobre_coste_pct: number | null
  descuento_ficticio_pct: number | null
  tipo_documento_contado: number | null
  tipo_documento_credito: number | null
  dias_pago_1_tipo: number | null
  dias_pago_1: number | null
  dias_pago_2_tipo: number | null
  dias_pago_2: number | null
  dias_demora_pago: number | null
  num_pagos_demora: number | null
  fecha_alta: string | null
  fecha_baja: string | null
  activo: boolean
  actualizado_en?: string
}

const VACIO: TipoCliente = {
  codigo: '',
  descripcion: '',
  actividad: null,
  productos: null,
  forma_pago_codigo: null,
  zona_territorial_codigo: null,
  vendedor_codigo: null,
  tarifa_nivel_defecto: 0,
  no_permite_modificar_tarifa: false,
  descuento_pct: null,
  limite_deuda: null,
  previsto_ventas: null,
  observaciones: null,
  'nº_copias_factura': 1,
  tienda_defecto_codigo: null,
  tipo_factura: null,
  incremento_sobre_coste_pct: null,
  descuento_ficticio_pct: null,
  tipo_documento_contado: null,
  tipo_documento_credito: null,
  dias_pago_1_tipo: null,
  dias_pago_1: null,
  dias_pago_2_tipo: null,
  dias_pago_2: null,
  dias_demora_pago: null,
  num_pagos_demora: null,
  fecha_alta: null,
  fecha_baja: null,
  activo: true,
}

const TABS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'pago', label: 'Pago y Documentos' },
    { key: 'tarifas', label: 'Tarifas y Descuentos' },
    { key: 'obs', label: 'Observaciones' },
  ],
]

const ALTO = 330
type Patch = (p: Partial<TipoCliente>) => void
type Nivel = { nivel: number; nombre: string }

/**
 * Clientes → Tipo Cliente: las condiciones que se proponen a un cliente de ese tipo (forma de
 * pago, tarifa, descuentos, días de pago…) y la tarifa por nivel de familia, como en la ficha
 * de Clientes. SIN CAPTURA de GeminisWin: hecha con el esquema (TIPOCLIE) y las mismas piezas y
 * nombres de campo que las pestañas Comercial y Tarifas de la ficha de Clientes.
 */
export function TipoClienteFichaPage() {
  const f = useFichaMaestro<TipoCliente>({
    tabla: 'tipo_cliente',
    base: '/tipos-cliente',
    vacio: VACIO,
    campoNombre: 'descripcion',
    que: 'el tipo de cliente',
    titulo: 'Tipos de Cliente',
    rpc: 'gw_lista_ordenada_archivo',
  })
  const { draft: d, patch, editing, mode } = f
  const [tab, setTab] = useState('generales')
  const [buscar, setBuscar] = useState(false)
  const [niveles, setNiveles] = useState<Nivel[]>([])
  const [clientes, setClientes] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('nivel_tarifa')
      .select('nivel, nombre')
      .order('nivel')
      .then(({ data }) => setNiveles((data ?? []) as Nivel[]))
  }, [])

  useEffect(() => {
    if (!f.registro.codigo) return setClientes(null)
    supabase
      .from('cliente')
      .select('codigo', { count: 'exact', head: true })
      .eq('tipo_cliente_codigo', f.registro.codigo)
      .then(({ count }) => setClientes(count ?? 0))
  }, [f.registro.codigo])

  // En el alta, la fecha de alta se propone con la de hoy.
  const altaSinFecha = mode === 'alta' && !f.loading && !d.fecha_alta
  useEffect(() => {
    if (altaSinFecha) patch({ fecha_alta: hoy() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altaSinFecha])

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing

  async function baja() {
    if (f.sinRegistros || !f.registro.codigo) return
    const r = await bajaOReactivar({
      tabla: 'tipo_cliente',
      clave: { codigo: f.registro.codigo },
      activo: f.registro.activo,
      descripcion: `el tipo de cliente ${f.registro.codigo} ${f.registro.descripcion}${clientes ? ` (lo tienen ${clientes} cliente(s), que lo conservan)` : ''}`,
      conFechaBaja: true,
    })
    if (r === true) return
    if (r) return f.setError(r)
    window.location.reload()
  }

  return (
    <div className="flex max-w-[1180px] flex-col gap-1">
      <div className="grid grid-cols-[110px_minmax(0,1fr)_170px] gap-x-3">
        <GwField label="Código">
          <GwCampoBusqueda value={d.codigo} editable={mode === 'alta'} disabled={mode === 'edicion'} title="CODIGO" maxLength={4} onChange={(v) => patch({ codigo: v.toUpperCase() })} {...f.busqueda('codigo')} />
        </GwField>
        <GwField label="Descripción">
          <GwCampoBusqueda value={d.descripcion} editable={editing} title="DESCRIP" maxLength={40} onChange={(v) => patch({ descripcion: v })} {...f.busqueda('nombre')} />
        </GwField>
        <GwField label="Clientes de este tipo">
          <GwInput readOnly className="text-right" value={mode === 'alta' || clientes == null ? '' : String(clientes)} title="Nº de clientes con este tipo" />
        </GwField>
      </div>
      {(f.error || (!f.registro.activo && !f.sinRegistros && mode !== 'alta')) && <div className="text-[13px] text-[#c42b1c]">{f.error ?? TEXTO_BAJA}</div>}

      <GwTabs rows={TABS} active={tab} onChange={setTab}>
        {f.sinRegistros ? (
          <PestanaPendiente texto="No hay ningún tipo de cliente. Pulsa Nuevo para dar de alta el primero." alto={ALTO} />
        ) : (
          <div style={{ minHeight: ALTO }}>
            {tab === 'generales' && <Generales d={d} ro={ro} onChange={patch} />}
            {tab === 'pago' && <Pago d={d} ro={ro} onChange={patch} />}
            {tab === 'tarifas' && <Tarifas d={d} ro={ro} onChange={patch} niveles={niveles} codigo={mode === 'alta' ? '' : f.registro.codigo} editandoFicha={mode === 'edicion'} />}
            {tab === 'obs' && (
              <GwField label="Observaciones">
                <GwTextArea className="h-[300px] resize-none" value={d.observaciones ?? ''} disabled={ro} title="OBSERV" onChange={(e) => patch({ observaciones: e.target.value || null })} />
              </GwField>
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
        onNew={() => f.navigate('/tipos-cliente/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={baja}
        onSave={() =>
          f.guardar(() => {
            if (!d.codigo.trim() || !d.descripcion.trim()) return 'El código y la descripción son obligatorios.'
            for (const [k, n] of [
              ['descuento_pct', 'El descuento'],
              ['descuento_ficticio_pct', 'El descuento ficticio'],
            ] as const)
              if ((d[k] ?? 0) < 0 || (d[k] ?? 0) > 100) return `${n} tiene que estar entre 0 y 100.`
            if (d.fecha_alta && d.fecha_baja && d.fecha_baja < d.fecha_alta) return 'La fecha de baja no puede ser anterior a la de alta.'
            return null
          })
        }
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.total} mode={mode} que="tipo de cliente" />

      {buscar && (
        <GwLookupDialog<{ codigo: string; descripcion: string; actividad: string | null }>
          title="Buscar Tipo de Cliente"
          table="tipo_cliente"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'actividad', label: 'Actividad', width: 200 },
          ]}
          searchColumns={['codigo', 'descripcion', 'actividad']}
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

function Generales({ d, ro, onChange }: { d: TipoCliente; ro: boolean; onChange: Patch }) {
  const txt = (k: 'actividad' | 'productos', title: string) => (
    <GwInput value={d[k] ?? ''} disabled={ro} title={title} onChange={(e) => onChange({ [k]: e.target.value || null })} />
  )
  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="grid grid-cols-2 gap-x-3">
        <GwField label="Actividad">{txt('actividad', 'ACTIVIDAD')}</GwField>
        <GwField label="Productos">{txt('productos', 'PRODUCTOS')}</GwField>
      </div>
      <GwGroup title="Valores que se proponen al dar de alta un cliente de este tipo" className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <GwField label="Forma de pago">
          <CampoEnlace tabla="forma_pago" campoNombre="descripcion" titulo="Formas de Pago" desplegable title="FORMAPAGO" value={d.forma_pago_codigo} disabled={ro} onChange={(v) => onChange({ forma_pago_codigo: v })} />
        </GwField>
        <GwField label="Zona territorial">
          <CampoEnlace tabla="zona_territorial" campoNombre="descripcion" titulo="Zonas Territoriales" title="ZONATERRI" value={d.zona_territorial_codigo} disabled={ro} onChange={(v) => onChange({ zona_territorial_codigo: v })} />
        </GwField>
        <GwField label="Vendedor">
          <CampoEnlace tabla="vendedor" campoNombre="nombre" titulo="Vendedores" title="VENDEDOR" value={d.vendedor_codigo} disabled={ro} onChange={(v) => onChange({ vendedor_codigo: v })} />
        </GwField>
        <GwField label="Tienda por defecto">
          <CampoEnlace tabla="tienda_terminal" campoNombre="descripcion" titulo="Tiendas" desplegable title="TIENDA" value={d.tienda_defecto_codigo} disabled={ro} onChange={(v) => onChange({ tienda_defecto_codigo: v })} />
        </GwField>
      </GwGroup>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <GwGroup title="Saldo y Riesgo" className="grid grid-cols-[150px_140px] items-center gap-x-3 gap-y-1">
          <span className="gw-label">Límite deuda:</span>
          <GwNumber value={d.limite_deuda} decimals={3} emptyAsZero disabled={ro} onChange={ro ? undefined : (v) => onChange({ limite_deuda: v })} />
          <span className="gw-label">Previsión Ventas:</span>
          <GwNumber value={d.previsto_ventas} decimals={3} emptyAsZero disabled={ro} onChange={ro ? undefined : (v) => onChange({ previsto_ventas: v })} />
        </GwGroup>
        <GwGroup title="Fechas" className="grid grid-cols-[120px_150px] items-center gap-x-3 gap-y-1">
          <span className="gw-label">Fecha de Alta:</span>
          <GwDate value={d.fecha_alta} disabled={ro} title="F_ALTA" onChange={(v) => onChange({ fecha_alta: v })} />
          <span className="gw-label">Fecha de Baja:</span>
          <GwDate value={d.fecha_baja} disabled={ro} title="F_BAJA" onChange={(v) => onChange({ fecha_baja: v })} />
        </GwGroup>
      </div>
    </div>
  )
}

function Pago({ d, ro, onChange }: { d: TipoCliente; ro: boolean; onChange: Patch }) {
  // Códigos numéricos de GeminisWin cuyo significado aún no está documentado (igual que en la ficha de Clientes).
  const codigo = (k: keyof TipoCliente, title: string, vacio: string) => {
    const actual = d[k] as number | null
    const valores = [1, 2, 3, 4, 5]
    return (
      <GwSelect value={actual ?? ''} disabled={ro} title={title} onChange={(e) => onChange({ [k]: e.target.value === '' ? null : Number(e.target.value) } as Partial<TipoCliente>)}>
        <option value="">{vacio}</option>
        {valores.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
        {actual != null && !valores.includes(actual) && <option value={actual}>{actual}</option>}
      </GwSelect>
    )
  }
  const spin = (k: keyof TipoCliente, title: string, max = 999) => (
    <GwSpin value={(d[k] as number | null) ?? 0} max={max} disabled={ro} title={title} onChange={(v) => onChange({ [k]: v } as Partial<TipoCliente>)} />
  )
  return (
    <div className="flex flex-col gap-2 pt-1">
      <GwGroup title="Configuración del pago y de documentos predeterminados" className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)_90px] items-end gap-x-3">
          <GwField label="Tipo Factura Global">{codigo('tipo_factura', 'TIPOFACT (código GeminisWin; confirmar significado con Luis)', 'Predeterminada')}</GwField>
          <GwField label="Documento Ventas Contado">{codigo('tipo_documento_contado', 'TIPODOCCTD (código GeminisWin; confirmar con Luis)', 'Predeterminado')}</GwField>
          <GwField label="Documento Ventas Crédito">{codigo('tipo_documento_credito', 'TIPODOCCRD (código GeminisWin; confirmar con Luis)', 'Predeterminado')}</GwField>
          <GwField label="Nº Copias">{spin('nº_copias_factura', 'FACTNOCOP', 9)}</GwField>
        </div>
      </GwGroup>
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-3">
        <GwGroup title="Días de Pago" className="grid grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)_80px] gap-x-2">
          {codigo('dias_pago_1_tipo', 'TIPDIASPA1 (código GeminisWin; confirmar con Luis)', '')}
          {spin('dias_pago_1', 'DIASPAGO1', 31)}
          {codigo('dias_pago_2_tipo', 'TIPDIASPA2 (código GeminisWin; confirmar con Luis)', '')}
          {spin('dias_pago_2', 'DIASPAGO2', 31)}
        </GwGroup>
        <GwGroup title="Demora Permitida en el Pago" className="flex items-center gap-3">
          <GwInline label="Días:" className="flex-1">
            {spin('dias_demora_pago', 'DIASDEMPAG')}
          </GwInline>
          <GwInline label="Nº de Pagos:" className="flex-1">
            {spin('num_pagos_demora', 'NPAGDEMORA', 99)}
          </GwInline>
        </GwGroup>
      </div>
    </div>
  )
}

function Tarifas({
  d,
  ro,
  onChange,
  niveles,
  codigo,
  editandoFicha,
}: {
  d: TipoCliente
  ro: boolean
  onChange: Patch
  niveles: Nivel[]
  codigo: string
  editandoFicha: boolean
}) {
  const pct = (k: 'incremento_sobre_coste_pct' | 'descuento_pct' | 'descuento_ficticio_pct', title: string) => (
    <span className="w-[80px]" title={title}>
      <GwNumber decimals={2} emptyAsZero value={d[k]} disabled={ro} onChange={ro ? undefined : (v) => onChange({ [k]: v })} />
    </span>
  )
  return (
    <div className="grid grid-cols-[260px_260px_minmax(0,1fr)] gap-3 pt-1">
      <div className="flex flex-col gap-2">
        <GwGroup title="Aplicar Siempre un % de Incremento sobre el coste" className="flex justify-end">
          {pct('incremento_sobre_coste_pct', 'INCCOSTE')}
        </GwGroup>
        <div className="border border-[var(--gw-border-light)] p-1 text-[13px] leading-[15px] text-[#1a4fd0]">
          Si se introduce algún valor, el PVP para los clientes de este tipo se calcula a partir del % indicado sobre el precio de coste.
        </div>
      </div>
      <GwGroup title="Descuentos" className="grid h-fit grid-cols-[minmax(0,1fr)_80px] items-center gap-x-2 gap-y-1">
        <span className="gw-label">Descuento:</span>
        {pct('descuento_pct', 'DESCUENTO')}
        <span className="gw-label">Descuento Ficticio:</span>
        {pct('descuento_ficticio_pct', 'DTOFICTICIO')}
      </GwGroup>
      <GwGroup title="Tarifas" className="flex flex-col gap-1">
        <span className="gw-label">Tarifa Predeterminada para este tipo de cliente</span>
        <span className="flex gap-1">
          <GwInput readOnly disabled={ro} className="!w-[34px]" value={d.tarifa_nivel_defecto ?? ''} title="TARIFA" />
          <GwSelect title="TARIFA" value={d.tarifa_nivel_defecto ?? ''} disabled={ro} onChange={(e) => onChange({ tarifa_nivel_defecto: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="" />
            {niveles.map((n) => (
              <option key={n.nivel} value={n.nivel}>
                {n.nombre}
              </option>
            ))}
          </GwSelect>
        </span>
        <TarifaPorFamilia codigo={codigo} editing={editandoFicha} niveles={niveles} />
        <GwCheck label="No permitir modificar la tarifa al vender" checked={d.no_permite_modificar_tarifa} disabled={ro} onChange={(v) => onChange({ no_permite_modificar_tarifa: v })} />
      </GwGroup>
    </div>
  )
}

interface FilaFamilia {
  grupo_familia: number
  descuento: string | null
}

/** Tarifa por nivel de familia del tipo de cliente (tipo_cliente_descuento_familia), igual que la del cliente. */
function TarifaPorFamilia({ codigo, editing, niveles }: { codigo: string; editing: boolean; niveles: Nivel[] }) {
  const [rows, setRows] = useState<FilaFamilia[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [nueva, setNueva] = useState<{ grupo: number | null; nivel: string; editar: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const nombreNivel = (n: string | null) => niveles.find((x) => String(x.nivel) === String(n))?.nombre ?? n ?? ''

  useEffect(() => {
    if (!codigo) return setRows([])
    supabase
      .from('tipo_cliente_descuento_familia')
      .select('grupo_familia, descuento')
      .eq('tipo_cliente_codigo', codigo)
      .order('grupo_familia')
      .then(({ data }) => setRows((data ?? []) as FilaFamilia[]))
  }, [codigo, version])

  useEffect(() => {
    setNueva(null)
    setSel(null)
    setError(null)
  }, [codigo, editing])

  async function aceptar() {
    if (!nueva) return
    setError(null)
    if (nueva.grupo == null || nueva.grupo < 0) return setError('Indica el nivel de familia.')
    if (!nueva.editar && rows.some((r) => r.grupo_familia === nueva.grupo)) return setError(`El nivel de familia ${nueva.grupo} ya tiene tarifa.`)
    const res = nueva.editar
      ? await supabase.from('tipo_cliente_descuento_familia').update({ descuento: nueva.nivel }).eq('tipo_cliente_codigo', codigo).eq('grupo_familia', nueva.grupo)
      : await supabase.from('tipo_cliente_descuento_familia').insert({ tipo_cliente_codigo: codigo, grupo_familia: nueva.grupo, descuento: nueva.nivel })
    if (res.error) return setError(res.error.code === '23505' ? `El nivel de familia ${nueva.grupo} ya tiene tarifa.` : res.error.message)
    setNueva(null)
    setVersion((v) => v + 1)
  }

  // Línea de detalle, no un maestro: se quita de verdad (como en la ficha de Clientes).
  async function quitar() {
    if (sel == null || !confirm(`¿Quitar la tarifa del nivel de familia ${sel}?`)) return
    const { error: err } = await supabase.from('tipo_cliente_descuento_familia').delete().eq('tipo_cliente_codigo', codigo).eq('grupo_familia', sel)
    if (err) return setError(err.message)
    setSel(null)
    setVersion((v) => v + 1)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="gw-label">Tarifa por el nivel de la familia</span>
      <div className="h-[112px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid" title="NIVEL_DT">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 70 }}>Nivel</th>
              <th>Tarifa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.grupo_familia} className={sel === r.grupo_familia ? 'gw-selected' : ''} onClick={() => setSel(r.grupo_familia)}>
                <td>{r.grupo_familia}</td>
                <td>{nombreNivel(r.descuento)}</td>
              </tr>
            ))}
            <FilasVacias cols={2} ocupadas={rows.length} total={4} />
          </tbody>
        </table>
      </div>
      {nueva && (
        <div className="flex items-center gap-1">
          <span className="w-[70px]" title="Nivel de familia">
            <GwNumber decimals={0} value={nueva.grupo} disabled={nueva.editar} onChange={nueva.editar ? undefined : (v) => setNueva({ ...nueva, grupo: v })} />
          </span>
          <GwSelect value={nueva.nivel} onChange={(e) => setNueva({ ...nueva, nivel: e.target.value })}>
            {niveles.map((n) => (
              <option key={n.nivel} value={n.nivel}>
                {n.nombre}
              </option>
            ))}
          </GwSelect>
          <button type="button" className="gw-btn px-1.5" title="Aceptar" onClick={aceptar}>
            <Check size={14} className="text-[#127a12]" />
          </button>
          <button type="button" className="gw-btn px-1.5" title="Cancelar" onClick={() => setNueva(null)}>
            <X size={14} className="text-[#c42b1c]" />
          </button>
        </div>
      )}
      {error && <div className="text-[13px] text-[#c42b1c]">{error}</div>}
      <GridMiniBar
        nuevo={editing && !!codigo && !nueva}
        modificar={editing && sel != null && !nueva}
        borrar={editing && sel != null && !nueva}
        buscar={false}
        onNuevo={() => {
          setError(null)
          setNueva({ grupo: null, nivel: '0', editar: false })
        }}
        onModificar={() => {
          const r = rows.find((x) => x.grupo_familia === sel)
          if (r) setNueva({ grupo: r.grupo_familia, nivel: r.descuento ?? '0', editar: true })
        }}
        onBorrar={quitar}
      />
    </div>
  )
}
