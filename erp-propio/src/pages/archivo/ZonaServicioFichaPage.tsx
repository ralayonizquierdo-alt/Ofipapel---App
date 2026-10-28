import { useState } from 'react'
import { GwField, GwGroup, GwTextArea } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { useFichaMaestro } from '../almacen/useFichaMaestro'
import { PieEstado } from '../almacen/piezas'
import { PestanaPendiente } from './comun'
import { TEXTO_BAJA, bajaOReactivar } from './bajaLogica'

interface ZonaServicio {
  codigo: string
  descripcion: string
  observaciones: string | null
  activo: boolean
  actualizado_en?: string
}

const VACIA: ZonaServicio = { codigo: '', descripcion: '', observaciones: null, activo: true }

export const BASE_ZONAS_SERVICIO = '/archivo/zonas-servicio'

/**
 * Archivo → Zonas de servicio. SIN CAPTURA de GeminisWin: maestro sencillo (código y
 * descripción, con observaciones) hecho con el estilo de Monedas; ajustar cuando llegue la
 * captura. Navegación por registro vecino, Localizar, Ctrl+Intro (lista ordenada con
 * gw_lista_ordenada_zona_servicio) y baja lógica.
 */
export function ZonaServicioFichaPage() {
  const f = useFichaMaestro<ZonaServicio>({
    tabla: 'zona_servicio',
    base: BASE_ZONAS_SERVICIO,
    vacio: VACIA,
    campoNombre: 'descripcion',
    que: 'la zona de servicio',
    titulo: 'Zonas de servicio',
    rpc: 'gw_lista_ordenada_zona_servicio',
  })
  const { draft: d, patch, editing, mode } = f
  const [buscar, setBuscar] = useState(false)

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing

  async function baja() {
    if (f.sinRegistros || !f.registro.codigo) return
    const r = await bajaOReactivar({
      tabla: 'zona_servicio',
      clave: { codigo: f.registro.codigo },
      activo: f.registro.activo,
      descripcion: `la zona de servicio ${f.registro.codigo} ${f.registro.descripcion}`,
    })
    if (r === true) return
    if (r) return f.setError(r)
    window.location.reload()
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-1">
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3">
        <GwField label="Código">
          <GwCampoBusqueda
            value={d.codigo}
            editable={mode === 'alta'}
            disabled={mode === 'edicion'}
            title="CODIGO"
            maxLength={10}
            onChange={(v) => patch({ codigo: v.toUpperCase() })}
            {...f.busqueda('codigo')}
          />
        </GwField>
        <GwField label="Descripción">
          <GwCampoBusqueda value={d.descripcion} editable={editing} title="DESCRIP" maxLength={40} onChange={(v) => patch({ descripcion: v })} {...f.busqueda('nombre')} />
        </GwField>
      </div>
      {(f.error || (!f.registro.activo && !f.sinRegistros && mode !== 'alta')) && <div className="text-[13px] text-[#c42b1c]">{f.error ?? TEXTO_BAJA}</div>}

      {f.sinRegistros ? (
        <PestanaPendiente texto="No hay ninguna zona de servicio. Pulsa Nuevo para dar de alta la primera." alto={160} />
      ) : (
        <GwGroup title="Observaciones">
          <GwTextArea className="h-[120px] w-full" value={d.observaciones ?? ''} disabled={ro} onChange={(e) => patch({ observaciones: e.target.value || null })} />
        </GwGroup>
      )}

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
        onNew={() => f.navigate(`${BASE_ZONAS_SERVICIO}/nuevo`)}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={baja}
        onSave={() => f.guardar(() => (!d.codigo.trim() || !d.descripcion.trim() ? 'El código y la descripción son obligatorios.' : null))}
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.total} mode={mode} que="zona de servicio" />

      {buscar && (
        <GwLookupDialog<{ codigo: string; descripcion: string }>
          title="Buscar Zona de servicio"
          table="zona_servicio"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
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
      {f.dialogoLista}
    </div>
  )
}
