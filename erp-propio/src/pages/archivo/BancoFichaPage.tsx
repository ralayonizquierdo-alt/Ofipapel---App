import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwField, GwGroup, GwInput, GwSelect } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { FilasVacias, GridMiniBar } from '../../components/gw/GwGridParts'
import { useFichaMaestro } from '../almacen/useFichaMaestro'
import { PieEstado } from '../almacen/piezas'
import { BuscarEnFilas } from '../ventas/maestros/common'
import { PestanaPendiente } from './comun'
import { TEXTO_BAJA, bajaOReactivar } from './bajaLogica'

interface Banco {
  codigo: string
  nombre: string
  bic: string | null
  activo: boolean
  actualizado_en?: string
}

interface Sucursal {
  banco_codigo: string
  codigo: string
  nombre: string
  direccion: string | null
  provincia_codigo: string | null
  bic_sucursal: string | null
  activo: boolean
}

const VACIO: Banco = { codigo: '', nombre: '', bic: null, activo: true }
const SUC_VACIA: Omit<Sucursal, 'banco_codigo'> = { codigo: '', nombre: '', direccion: null, provincia_codigo: null, bic_sucursal: null, activo: true }

/** BIC/SWIFT: 8 u 11 caracteres (banco, país, localidad y sucursal opcional). */
const bicMal = (v: string | null) => !!v && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v)

/**
 * Archivo → Cód. Bancarios: bancos (entidad, 4 cifras) y sus sucursales (oficina, 4 cifras).
 * SIN CAPTURA de GeminisWin: hecha con el esquema (BANCOS / SUCURSAL) y el estilo de Formas de
 * Pago y de las rejillas de Zonas; ajustar cuando llegue la captura. Lo usan las cuentas
 * bancarias de clientes, proveedores y empleados (pestaña Bancos).
 */
export function BancoFichaPage() {
  const f = useFichaMaestro<Banco>({
    tabla: 'banco',
    base: '/bancos',
    vacio: VACIO,
    campoNombre: 'nombre',
    que: 'el banco',
    titulo: 'Bancos',
    etiquetaNombre: 'Nombre',
    rpc: 'gw_lista_ordenada_archivo',
  })
  const { draft: d, patch, editing, mode } = f
  const [buscar, setBuscar] = useState(false)

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing

  async function baja() {
    if (f.sinRegistros || !f.registro.codigo) return
    const r = await bajaOReactivar({ tabla: 'banco', clave: { codigo: f.registro.codigo }, activo: f.registro.activo, descripcion: `el banco ${f.registro.codigo} ${f.registro.nombre}` })
    if (r === true) return
    if (r) return f.setError(r)
    window.location.reload()
  }

  return (
    <div className="flex max-w-[1100px] flex-col gap-1">
      <div className="grid grid-cols-[110px_minmax(0,1fr)_190px] gap-x-3">
        <GwField label="Entidad">
          <GwCampoBusqueda value={d.codigo} editable={mode === 'alta'} disabled={mode === 'edicion'} title="CODIGO (4 cifras)" maxLength={4} onChange={(v) => patch({ codigo: v.replace(/\D/g, '') })} {...f.busqueda('codigo')} />
        </GwField>
        <GwField label="Nombre">
          <GwCampoBusqueda value={d.nombre} editable={editing} title="NOMBRE" maxLength={60} onChange={(v) => patch({ nombre: v })} {...f.busqueda('nombre')} />
        </GwField>
        <GwField label="BIC / SWIFT">
          <GwInput value={d.bic ?? ''} disabled={ro} title="BIC" maxLength={11} onChange={(e) => patch({ bic: e.target.value.toUpperCase().replace(/\s/g, '') || null })} />
        </GwField>
      </div>
      {(f.error || (!f.registro.activo && !f.sinRegistros && mode !== 'alta')) && <div className="text-[13px] text-[#c42b1c]">{f.error ?? TEXTO_BAJA}</div>}

      {f.sinRegistros ? (
        <PestanaPendiente texto="No hay ningún banco. Pulsa Nuevo para dar de alta el primero." alto={330} />
      ) : mode === 'alta' ? (
        <PestanaPendiente texto="Guarda el banco para añadirle sucursales." alto={330} />
      ) : (
        <Sucursales banco={f.registro.codigo} editing={mode === 'edicion'} />
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
        onNew={() => f.navigate('/bancos/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={baja}
        onSave={() =>
          f.guardar(() => {
            if (!/^\d{4}$/.test(d.codigo.trim())) return 'El código de entidad son 4 cifras (p. ej. 2100).'
            if (!d.nombre.trim()) return 'El nombre del banco es obligatorio.'
            if (bicMal(d.bic)) return 'El BIC no es válido: 8 u 11 caracteres (p. ej. CAIXESBBXXX).'
            return null
          })
        }
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.total} mode={mode} que="banco" porNombre="por nombre" />

      {buscar && (
        <GwLookupDialog<{ codigo: string; nombre: string; bic: string | null }>
          title="Buscar Banco"
          table="banco"
          columns={[
            { key: 'codigo', label: 'Entidad', width: 80 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'bic', label: 'BIC', width: 120 },
          ]}
          searchColumns={['codigo', 'nombre', 'bic']}
          orderBy={f.orden === 'codigo' ? 'codigo' : 'nombre'}
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

/** Rejilla de sucursales del banco, con su línea de edición debajo (como las rejillas de GeminisWin). */
function Sucursales({ banco, editing }: { banco: string; editing: boolean }) {
  const [rows, setRows] = useState<Sucursal[]>([])
  const [provincias, setProvincias] = useState<{ codigo: string; nombre: string }[]>([])
  const [sel, setSel] = useState(0)
  const [edit, setEdit] = useState<{ nueva: boolean; s: Omit<Sucursal, 'banco_codigo'> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscar, setBuscar] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    supabase
      .from('provincia')
      .select('codigo, nombre')
      .order('nombre')
      .then(({ data }) => setProvincias((data ?? []) as { codigo: string; nombre: string }[]))
  }, [])

  useEffect(() => {
    if (!banco) return
    supabase
      .from('banco_sucursal')
      .select('banco_codigo, codigo, nombre, direccion, provincia_codigo, bic_sucursal, activo')
      .eq('banco_codigo', banco)
      .order('codigo')
      .then(({ data }) => setRows((data ?? []) as Sucursal[]))
  }, [banco, version])

  useEffect(() => {
    setEdit(null)
    setError(null)
    setSel(0)
  }, [banco, editing])

  const actual = rows[sel]
  const provincia = (c: string | null) => provincias.find((p) => p.codigo === c)?.nombre ?? c ?? ''

  async function aceptar() {
    if (!edit) return
    setError(null)
    const s = { ...edit.s, codigo: edit.s.codigo.trim(), nombre: edit.s.nombre.trim() }
    if (!/^\d{4}$/.test(s.codigo)) return setError('El código de sucursal (oficina) son 4 cifras.')
    if (!s.nombre) return setError('El nombre de la sucursal es obligatorio.')
    if (bicMal(s.bic_sucursal)) return setError('El BIC de la sucursal no es válido: 8 u 11 caracteres.')
    if (edit.nueva && rows.some((r) => r.codigo === s.codigo)) return setError(`La sucursal ${s.codigo} ya existe en este banco.`)
    const res = edit.nueva
      ? await supabase.from('banco_sucursal').insert({ ...s, banco_codigo: banco })
      : await supabase.from('banco_sucursal').update(s).eq('banco_codigo', banco).eq('codigo', s.codigo)
    if (res.error) return setError(res.error.code === '23505' ? `La sucursal ${s.codigo} ya existe en este banco.` : res.error.message)
    setEdit(null)
    setVersion((v) => v + 1)
    if (edit.nueva) setSel(rows.filter((r) => r.codigo < s.codigo).length)
  }

  async function bajaLinea() {
    if (!actual) return
    const r = await bajaOReactivar({
      tabla: 'banco_sucursal',
      clave: { banco_codigo: banco, codigo: actual.codigo },
      activo: actual.activo,
      descripcion: `la sucursal ${actual.codigo} ${actual.nombre}`,
    })
    if (r === true) return
    if (r) return setError(r)
    setVersion((v) => v + 1)
  }

  const s = edit?.s
  const ps = (p: Partial<Omit<Sucursal, 'banco_codigo'>>) => setEdit((e) => (e ? { ...e, s: { ...e.s, ...p } } : e))

  return (
    <GwGroup title="Sucursales" className="flex flex-col gap-1">
      <div className="h-[218px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid min-w-[880px]" title="SUCURSAL">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 70 }}>Oficina</th>
              <th style={{ width: 260 }}>Nombre</th>
              <th style={{ width: 260 }}>Dirección</th>
              <th style={{ width: 150 }}>Provincia</th>
              <th style={{ width: 110 }}>BIC</th>
              <th>Habilt.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.codigo}
                className={`${i === sel ? 'gw-selected' : ''} ${r.activo ? '' : 'text-[#8a8a8a]'}`}
                onClick={() => !edit && setSel(i)}
                onDoubleClick={() => editing && !edit && setEdit({ nueva: false, s: { ...r } })}
              >
                <td>{r.codigo}</td>
                <td className="truncate">{r.nombre}</td>
                <td className="truncate">{r.direccion ?? ''}</td>
                <td className="truncate">{provincia(r.provincia_codigo)}</td>
                <td>{r.bic_sucursal ?? ''}</td>
                <td className="text-center">{r.activo ? <Check size={13} strokeWidth={3} className="inline text-[#16a316]" /> : <X size={13} strokeWidth={3} className="inline text-[#c42b1c]" />}</td>
              </tr>
            ))}
            <FilasVacias cols={6} ocupadas={rows.length} total={9} />
          </tbody>
        </table>
      </div>
      {s && (
        <div className="grid grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)_160px_120px_auto] items-end gap-x-1.5">
          <GwField label="Oficina">
            <GwInput autoFocus={edit?.nueva} value={s.codigo} disabled={!edit?.nueva} maxLength={4} title="CODIGO" onChange={(e) => ps({ codigo: e.target.value.replace(/\D/g, '') })} />
          </GwField>
          <GwField label="Nombre">
            <GwInput autoFocus={!edit?.nueva} value={s.nombre} maxLength={60} title="NOMBRE" onChange={(e) => ps({ nombre: e.target.value })} />
          </GwField>
          <GwField label="Dirección">
            <GwInput value={s.direccion ?? ''} title="DIRECCION" onChange={(e) => ps({ direccion: e.target.value || null })} />
          </GwField>
          <GwField label="Provincia">
            <GwSelect value={s.provincia_codigo ?? ''} title="PROVINCIA" onChange={(e) => ps({ provincia_codigo: e.target.value || null })}>
              <option value="" />
              {provincias.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nombre}
                </option>
              ))}
            </GwSelect>
          </GwField>
          <GwField label="BIC">
            <GwInput value={s.bic_sucursal ?? ''} maxLength={11} title="BIC" onChange={(e) => ps({ bic_sucursal: e.target.value.toUpperCase().replace(/\s/g, '') || null })} />
          </GwField>
          <div className="flex gap-1">
            <button type="button" className="gw-btn px-2" title="Aceptar la línea" onClick={aceptar}>
              <Check size={14} className="text-[#127a12]" />
            </button>
            <button
              type="button"
              className="gw-btn px-2"
              title="Cancelar la línea"
              onClick={() => {
                setEdit(null)
                setError(null)
              }}
            >
              <X size={14} className="text-[#c42b1c]" />
            </button>
          </div>
        </div>
      )}
      {error && <div className="text-[13px] text-[#c42b1c]">{error}</div>}
      <GridMiniBar
        nuevo={editing && !edit}
        modificar={editing && !edit && !!actual}
        borrar={editing && !edit && !!actual}
        buscar={rows.length > 0 && !edit}
        onNuevo={() => {
          setError(null)
          setEdit({ nueva: true, s: { ...SUC_VACIA } })
        }}
        onModificar={() => actual && setEdit({ nueva: false, s: { ...actual } })}
        onBorrar={bajaLinea}
        onBuscar={() => setBuscar(true)}
      >
        <span className="text-[11px] text-[#444]">
          {rows.length} sucursal(es){editing ? '' : ' · Pulsa Modificar para añadir o cambiar sucursales'}
        </span>
      </GridMiniBar>
      {buscar && (
        <BuscarEnFilas
          titulo="Localizar sucursal"
          filas={rows.map((r) => ({ clave: r.codigo, texto: `${r.codigo} ${r.nombre} ${r.direccion ?? ''}` }))}
          onPick={(i) => {
            setSel(i)
            setBuscar(false)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
    </GwGroup>
  )
}
