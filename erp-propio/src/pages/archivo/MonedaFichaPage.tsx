import { useState } from 'react'
import { GwDate, GwField, GwGroup, GwInput, GwNumber } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { useFichaMaestro } from '../almacen/useFichaMaestro'
import { PieEstado } from '../almacen/piezas'
import { GwSpin, PestanaPendiente } from './comun'
import { TEXTO_BAJA, bajaOReactivar } from './bajaLogica'

interface Moneda {
  codigo: string
  descripcion: string
  descripcion_corta: string | null
  valor_billete: number | null
  valor_cheque: number | null
  decimales: number | null
  fecha_actualizacion: string | null
  activo: boolean
  actualizado_en?: string
}

const VACIA: Moneda = {
  codigo: '',
  descripcion: '',
  descripcion_corta: null,
  valor_billete: null,
  valor_cheque: null,
  decimales: 2,
  fecha_actualizacion: null,
  activo: true,
}

/**
 * Archivo → Monedas. SIN CAPTURA de GeminisWin: hecha con el esquema (MONEDAS) y el estilo de
 * Formas de Pago; ajustar cuando llegue la captura. Valor billete/cheque = cotización frente a
 * la moneda de la empresa (cuántas unidades de esta moneda vale 1 €), como en «Carga Cotización».
 */
export function MonedaFichaPage() {
  const f = useFichaMaestro<Moneda>({
    tabla: 'moneda',
    base: '/monedas',
    vacio: VACIA,
    campoNombre: 'descripcion',
    que: 'la moneda',
    titulo: 'Monedas',
    rpc: 'gw_lista_ordenada_archivo',
  })
  const { draft: d, patch, editing, mode } = f
  const [buscar, setBuscar] = useState(false)

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing

  async function baja() {
    if (f.sinRegistros || !f.registro.codigo) return
    const r = await bajaOReactivar({ tabla: 'moneda', clave: { codigo: f.registro.codigo }, activo: f.registro.activo, descripcion: `la moneda ${f.registro.codigo} ${f.registro.descripcion}` })
    if (r === true) return
    if (r) return f.setError(r)
    window.location.reload()
  }

  return (
    <div className="flex max-w-[860px] flex-col gap-1">
      <div className="grid grid-cols-[110px_minmax(0,1fr)_200px] gap-x-3">
        <GwField label="Código">
          <GwCampoBusqueda value={d.codigo} editable={mode === 'alta'} disabled={mode === 'edicion'} title="CODIGO" maxLength={4} onChange={(v) => patch({ codigo: v.toUpperCase() })} {...f.busqueda('codigo')} />
        </GwField>
        <GwField label="Descripción">
          <GwCampoBusqueda value={d.descripcion} editable={editing} title="DESCRIP" maxLength={40} onChange={(v) => patch({ descripcion: v })} {...f.busqueda('nombre')} />
        </GwField>
        <GwField label="Descr. Corta">
          <GwInput value={d.descripcion_corta ?? ''} disabled={ro} title="DESCORTA" maxLength={10} onChange={(e) => patch({ descripcion_corta: e.target.value || null })} />
        </GwField>
      </div>
      {(f.error || (!f.registro.activo && !f.sinRegistros && mode !== 'alta')) && <div className="text-[13px] text-[#c42b1c]">{f.error ?? TEXTO_BAJA}</div>}

      {f.sinRegistros ? (
        <PestanaPendiente texto="No hay ninguna moneda. Pulsa Nuevo para dar de alta la primera." alto={160} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-3 pt-1">
          <GwGroup title="Cotización (unidades por 1 €)" className="grid grid-cols-[150px_140px] items-center gap-x-3 gap-y-1.5">
            <span className="gw-label">Valor Billete:</span>
            <GwNumber value={d.valor_billete} decimals={6} emptyAsZero disabled={ro} onChange={ro ? undefined : (v) => patch({ valor_billete: v })} />
            <span className="gw-label">Valor Cheque:</span>
            <GwNumber value={d.valor_cheque} decimals={6} emptyAsZero disabled={ro} onChange={ro ? undefined : (v) => patch({ valor_cheque: v })} />
            <span className="gw-label">Fecha Actualización:</span>
            <GwDate value={d.fecha_actualizacion} disabled={ro} title="FECHAACT" onChange={(v) => patch({ fecha_actualizacion: v })} />
          </GwGroup>
          <GwGroup title="Presentación" className="grid grid-cols-[100px_80px] items-center gap-x-3 gap-y-1.5">
            <span className="gw-label">Decimales:</span>
            <GwSpin value={d.decimales} max={6} disabled={ro} title="DECIMALES" onChange={(v) => patch({ decimales: v })} />
          </GwGroup>
        </div>
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
        onNew={() => f.navigate('/monedas/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={baja}
        onSave={() =>
          f.guardar(() => {
            if (!d.codigo.trim() || !d.descripcion.trim()) return 'El código y la descripción son obligatorios.'
            if ((d.valor_billete ?? 0) < 0 || (d.valor_cheque ?? 0) < 0) return 'La cotización no puede ser negativa.'
            return null
          })
        }
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.total} mode={mode} que="moneda" />

      {buscar && (
        <GwLookupDialog<{ codigo: string; descripcion: string; descripcion_corta: string | null }>
          title="Buscar Moneda"
          table="moneda"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'descripcion_corta', label: 'Descr. Corta', width: 120 },
          ]}
          searchColumns={['codigo', 'descripcion', 'descripcion_corta']}
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
