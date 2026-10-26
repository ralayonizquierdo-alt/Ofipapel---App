import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  GwCheck,
  GwField,
  GwGroup,
  GwInline,
  GwInput,
  GwLookupButton,
  GwNumber,
  GwSelect,
  GwTabs,
  GwTextArea,
  type GwTabDef,
} from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { useFichaMaestro } from './useFichaMaestro'
import { ArticulosDe, ImagenRecuadro, PieEstado } from './piezas'

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
  web_publicada: false,
  web_codigo: null,
  web_descripcion: null,
  web_fecha_baja: null,
  web_id_link: null,
  actualizado_en: '',
}

const TABS: GwTabDef[][] = [
  [
    { key: 'general', label: 'Datos Generales' },
    { key: 'web', label: 'Web' },
    { key: 'obs', label: 'Observaciones' },
    { key: 'articulos', label: 'Artículos' },
  ],
]

// nivel1 y nivel2 son columnas generadas en la BD: nunca se envían.
const SIN_COLUMNAS = ['actualizado_en', 'nivel1', 'nivel2']

export function FamiliaFichaPage() {
  const f = useFichaMaestro<Familia>({ tabla: 'familia', base: '/familias', vacio: VACIA, campoNombre: 'descripcion', sinColumnas: SIN_COLUMNAS })
  const { draft, patch, editing, mode } = f
  const [tab, setTab] = useState('general')
  const [buscar, setBuscar] = useState(false)
  const [buscarPlantilla, setBuscarPlantilla] = useState(false)
  const [plantillas, setPlantillas] = useState<{ codigo: string; descripcion: string }[]>([])
  const [padres, setPadres] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase
      .from('plantilla_tarifa')
      .select('codigo, descripcion')
      .order('codigo')
      .then(({ data }) => setPlantillas((data ?? []) as { codigo: string; descripcion: string }[]))
  }, [])

  const cod = draft.codigo.trim()
  const n1 = cod.slice(0, 2)
  const n2 = cod.slice(0, 4)
  const valido = /^\d{6}$/.test(cod)

  // Descripción de los niveles superiores (familias 2 0000 y 2091 00 de la 209102).
  useEffect(() => {
    if (!/^\d{6}$/.test(cod)) {
      setPadres({})
      return
    }
    const codigos = [`${cod.slice(0, 2)}0000`, `${cod.slice(0, 4)}00`].filter((c) => c !== cod)
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
  const texto = (key: keyof Familia, title: string, max?: number) => (
    <GwInput
      value={(draft[key] ?? '') as string}
      disabled={ro}
      title={title}
      maxLength={max}
      onChange={(e) => patch({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Familia>)}
    />
  )
  const descPadre = (c: string) => (c === cod ? draft.descripcion : padres[c] ?? '')

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[110px_minmax(0,1fr)_200px] gap-x-1.5">
        <GwField label="Código">
          <GwInput
            value={draft.codigo}
            disabled={mode !== 'alta'}
            title="COD_FAM: 6 dígitos, 3 niveles de 2"
            maxLength={6}
            inputMode="numeric"
            onChange={(e) => patch({ codigo: e.target.value.replace(/\D/g, '') })}
          />
        </GwField>
        <GwField label="Descripción">{texto('descripcion', 'DESCRIP', 45)}</GwField>
        <GwField label="Plantilla de Tarifas">
          <div className="flex">
            <GwSelect
              value={draft.plantilla_tarifa_codigo ?? ''}
              disabled={ro}
              title="CODTAR"
              onChange={(e) => patch({ plantilla_tarifa_codigo: e.target.value || null })}
            >
              <option value="" />
              {plantillas.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.codigo} {p.descripcion}
                </option>
              ))}
            </GwSelect>
            <GwLookupButton disabled={ro} onClick={() => setBuscarPlantilla(true)} title="Buscar plantilla de tarifas" />
          </div>
        </GwField>
      </div>
      <div className="grid grid-cols-3 gap-x-1.5">
        {[
          { label: 'Nivel 1', c: n1, full: `${n1}0000` },
          { label: 'Nivel 2', c: n2, full: `${n2}00` },
          { label: 'Nivel 3', c: cod, full: cod },
        ].map((n) => (
          <GwField key={n.label} label={n.label}>
            <div className="grid grid-cols-[60px_minmax(0,1fr)] gap-x-1">
              <GwInput readOnly value={valido ? n.c : ''} />
              <GwInput readOnly value={valido ? descPadre(n.full) : ''} />
            </div>
          </GwField>
        ))}
      </div>
      {valido && cod.startsWith('99') && (
        <div className="text-[13px] text-[#1a4fd0]">Familia de artículos obsoletos (99xxxx).</div>
      )}
      {mode === 'alta' && cod && !valido && (
        <div className="text-[13px] text-[#c42b1c]">El código de familia debe tener 6 dígitos (3 niveles de 2).</div>
      )}
      {f.error && <div className="text-[13px] text-[#c42b1c]">{f.error}</div>}

      <div className="mt-1">
        <GwTabs rows={TABS} active={tab} onChange={setTab}>
          {f.sinRegistros ? (
            <div className="p-3 text-[13px]">No hay ninguna familia. Pulsa Nuevo para dar de alta la primera.</div>
          ) : (
            <div className="min-h-[300px]">
              {tab === 'general' && (
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                  <div className="flex flex-col gap-2">
                    <GwGroup title="Descuentos y opciones">
                      <div className="flex flex-col gap-1.5">
                        <GwInline label="Nivel de Dto. para los clientes:">
                          <span className="w-[70px]" title="DESCUENTO: nivel de descuento de la familia para los clientes">
                            <GwNumber value={draft.descuento_pct} decimals={0} disabled={ro} onChange={(v) => patch({ descuento_pct: v })} />
                          </span>
                        </GwInline>
                        <GwInline label="Control de Lotes:">
                          <GwSelect
                            className="!w-[170px]"
                            value={draft.control_lotes ?? 0}
                            disabled={ro}
                            title="CTRLLOTES (confirmar códigos con Luis)"
                            onChange={(e) => patch({ control_lotes: Number(e.target.value) })}
                          >
                            <option value={0}>Predeterminado</option>
                            <option value={1}>Sí</option>
                            <option value={2}>No</option>
                          </GwSelect>
                        </GwInline>
                        <GwCheck
                          label="No Mostrar en ventas"
                          checked={draft.no_ver_en_venta}
                          disabled={ro}
                          onChange={(v) => patch({ no_ver_en_venta: v })}
                        />
                      </div>
                    </GwGroup>
                    <GwGroup title="Impresora para el TPV">
                      <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-1.5 gap-y-1">
                        <GwField label="Descripción">{texto('descripcion_corta', 'DESCRIMPR (p. ej. COCINA)', 15)}</GwField>
                        <GwField label="Impresora">{texto('impresora_etiquetas', 'IMPRESORA')}</GwField>
                        <GwField label="Informe" className="col-span-2">
                          {texto('informe_defecto', 'INFORME')}
                        </GwField>
                      </div>
                    </GwGroup>
                  </div>
                  <GwField label="Mensaje al asignar un artículo a esta familia">
                    <GwTextArea
                      rows={12}
                      value={draft.mensaje_articulo ?? ''}
                      disabled={ro}
                      title="ARTICMSG"
                      onChange={(e) => patch({ mensaje_articulo: e.target.value || null })}
                    />
                  </GwField>
                </div>
              )}
              {tab === 'web' && (
                <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-3">
                  <GwGroup title={<GwCheck label="Familia publicada en la Web" checked={draft.web_publicada} disabled={ro} onChange={(v) => patch({ web_publicada: v })} />}>
                    <div className="grid grid-cols-[150px_120px_minmax(0,1fr)] gap-x-1.5 gap-y-1">
                      <GwField label="Familia Web">{texto('web_codigo', 'WEBCODFAM', 10)}</GwField>
                      <GwField label="WebId">
                        <GwNumber value={draft.web_id_link} decimals={0} disabled={ro} onChange={(v) => patch({ web_id_link: v })} />
                      </GwField>
                      <GwField label="Fecha de baja">
                        <GwInput
                          type="date"
                          className="!w-[150px]"
                          value={draft.web_fecha_baja ?? ''}
                          disabled={ro}
                          title="WEB_F_BAJA"
                          onChange={(e) => patch({ web_fecha_baja: e.target.value || null })}
                        />
                      </GwField>
                      <GwField label="Descripción para la Web" className="col-span-3">
                        {texto('web_descripcion', 'WEBDESCRIP', 60)}
                      </GwField>
                    </div>
                  </GwGroup>
                  <GwGroup title="Imagen">
                    <div className="flex flex-col gap-1">
                      <ImagenRecuadro url={draft.imagen_url} alto={200} />
                      {texto('imagen_url', 'IMAGEN — ruta o dirección de la imagen')}
                    </div>
                  </GwGroup>
                </div>
              )}
              {tab === 'obs' && (
                <GwField label="Observaciones">
                  <GwTextArea
                    rows={15}
                    value={draft.observaciones ?? ''}
                    disabled={ro}
                    title="OBSERV"
                    onChange={(e) => patch({ observaciones: e.target.value || null })}
                  />
                </GwField>
              )}
              {tab === 'articulos' && f.registro.codigo && mode !== 'alta' && (
                <ArticulosDe columna="familia_codigo" valor={f.registro.codigo} titulo="Artículos de esta familia" />
              )}
            </div>
          )}
        </GwTabs>
      </div>

      <GwRecordBar
        mode={mode}
        canNavigate={f.canNavigate}
        saving={f.saving}
        onFirst={() => f.goTo(f.ordenada[0]?.codigo)}
        onPrev={() => f.goTo(f.ordenada[f.idx - 1]?.codigo)}
        onNext={() => f.goTo(f.ordenada[f.idx + 1]?.codigo)}
        onLast={() => f.goTo(f.ordenada[f.ordenada.length - 1]?.codigo)}
        onSort={() => f.setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={() => f.navigate('/familias/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={() => f.eliminar(`la familia ${f.registro.codigo} ${f.registro.descripcion}`, enUso)}
        onSave={() =>
          f.guardar(() => {
            if (!/^\d{6}$/.test(draft.codigo.trim())) return 'El código de familia debe tener 6 dígitos (3 niveles de 2).'
            if (!draft.descripcion.trim()) return 'La descripción es obligatoria.'
            return null
          })
        }
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.ordenada.length} mode={mode} que="familia" />

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
    </div>
  )
}
