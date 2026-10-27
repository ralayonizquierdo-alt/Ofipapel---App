import { useEffect, useState } from 'react'
import { ChevronFirst, ChevronLast, Binoculars, FilePen, FilePlus2, FileX2, Play, Printer, FolderOpen, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  GwCheck,
  GwDate,
  GwField,
  GwGroup,
  GwInput,
  GwLookupButton,
  GwNumber,
  GwSelect,
  GwTabs,
  GwTextArea,
  formatGw,
  type GwTabDef,
} from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { FilasVacias } from '../../components/gw/GwGridParts'
import { useFichaMaestro } from './useFichaMaestro'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { ImagenConModo, PieEstado } from './piezas'

interface Familia {
  codigo: string
  descripcion: string
  descripcion_corta: string | null
  plantilla_tarifa_codigo: string | null
  descuento_pct: number | null
  control_lotes: number | null
  no_ver_en_venta: boolean
  mensaje_articulo: string | null
  observaciones: string | null
  impresora_etiquetas: string | null
  informe_defecto: string | null
  imagen_url: string | null
  imagen_modo: number
  web_publicada: boolean
  web_codigo: string | null
  web_descripcion: string | null
  web_fecha_baja: string | null
  web_id_link: number | null
  actualizado_en: string
}

const VACIA: Familia = {
  codigo: '',
  descripcion: '',
  descripcion_corta: null,
  plantilla_tarifa_codigo: null,
  descuento_pct: null,
  control_lotes: 0,
  no_ver_en_venta: false,
  mensaje_articulo: null,
  observaciones: null,
  impresora_etiquetas: null,
  informe_defecto: null,
  imagen_url: null,
  imagen_modo: 1,
  web_publicada: false,
  web_codigo: null,
  web_descripcion: null,
  web_fecha_baja: null,
  web_id_link: null,
  actualizado_en: '',
}

const TABS: GwTabDef[][] = [
  [
    { key: 'general', label: 'General' },
    { key: 'web', label: 'Observ, Imagen y Web' },
    { key: 'rejilla', label: 'Regilla' },
    { key: 'articulos', label: 'Artículos' },
    { key: 'impresora', label: 'Impresora' },
  ],
]

const NOMBRES_TARIFA = ['General:', 'MAYOR  M-1:', 'MAYOR  M-2:', 'MAYOR  M-3:', 'Tarifa Dcto -4:', 'Tarifa Dcto -5:', 'Tarifa Dcto -6:']

// nivel1 y nivel2 son columnas generadas en la BD: nunca se envían.
const SIN_COLUMNAS = ['actualizado_en', 'nivel1', 'nivel2']

// En GeminisWin las familias de nivel 1, 2 y 3 tienen 2, 4 y 6 dígitos (99, 9999, 999975).
const CODIGO_VALIDO = /^\d{2}(\d{2}){0,2}$/

function fechaHora(v: string) {
  if (!v) return '  /  /'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES')}`
}

function fecha(v: string | null) {
  if (!v) return ' /  /'
  const d = new Date(`${v}T00:00:00`)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface NivelPlantilla {
  nivel_tarifa: number
  modo_calculo: string | null
  permite_descuento_linea: boolean
  incremento_pct: number | null
}

export function FamiliaFichaPage() {
  const f = useFichaMaestro<Familia>({ tabla: 'familia', base: '/familias', vacio: VACIA, campoNombre: 'descripcion', sinColumnas: SIN_COLUMNAS, que: 'la familia', titulo: 'Familias' })
  const { draft, patch, editing, mode } = f
  const [tab, setTab] = useState('general')
  const [buscar, setBuscar] = useState(false)
  const [buscarPlantilla, setBuscarPlantilla] = useState(false)
  const [buscarWeb, setBuscarWeb] = useState(false)
  const [plantillas, setPlantillas] = useState<{ codigo: string; descripcion: string; descuento_maximo_cliente_pct: number | null }[]>([])
  const [nivelesPlantilla, setNivelesPlantilla] = useState<NivelPlantilla[]>([])
  const [padres, setPadres] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase
      .from('plantilla_tarifa')
      .select('codigo, descripcion, descuento_maximo_cliente_pct')
      .order('codigo')
      .then(({ data }) => setPlantillas((data ?? []) as typeof plantillas))
  }, [])

  const cod = draft.codigo.trim()
  const valido = CODIGO_VALIDO.test(cod)

  // Descripción de las familias de nivel 1 (2 dígitos) y 2 (4 dígitos) a las que pertenece.
  useEffect(() => {
    const codigos = [cod.slice(0, 2), cod.slice(0, 4)].filter((c) => c.length >= 2 && c !== cod && /^\d+$/.test(c))
    if (!codigos.length) {
      setPadres({})
      return
    }
    supabase
      .from('familia')
      .select('codigo, descripcion')
      .in('codigo', codigos)
      .then(({ data }) => setPadres(Object.fromEntries(((data ?? []) as { codigo: string; descripcion: string }[]).map((r) => [r.codigo, r.descripcion]))))
  }, [cod])

  const plantillaCod = draft.plantilla_tarifa_codigo
  useEffect(() => {
    if (!plantillaCod) {
      setNivelesPlantilla([])
      return
    }
    supabase
      .from('plantilla_tarifa_nivel')
      .select('nivel_tarifa, modo_calculo, permite_descuento_linea, incremento_pct')
      .eq('plantilla_tarifa_codigo', plantillaCod)
      .order('nivel_tarifa')
      .then(({ data }) => setNivelesPlantilla((data ?? []) as NivelPlantilla[]))
  }, [plantillaCod])

  async function enUso() {
    const { count } = await supabase
      .from('articulo')
      .select('codigo_interno', { count: 'exact', head: true })
      .eq('familia_codigo', f.registro.codigo)
    return count
      ? `No se puede eliminar la familia ${f.registro.codigo}: tiene ${count} artículo(s). Cámbialos de familia antes de eliminarla.`
      : null
  }

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing
  const texto = (key: keyof Familia, title: string, max?: number, className = '') => (
    <GwInput
      className={className}
      value={(draft[key] ?? '') as string}
      disabled={ro}
      title={title}
      maxLength={max}
      onChange={(e) => patch({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Familia>)}
    />
  )
  const plantilla = plantillas.find((p) => p.codigo === plantillaCod)
  const niveles = [0, 1, 2, 3, 4, 5, 6].map((n) => nivelesPlantilla.find((x) => x.nivel_tarifa === n))
  const desglose = [
    { nivel: 1, parte: cod.slice(0, 2), desc: cod.length === 2 ? draft.descripcion : padres[cod.slice(0, 2)] ?? '' },
    { nivel: 2, parte: cod.slice(2, 4), desc: cod.length === 4 ? draft.descripcion : cod.length > 4 ? padres[cod.slice(0, 4)] ?? '' : '' },
    { nivel: 3, parte: cod.slice(4, 6), desc: '' },
  ]

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[150px_minmax(0,1fr)_260px] gap-x-4 pl-12">
        <GwField label="Código:">
          <GwCampoBusqueda
            value={draft.codigo}
            editable={mode === 'alta'}
            disabled={mode === 'edicion'}
            title="COD_FAM: 2, 4 o 6 dígitos (familia de nivel 1, 2 o 3)"
            maxLength={6}
            inputMode="numeric"
            onChange={(v) => patch({ codigo: v.replace(/\D/g, '') })}
            {...f.busqueda('codigo')}
          />
        </GwField>
        <GwField label="Descripción:">
          <GwCampoBusqueda
            value={draft.descripcion}
            editable={editing}
            title="DESCRIP"
            maxLength={45}
            onChange={(v) => patch({ descripcion: v === '' ? null : v } as Partial<Familia>)}
            {...f.busqueda('nombre')}
          />
        </GwField>
        <GwField label="Última Modificación">
          <GwInput readOnly value={mode === 'alta' ? '  /  /' : fechaHora(draft.actualizado_en)} title="ULTMOD" />
        </GwField>
      </div>
      {mode === 'alta' && cod && !valido && (
        <div className="pl-12 text-[13px] text-[#c42b1c]">El código de familia debe tener 2, 4 o 6 dígitos (familia de nivel 1, 2 o 3).</div>
      )}
      {f.error && <div className="pl-12 text-[13px] text-[#c42b1c]">{f.error}</div>}

      <div className="mt-1">
        <GwTabs rows={TABS} active={tab} onChange={setTab}>
          {f.sinRegistros ? (
            <div className="p-3 text-[13px]">No hay ninguna familia. Pulsa Nuevo para dar de alta la primera.</div>
          ) : (
            <div className="min-h-[300px]">
              {tab === 'general' && (
                <div className="grid grid-cols-[minmax(0,460px)_minmax(0,500px)] gap-x-4 pt-1">
                  <div className="flex flex-col gap-2">
                    <div className="mt-2 flex items-center justify-between border border-[var(--gw-border-light)] px-3 py-2.5">
                      <span className="gw-label">Nivel de Descuento para los clientes:</span>
                      <span className="w-[70px]" title="DESCUENTO: nivel de descuento de la familia para los clientes">
                        <GwNumber value={draft.descuento_pct} decimals={0} disabled={ro} onChange={(v) => patch({ descuento_pct: v })} />
                      </span>
                    </div>
                    <GwGroup title="Desglose niveles de Familias:">
                      <div className="grid grid-cols-[70px_70px_74px_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1.5">
                        <span />
                        <span className="gw-label text-center">Nº Dig.</span>
                        <span className="gw-label">Código</span>
                        <span className="gw-label">Descripción</span>
                        {desglose.map((n) => (
                          <div key={n.nivel} className="contents">
                            <span className="gw-label">Nivel {n.nivel}:</span>
                            <span className="gw-label text-center">2</span>
                            <GwInput readOnly value={valido || cod.length >= n.nivel * 2 ? n.parte : ''} title={`Nivel ${n.nivel} (2 dígitos)`} />
                            <span className="gw-label truncate" title={n.desc}>
                              {n.desc}
                            </span>
                          </div>
                        ))}
                      </div>
                    </GwGroup>
                    <GwField label="Control de Lotes">
                      <GwSelect
                        value={draft.control_lotes ?? 0}
                        disabled={ro}
                        title="CTRLLOTES (confirmar códigos con Luis)"
                        onChange={(e) => patch({ control_lotes: Number(e.target.value) })}
                      >
                        <option value={0}>Predeterminado</option>
                        <option value={1}>Sí</option>
                        <option value={2}>No</option>
                      </GwSelect>
                    </GwField>
                    <GwCheck
                      label="No Mostrar ésta familia en ventas"
                      checked={draft.no_ver_en_venta}
                      disabled={ro}
                      onChange={(v) => patch({ no_ver_en_venta: v })}
                    />
                  </div>

                  <GwGroup title="Plantilla de Tarifas">
                    <div className="flex flex-col gap-1.5">
                      <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-1">
                        <GwSelect
                          value={plantillaCod ?? ''}
                          disabled={ro}
                          title="CODTAR"
                          onChange={(e) => patch({ plantilla_tarifa_codigo: e.target.value || null })}
                        >
                          <option value="" />
                          {plantillas.map((p) => (
                            <option key={p.codigo} value={p.codigo}>
                              {p.codigo}
                            </option>
                          ))}
                        </GwSelect>
                        <div className="flex">
                          <GwInput readOnly value={plantilla?.descripcion ?? ''} tabIndex={-1} />
                          <GwLookupButton disabled={ro} onClick={() => setBuscarPlantilla(true)} title="Buscar plantilla de tarifas" />
                        </div>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-x-1.5">
                        <div className="grid grid-cols-[112px_62px_62px_minmax(0,1fr)] items-center gap-x-1 gap-y-[4px]">
                          {niveles.map((n, i) => (
                            <div key={i} className="contents">
                              <span className="gw-label">{NOMBRES_TARIFA[i]}</span>
                              <GwSelect disabled value={n?.modo_calculo ?? (i >= 4 ? 'D' : 'P')} title={`POD${i}`}>
                                <option value="P">P</option>
                                <option value="D">D</option>
                              </GwSelect>
                              <GwSelect disabled value={n?.permite_descuento_linea ? 'S' : 'N'} title={`VERDTO_${i}`}>
                                <option value="N">N</option>
                                <option value="S">S</option>
                              </GwSelect>
                              <GwNumber value={plantillaCod ? (n?.incremento_pct ?? 0) : null} decimals={2} />
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col justify-between">
                          <div className="flex flex-col border border-[var(--gw-border)] bg-[var(--gw-face)]">
                            <button
                              type="button"
                              className="flex h-[30px] items-center justify-center border-b border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb]"
                              title="Nueva plantilla de tarifas"
                              onClick={() => f.navigate('/plantillas-tarifas/nuevo')}
                            >
                              <FilePlus2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="flex h-[30px] items-center justify-center border-b border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent"
                              title="Modificar la plantilla de tarifas"
                              disabled={!plantillaCod}
                              onClick={() => plantillaCod && f.navigate(`/plantillas-tarifas/${encodeURIComponent(plantillaCod)}`)}
                            >
                              <FilePen size={13} />
                            </button>
                            <button type="button" className="flex h-[30px] items-center justify-center text-[#a8a8a8]" title="Eliminar plantilla (desde Plantillas de Tarifas)" disabled>
                              <FileX2 size={13} />
                            </button>
                          </div>
                          <div className="flex flex-col">
                            <span className="gw-label">Dto. Máx.</span>
                            <GwNumber value={plantilla ? (plantilla.descuento_maximo_cliente_pct ?? 0) : null} decimals={2} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </GwGroup>
                </div>
              )}

              {tab === 'web' && (
                <div className="flex flex-col gap-2">
                  <GwGroup
                    title={<GwCheck label="Familia publicada en la Web" checked={draft.web_publicada} disabled={ro} onChange={(v) => patch({ web_publicada: v })} />}
                  >
                    <div className="grid grid-cols-[200px_minmax(0,1fr)_170px_130px] gap-x-3">
                      <GwField label="Cód. Fam:">
                        <div className="flex">
                          {texto('web_codigo', 'WEBCODFAM', 10)}
                          <GwLookupButton disabled={ro} onClick={() => setBuscarWeb(true)} title="Buscar familia" />
                        </div>
                      </GwField>
                      <GwField label="Descripción:">{texto('web_descripcion', 'WEBDESCRIP', 60)}</GwField>
                      <GwField label="Familia WebId:">
                        <GwNumber value={draft.web_id_link ?? 0} decimals={0} disabled={ro} onChange={(v) => patch({ web_id_link: v })} />
                      </GwField>
                      <GwField label="F. baja:">
                        {ro ? (
                          <GwInput readOnly value={fecha(draft.web_fecha_baja)} title="WEB_F_BAJA" />
                        ) : (
                          <GwDate value={draft.web_fecha_baja} title="WEB_F_BAJA" onChange={(v) => patch({ web_fecha_baja: v })} />
                        )}
                      </GwField>
                    </div>
                  </GwGroup>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3">
                    <div className="flex flex-col gap-1">
                      <GwField label="Mensaje al asignar un artículo a esta familia">
                        <GwTextArea
                          className="!h-[72px] resize-none"
                          value={draft.mensaje_articulo ?? ''}
                          disabled={ro}
                          title="ARTICMSG"
                          onChange={(e) => patch({ mensaje_articulo: e.target.value || null })}
                        />
                      </GwField>
                      <GwField label="Observaciones">
                        <GwTextArea
                          className="!h-[118px] resize-none"
                          value={draft.observaciones ?? ''}
                          disabled={ro}
                          title="OBSERV"
                          onChange={(e) => patch({ observaciones: e.target.value || null })}
                        />
                      </GwField>
                    </div>
                    <ImagenConModo
                      nombre="familia"
                      url={draft.imagen_url}
                      modo={draft.imagen_modo ?? 1}
                      alto={190}
                      disabled={ro}
                      onUrl={(v) => patch({ imagen_url: v })}
                      onModo={(v) => patch({ imagen_modo: v })}
                    />
                  </div>
                </div>
              )}

              {tab === 'rejilla' && <RejillaFamilias actual={f.registro.codigo} onAbrir={(c) => f.goTo(c)} />}

              {tab === 'articulos' && f.registro.codigo && mode !== 'alta' && <ArticulosFamilia familia={f.registro.codigo} onAbrir={(c) => f.navigate(`/articulos/${encodeURIComponent(c)}`)} />}

              {tab === 'impresora' && (
                <div className="flex flex-col gap-3 px-2 pt-3">
                  <div className="grid grid-cols-[230px_200px] items-center">
                    <span className="gw-label">Descripción de la impresora:</span>
                    {texto('descripcion_corta', 'DESCRIMPR (descripción de la impresora del TPV)', 15)}
                  </div>
                  <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-y-2">
                    <span className="gw-label">Impresora:</span>
                    <div className="flex">
                      {texto('impresora_etiquetas', 'IMPRESORA: nombre de la impresora de Windows')}
                      <button type="button" className="gw-btn flex-none px-0" style={{ width: 40, height: 22 }} disabled title="Elegir impresora (se configura en el puesto del TPV)">
                        <Printer size={14} />
                      </button>
                    </div>
                    <span className="gw-label">Informe:</span>
                    <div className="flex">
                      {texto('informe_defecto', 'INFORME')}
                      <button
                        type="button"
                        className="gw-btn flex-none px-0"
                        style={{ width: 40, height: 22 }}
                        disabled={ro}
                        title="Elegir informe"
                        onClick={() => {
                          const v = prompt('Informe', draft.informe_defecto ?? '')
                          if (v !== null) patch({ informe_defecto: v.trim() || null })
                        }}
                      >
                        <FolderOpen size={14} className="text-[#b8860b]" />
                      </button>
                    </div>
                  </div>
                  <div className="min-h-[120px] border border-[var(--gw-border-light)] p-1.5 text-[13px] leading-[17px] text-[#1a4fd0]">
                    <p>
                      Esta configuración de impresora, se utiliza para poder imprimir los artículos de ésta familia en una impresora diferente al resto de los
                      artículos al imprimir el ticket en el TPV.
                    </p>
                    <p className="mt-3">La descripción de la impresora nos servirá para localizar el lugar, departamento, etc donde esté ubicada la impresora.</p>
                    <p>
                      El nombre de la impresora, es el nombre de una impresora declarada en Windows, que será donde se impriman los artículos de ésta familia.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </GwTabs>
      </div>

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
        onNew={() => f.navigate('/familias/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={() => f.eliminar(`la familia ${f.registro.codigo} ${f.registro.descripcion}`, enUso)}
        onSave={() =>
          f.guardar(() => {
            if (!CODIGO_VALIDO.test(draft.codigo.trim())) return 'El código de familia debe tener 2, 4 o 6 dígitos (familia de nivel 1, 2 o 3).'
            if (!draft.descripcion.trim()) return 'La descripción es obligatoria.'
            return null
          })
        }
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.total} mode={mode} que="familia" />

      {buscar && (
        <GwLookupDialog<{ codigo: string; descripcion: string }>
          title="Buscar Familia"
          table="familia"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy={f.orden === 'codigo' ? 'codigo' : 'descripcion'}
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(false)
            f.goTo(r.codigo)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
      {buscarPlantilla && (
        <GwLookupDialog<{ codigo: string; descripcion: string }>
          title="Buscar Plantilla de Tarifas"
          table="plantilla_tarifa"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            setBuscarPlantilla(false)
            patch({ plantilla_tarifa_codigo: r.codigo })
          }}
          onClose={() => setBuscarPlantilla(false)}
        />
      )}
      {buscarWeb && (
        <GwLookupDialog<{ codigo: string; descripcion: string }>
          title="Familia para la Web"
          table="familia"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            setBuscarWeb(false)
            patch({ web_codigo: r.codigo, web_descripcion: draft.web_descripcion ?? r.descripcion })
          }}
          onClose={() => setBuscarWeb(false)}
        />
      )}
      {f.dialogoLista}
    </div>
  )
}

interface FilaFamilia {
  codigo: string
  descripcion: string
  plantilla_tarifa_codigo: string | null
  web_publicada: boolean
  web_codigo: string | null
  web_descripcion: string | null
  web_fecha_baja: string | null
  web_id_link: number | null
}

const CAMPOS_FILTRO = [
  { key: 'codigo', label: 'Código' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'plantilla_tarifa_codigo', label: 'Plantilla' },
  { key: 'web_codigo', label: 'Fam. Web' },
]

/** Pestaña «Regilla»: todas las familias en rejilla, con filtro por nivel, web y campo. */
function RejillaFamilias({ actual, onAbrir }: { actual: string; onAbrir: (codigo: string) => void }) {
  const [niveles, setNiveles] = useState<number[]>([])
  const [soloWeb, setSoloWeb] = useState(false)
  const [campo, setCampo] = useState('codigo')
  const [condicion, setCondicion] = useState('no')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [aplicado, setAplicado] = useState(0)
  const [rows, setRows] = useState<FilaFamilia[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancel = false
    setCargando(true)
    let q = supabase
      .from('familia')
      .select('codigo, descripcion, plantilla_tarifa_codigo, web_publicada, web_codigo, web_descripcion, web_fecha_baja, web_id_link')
      .order('codigo')
      .limit(2000)
    if (soloWeb) q = q.eq('web_publicada', true)
    const v1 = desde.trim().replace(/[,%()]/g, ' ')
    const v2 = hasta.trim().replace(/[,%()]/g, ' ')
    if (condicion === 'igual' && v1) q = q.eq(campo, v1)
    if (condicion === 'contiene' && v1) q = q.ilike(campo, `%${v1}%`)
    if (condicion === 'empieza' && v1) q = q.ilike(campo, `${v1}%`)
    if (condicion === 'rango') {
      if (v1) q = q.gte(campo, v1)
      if (v2) q = q.lte(campo, v2)
    }
    q.then(({ data }) => {
      if (cancel) return
      let filas = (data ?? []) as FilaFamilia[]
      if (niveles.length) filas = filas.filter((r) => niveles.includes(r.codigo.length / 2))
      setRows(filas)
      setCargando(false)
    })
    return () => {
      cancel = true
    }
    // Solo se vuelve a consultar al pulsar «Aplicar», como en GeminisWin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplicado])

  const conValor = condicion !== 'no'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-stretch gap-1.5">
        <GwGroup title="Filtrar Nivel">
          <div className="flex gap-3 px-1">
            {[1, 2, 3].map((n) => (
              <GwCheck
                key={n}
                label={String(n)}
                checked={niveles.includes(n)}
                onChange={(v) => setNiveles((ns) => (v ? [...ns, n] : ns.filter((x) => x !== n)))}
              />
            ))}
          </div>
        </GwGroup>
        <GwGroup title="Web">
          <div className="flex justify-center px-2">
            <GwCheck label="" checked={soloWeb} onChange={setSoloWeb} />
          </div>
        </GwGroup>
        <GwGroup title="Filtrar según campos" className="flex-1">
          <div className="grid grid-cols-[180px_220px_minmax(0,1fr)_minmax(0,1fr)] gap-x-1">
            <GwSelect value={campo} onChange={(e) => setCampo(e.target.value)}>
              {CAMPOS_FILTRO.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </GwSelect>
            <GwSelect value={condicion} onChange={(e) => setCondicion(e.target.value)}>
              <option value="no">No Filtrar</option>
              <option value="igual">Igual a</option>
              <option value="empieza">Empieza por</option>
              <option value="contiene">Contiene</option>
              <option value="rango">Desde / Hasta</option>
            </GwSelect>
            <GwInput value={desde} disabled={!conValor} onChange={(e) => setDesde(e.target.value)} placeholder={condicion === 'rango' ? 'Desde' : ''} />
            <GwInput value={hasta} disabled={condicion !== 'rango'} onChange={(e) => setHasta(e.target.value)} placeholder={condicion === 'rango' ? 'Hasta' : ''} />
          </div>
        </GwGroup>
        <button type="button" className="gw-btn h-auto! w-[80px] flex-col gap-0 text-[14px]" onClick={() => setAplicado((a) => a + 1)}>
          Aplicar
          <X size={13} strokeWidth={3} className="text-[#c42b1c]" />
        </button>
      </div>
      <div className="h-[236px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: '12%' }}>Código</th>
              <th style={{ width: '23%' }}>Descripción</th>
              <th style={{ width: '6%' }}>Plantil.</th>
              <th style={{ width: '5%' }}>Web</th>
              <th style={{ width: '9%' }}>Fam. Web</th>
              <th>Descripción para la Web</th>
              <th style={{ width: '9%' }}>Baja Web</th>
              <th style={{ width: '7%' }}>Web Id</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.codigo} className={r.codigo === actual ? 'gw-selected' : ''} onClick={() => onAbrir(r.codigo)}>
                <td>{r.codigo}</td>
                <td>{r.descripcion}</td>
                <td>{r.plantilla_tarifa_codigo ?? ''}</td>
                <td className="text-center">
                  <input type="checkbox" className="m-0 h-[12px] w-[12px]" checked={r.web_publicada} readOnly tabIndex={-1} />
                </td>
                <td>{r.web_codigo ?? ''}</td>
                <td>{r.web_descripcion ?? ''}</td>
                <td>{fecha(r.web_fecha_baja)}</td>
                <td className="text-right">{r.web_id_link ?? 0}</td>
              </tr>
            ))}
            <FilasVacias cols={8} ocupadas={rows.length} total={10} />
          </tbody>
        </table>
      </div>
      <span className="text-[13px] text-[#1a4fd0]">{cargando ? 'Cargando…' : `Nº Familias: ${rows.length}`}</span>
    </div>
  )
}

interface FilaArticulo {
  codigo_interno: string
  descripcion: string
  marca_codigo: string | null
  pvp: number | null
}

/** Pestaña «Artículos»: los artículos de la familia, con su mini barra y el botón «Artículos». */
function ArticulosFamilia({ familia, onAbrir }: { familia: string; onAbrir: (codigo: string) => void }) {
  const [rows, setRows] = useState<FilaArticulo[]>([])
  const [total, setTotal] = useState(0)
  const [sel, setSel] = useState(0)
  const [buscar, setBuscar] = useState(false)

  useEffect(() => {
    supabase
      .from('articulo')
      .select('codigo_interno, descripcion, marca_codigo, pvp', { count: 'exact' })
      .eq('familia_codigo', familia)
      .order('codigo_interno')
      .limit(1000)
      .then(({ data, count }) => {
        setRows((data ?? []) as FilaArticulo[])
        setTotal(count ?? 0)
        setSel(0)
      })
  }, [familia])

  const btn =
    'flex h-[22px] w-[62px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent'
  const hay = rows.length > 0

  return (
    <div className="flex flex-col gap-1">
      <div className="h-[262px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: '25%' }} className="text-center!">
                Cod_intern
              </th>
              <th className="text-center!">Descrip</th>
              <th style={{ width: '14%' }}>Marca</th>
              <th style={{ width: '12%' }} className="text-right!">
                PVP
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.codigo_interno} className={i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)} onDoubleClick={() => onAbrir(r.codigo_interno)}>
                <td>{r.codigo_interno}</td>
                <td>{r.descripcion}</td>
                <td>{r.marca_codigo ?? ''}</td>
                <td className="text-right">{formatGw(r.pvp ?? 0, 3)}</td>
              </tr>
            ))}
            <FilasVacias cols={4} ocupadas={rows.length} total={11} />
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
          <button type="button" className={btn} title="Primero" disabled={!hay} onClick={() => setSel(0)}>
            <ChevronFirst size={13} strokeWidth={3} />
          </button>
          <button type="button" className={btn} title="Anterior" disabled={!hay} onClick={() => setSel((s) => Math.max(s - 1, 0))}>
            <Play size={9} className="rotate-180" fill="currentColor" />
          </button>
          <button type="button" className={btn} title="Siguiente" disabled={!hay} onClick={() => setSel((s) => Math.min(s + 1, rows.length - 1))}>
            <Play size={9} fill="currentColor" />
          </button>
          <button type="button" className={btn} title="Último" disabled={!hay} onClick={() => setSel(rows.length - 1)}>
            <ChevronLast size={13} strokeWidth={3} />
          </button>
          <button type="button" className={`${btn} border-r-0`} title="Buscar" disabled={!hay} onClick={() => setBuscar(true)}>
            <Binoculars size={13} />
          </button>
        </div>
        <button type="button" className="gw-btn" disabled={!rows[sel]} onClick={() => rows[sel] && onAbrir(rows[sel].codigo_interno)}>
          Artículos
        </button>
        <span className="text-[13px] text-[#1a4fd0]">Nº Artículos: {total}</span>
      </div>
      {buscar && (
        <GwLookupDialog<{ codigo_interno: string; descripcion: string }>
          title="Buscar artículo de la familia"
          table="articulo"
          columns={[
            { key: 'codigo_interno', label: 'Código Interno', width: 130 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo_interno', 'descripcion']}
          orderBy="codigo_interno"
          keyColumn="codigo_interno"
          onPick={(r) => {
            setBuscar(false)
            const i = rows.findIndex((x) => x.codigo_interno === r.codigo_interno)
            if (i >= 0) setSel(i)
            else onAbrir(r.codigo_interno)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
    </div>
  )
}
