import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInput, GwTabs, GwTextArea, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { useFichaMaestro } from './useFichaMaestro'
import { ArticulosDe, ImagenRecuadro, PieEstado } from './piezas'

interface Marca {
  codigo: string
  web_publicada: boolean
  observaciones: string | null
  imagen_url: string | null
  actualizado_en: string
}

const VACIA: Marca = { codigo: '', web_publicada: false, observaciones: null, imagen_url: null, actualizado_en: '' }

const TABS: GwTabDef[][] = [
  [
    { key: 'general', label: 'Datos Generales' },
    { key: 'articulos', label: 'Artículos' },
  ],
]

function fechaHora(v: string) {
  if (!v) return '  /  /'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES')}`
}

export function MarcaFichaPage() {
  const f = useFichaMaestro<Marca>({ tabla: 'marca', base: '/marcas', vacio: VACIA, campoNombre: 'codigo' })
  const { draft, patch, editing, mode } = f
  const [tab, setTab] = useState('general')
  const [buscar, setBuscar] = useState(false)

  async function enUso() {
    const { count } = await supabase
      .from('articulo')
      .select('codigo_interno', { count: 'exact', head: true })
      .eq('marca_codigo', f.registro.codigo)
    return count ? `No se puede eliminar la marca ${f.registro.codigo}: la usan ${count} artículo(s).` : null
  }

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,420px)_180px] gap-x-1.5">
        <GwField label="Marca">
          <GwInput
            value={draft.codigo}
            disabled={mode !== 'alta'}
            title="MARCA"
            maxLength={20}
            onChange={(e) => patch({ codigo: e.target.value.toUpperCase() })}
          />
        </GwField>
        <GwField label="Últ. Modificación">
          <GwInput readOnly value={mode === 'alta' ? '  /  /' : fechaHora(draft.actualizado_en)} title="ULTMOD" />
        </GwField>
      </div>
      {f.error && <div className="text-[13px] text-[#c42b1c]">{f.error}</div>}

      <div className="mt-1">
        <GwTabs rows={TABS} active={tab} onChange={setTab}>
          {f.sinRegistros ? (
            <div className="p-3 text-[13px]">No hay ninguna marca. Pulsa Nuevo para dar de alta la primera.</div>
          ) : (
            <div className="min-h-[300px]">
              {tab === 'general' && (
                <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-3">
                  <div className="flex flex-col gap-1.5">
                    <GwCheck
                      label="Publicada en la Web"
                      checked={draft.web_publicada}
                      disabled={ro}
                      onChange={(v) => patch({ web_publicada: v })}
                    />
                    <GwField label="Observaciones">
                      <GwTextArea
                        rows={13}
                        value={draft.observaciones ?? ''}
                        disabled={ro}
                        title="OBSERV"
                        onChange={(e) => patch({ observaciones: e.target.value || null })}
                      />
                    </GwField>
                  </div>
                  <GwGroup title="Imagen">
                    <div className="flex flex-col gap-1">
                      <ImagenRecuadro url={draft.imagen_url} alto={220} />
                      <GwInput
                        value={draft.imagen_url ?? ''}
                        disabled={ro}
                        title="IMAGEN — ruta o dirección de la imagen"
                        onChange={(e) => patch({ imagen_url: e.target.value || null })}
                      />
                    </div>
                  </GwGroup>
                </div>
              )}
              {tab === 'articulos' && f.registro.codigo && mode !== 'alta' && (
                <ArticulosDe columna="marca_codigo" valor={f.registro.codigo} titulo="Artículos de esta marca" />
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
        onNew={() => f.navigate('/marcas/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={() => f.eliminar(`la marca ${f.registro.codigo}`, enUso)}
        onSave={() => f.guardar(() => (!draft.codigo.trim() ? 'El nombre de la marca es obligatorio.' : null))}
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.ordenada.length} mode={mode} que="marca" porNombre="por marca" />

      {buscar && (
        <GwLookupDialog<{ codigo: string }>
          title="Buscar Marca"
          table="marca"
          columns={[{ key: 'codigo', label: 'Marca' }]}
          searchColumns={['codigo']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(false)
            f.goTo(r.codigo)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
    </div>
  )
}
