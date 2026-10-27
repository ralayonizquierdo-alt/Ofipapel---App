import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwField, GwInput, GwTextArea } from '../../components/gw'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { useFichaMaestro } from './useFichaMaestro'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { BarraCompacta, ImagenConModo, PieEstado } from './piezas'

interface Marca {
  codigo: string
  web_publicada: boolean
  observaciones: string | null
  imagen_url: string | null
  imagen_modo: number
  actualizado_en: string
}

const VACIA: Marca = { codigo: '', web_publicada: false, observaciones: null, imagen_url: null, imagen_modo: 1, actualizado_en: '' }

function fechaHora(v: string) {
  if (!v) return '  /  /'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES')}`
}

/** Almacén → Marcas, calcada de la ficha de GeminisWin (MARCAS). */
export function MarcaFichaPage() {
  const f = useFichaMaestro<Marca>({ tabla: 'marca', base: '/marcas', vacio: VACIA, campoNombre: 'codigo', que: 'la marca', titulo: 'Marcas', etiquetaCodigo: 'Marca' })
  const { draft, patch, editing, mode } = f
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
    <div className="flex max-w-[1000px] flex-col gap-1">
      {f.sinRegistros && <div className="text-[13px]">No hay ninguna marca. Pulsa Agregar para dar de alta la primera.</div>}
      <div className="grid grid-cols-[330px_minmax(0,1fr)] gap-x-3">
        <div className="flex flex-col gap-1">
          <GwField label="Marca">
            <GwCampoBusqueda
              value={draft.codigo}
              editable={mode === 'alta'}
              disabled={mode === 'edicion'}
              title="MARCA"
              maxLength={20}
              onChange={(v) => patch({ codigo: v.toUpperCase() })}
              {...f.busqueda('codigo')}
            />
          </GwField>
          <GwField label="Ultmod">
            <GwInput readOnly value={mode === 'alta' ? '  /  /' : fechaHora(draft.actualizado_en)} title="ULTMOD" />
          </GwField>
          <GwCheck
            className="mt-1"
            label="Publicada en la Web"
            checked={draft.web_publicada}
            disabled={ro}
            onChange={(v) => patch({ web_publicada: v })}
          />
        </div>
        <GwField label="Observ">
          <GwTextArea
            className="!h-[104px] resize-none"
            value={draft.observaciones ?? ''}
            disabled={ro}
            title="OBSERV"
            onChange={(e) => patch({ observaciones: e.target.value || null })}
          />
        </GwField>
      </div>
      <span className="gw-label mt-1 border-b border-[var(--gw-border-light)]">Imagen</span>
      <ImagenConModo
        nombre="marca"
        url={draft.imagen_url}
        modo={draft.imagen_modo ?? 1}
        alto={180}
        disabled={ro}
        onUrl={(v) => patch({ imagen_url: v })}
        onModo={(v) => patch({ imagen_modo: v })}
      />
      {f.error && <div className="text-[13px] text-[#c42b1c]">{f.error}</div>}

      <BarraCompacta
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
      {f.dialogoLista}
    </div>
  )
}
