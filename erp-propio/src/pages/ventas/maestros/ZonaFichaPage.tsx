import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwGroup, GwInput, GwNumber, GwTabs, type GwTabDef } from '../../../components/gw'
import { BarraFicha, BuscarEnFilas, FilasVacias, GridMiniBar, GridNavBar, ObsImagen, RejillaClientes, SelectorDialog, Tick, useFicha } from './common'

export interface Zona {
  codigo: string
  descripcion: string
  pedido_minimo: number | null
  observaciones: string | null
  imagen_url: string | null
  imagen_modo: number
  actualizado_en?: string
  [k: string]: unknown
}

const VACIO: Zona = { codigo: '', descripcion: '', pedido_minimo: null, observaciones: null, imagen_url: null, imagen_modo: 1 }

const TABS: GwTabDef[][] = [
  [
    { key: 'rutas', label: 'Rutas y Repartidores' },
    { key: 'clientes', label: 'Clientes de ésta Zona' },
    { key: 'obs', label: 'Observaciones e Imagen' },
  ],
]
const SATELITES = new Set(['rutas', 'clientes'])

export function ZonaFichaPage() {
  const f = useFicha<Zona>({ tabla: 'zona_territorial', ruta: '/zonas-territoriales', vacio: VACIO, digitos: 4, campoNombre: 'descripcion' })
  const [tab, setTab] = useState('rutas')
  const ro = !f.editing
  const d = f.draft

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>

  const bloqueado = f.mode === 'alta' || f.vacia
  const aviso = (c: React.ReactNode) =>
    bloqueado ? (
      <div className="min-h-[285px] p-3 text-[13px]">
        {f.vacia ? 'No hay ninguna zona territorial. Pulsa Nuevo para dar de alta la primera.' : 'Acepta el alta de la zona para poder rellenar esta pestaña.'}
      </div>
    ) : (
      c
    )

  async function borrar() {
    if (f.vacia || !f.registro.codigo) return
    if (!confirm(`¿Eliminar la zona territorial ${f.registro.codigo} ${f.registro.descripcion}?`)) return
    const { error } = await supabase.from('zona_territorial').delete().eq('codigo', f.registro.codigo)
    if (error) {
      f.setError(error.code === '23503' ? 'No se puede eliminar: la zona está asignada a clientes, rutas u otros registros.' : error.message)
      return
    }
    f.setLista((l) => l.filter((x) => x.codigo !== f.registro.codigo))
    f.navigate('/zonas-territoriales', { replace: true })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[120px_minmax(0,610px)_minmax(0,1fr)_150px] items-end gap-x-2">
        <GwField label="Código">
          <GwInput value={d.codigo} disabled={f.mode !== 'alta'} title="ZONATERR.CODIGO" onChange={(e) => f.patch({ codigo: e.target.value })} />
        </GwField>
        <GwField label="Descripción">
          <GwInput value={d.descripcion} disabled={ro} title="DESCRIP" onChange={(e) => f.patch({ descripcion: e.target.value })} />
        </GwField>
        <span />
        <GwField label="Pedido Mínimo">
          <GwNumber value={d.pedido_minimo} decimals={2} disabled={ro} onChange={(v) => f.patch({ pedido_minimo: v })} />
        </GwField>
      </div>
      {f.error && <div className="text-[13px] text-[#c42b1c]">{f.error}</div>}

      <div className="mt-1">
        <GwTabs rows={TABS} active={tab} onChange={setTab}>
          {f.vacia && !SATELITES.has(tab) ? (
            <div className="min-h-[285px] p-3 text-[13px]">No hay ninguna zona territorial. Pulsa Nuevo para dar de alta la primera.</div>
          ) : (
            <>
              {tab === 'rutas' && aviso(<RutasDeLaZona zona={f.registro.codigo} editing={f.mode === 'edicion'} />)}
              {tab === 'clientes' && aviso(<RejillaClientes filtro="zona_territorial_codigo" valor={f.registro.codigo} />)}
              {tab === 'obs' && (
                <ObsImagen
                  nombre="zona"
                  observaciones={d.observaciones}
                  imagenUrl={d.imagen_url}
                  imagenModo={d.imagen_modo}
                  editing={f.editing}
                  onChange={(p) => f.patch(p)}
                />
              )}
            </>
          )}
        </GwTabs>
      </div>

      <BarraFicha
        f={f}
        ruta="/zonas-territoriales"
        tabla="zona_territorial"
        titulo="Buscar Zona Territorial"
        columnas={[
          { key: 'codigo', label: 'Código', width: 90 },
          { key: 'descripcion', label: 'Descripción' },
        ]}
        buscarEn={['codigo', 'descripcion']}
        onDelete={borrar}
      />
    </div>
  )
}

interface RutaZona {
  ruta_codigo: string
  descripcion: string
  habilitada: boolean
  orden: number | null
}
interface RepartidorRuta {
  codigo: string
  nombre: string
  habilitado: boolean
}

/** «Rutas y Repartidores»: rutas a las que pertenece la zona (RUTAZONA) y repartidores de la ruta elegida (RUTAREPA). */
function RutasDeLaZona({ zona, editing }: { zona: string; editing: boolean }) {
  const [rutas, setRutas] = useState<RutaZona[]>([])
  const [sel, setSel] = useState(0)
  const [reps, setReps] = useState<RepartidorRuta[]>([])
  const [selRep, setSelRep] = useState(0)
  const [elegir, setElegir] = useState(false)
  const [buscar, setBuscar] = useState<'rutas' | 'reps' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    const { data } = await supabase
      .from('ruta_reparto_zona')
      .select('ruta_codigo, ruta_habilitada, orden, ruta:ruta_codigo(descripcion)')
      .eq('zona_territorial_codigo', zona)
      .order('ruta_codigo')
    setRutas(
      ((data ?? []) as unknown as { ruta_codigo: string; ruta_habilitada: boolean; orden: number | null; ruta: { descripcion: string } | null }[]).map((r) => ({
        ruta_codigo: r.ruta_codigo,
        descripcion: r.ruta?.descripcion ?? '',
        habilitada: r.ruta_habilitada,
        orden: r.orden,
      })),
    )
  }

  useEffect(() => {
    cargar()
    setSel(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zona])

  const rutaSel = rutas[sel]?.ruta_codigo
  useEffect(() => {
    if (!rutaSel) return setReps([])
    supabase
      .from('ruta_reparto_repartidor')
      .select('repartidor_codigo, repartidor_habilitado, repartidor:repartidor_codigo(nombre)')
      .eq('ruta_codigo', rutaSel)
      .order('repartidor_codigo')
      .then(({ data }) => {
        setReps(
          ((data ?? []) as unknown as { repartidor_codigo: string; repartidor_habilitado: boolean; repartidor: { nombre: string } | null }[]).map((r) => ({
            codigo: r.repartidor_codigo,
            nombre: r.repartidor?.nombre ?? '',
            habilitado: r.repartidor_habilitado,
          })),
        )
        setSelRep(0)
      })
  }, [rutaSel])

  async function anadir(ruta: string) {
    setElegir(false)
    setError(null)
    if (rutas.some((r) => r.ruta_codigo === ruta)) return setError(`La zona ya pertenece a la ruta ${ruta}.`)
    const { data: ult } = await supabase.from('ruta_reparto_zona').select('orden').eq('ruta_codigo', ruta).order('orden', { ascending: false, nullsFirst: false }).limit(1)
    const orden = ((ult?.[0] as { orden: number | null } | undefined)?.orden ?? 0) + 1
    const { error: err } = await supabase.from('ruta_reparto_zona').insert({ ruta_codigo: ruta, zona_territorial_codigo: zona, orden })
    if (err) return setError(err.message)
    cargar()
  }

  async function alternar() {
    const r = rutas[sel]
    if (!r) return
    const { error: err } = await supabase
      .from('ruta_reparto_zona')
      .update({ ruta_habilitada: !r.habilitada })
      .eq('ruta_codigo', r.ruta_codigo)
      .eq('zona_territorial_codigo', zona)
    if (err) return setError(err.message)
    cargar()
  }

  async function quitar() {
    const r = rutas[sel]
    if (!r || !confirm(`¿Quitar esta zona de la ruta ${r.ruta_codigo} ${r.descripcion}?`)) return
    const { error: err } = await supabase.from('ruta_reparto_zona').delete().eq('ruta_codigo', r.ruta_codigo).eq('zona_territorial_codigo', zona)
    if (err) return setError(err.message)
    setSel(0)
    cargar()
  }

  return (
    <div className="flex min-h-[285px] flex-col gap-1">
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <GwGroup title="Rutas de Reparto a las que pertenece ésta Zona" className="flex flex-col gap-1">
          <div className="h-[215px] overflow-y-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid" title="RUTAZONA">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 100 }}>Código</th>
                  <th>Descripción</th>
                  <th style={{ width: 70 }}>Hablt.</th>
                </tr>
              </thead>
              <tbody>
                {rutas.map((r, i) => (
                  <tr key={r.ruta_codigo} className={i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)}>
                    <td>{r.ruta_codigo}</td>
                    <td className="truncate">{r.descripcion}</td>
                    <td>
                      <Tick on={r.habilitada} />
                    </td>
                  </tr>
                ))}
                <FilasVacias cols={3} ocupadas={rutas.length} total={9} />
              </tbody>
            </table>
          </div>
          <GridMiniBar
            nuevo={editing}
            modificar={editing && rutas.length > 0}
            borrar={editing && rutas.length > 0}
            buscar={rutas.length > 0}
            onNuevo={() => setElegir(true)}
            onModificar={alternar}
            onBorrar={quitar}
            onBuscar={() => setBuscar('rutas')}
          >
            <span className="text-[15px] text-[#1a4fd0]">Nº Rutas: {rutas.length}</span>
          </GridMiniBar>
        </GwGroup>
        <GwGroup title="Repartidores de la Ruta" className="flex flex-col gap-1">
          <div className="h-[215px] overflow-y-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid" title="RUTAREPA">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 100 }}>Código</th>
                  <th>Nombre</th>
                  <th style={{ width: 70 }}>Hablt.</th>
                </tr>
              </thead>
              <tbody>
                {reps.map((r, i) => (
                  <tr key={r.codigo} className={i === selRep ? 'gw-selected' : ''} onClick={() => setSelRep(i)}>
                    <td>{r.codigo}</td>
                    <td className="truncate">{r.nombre}</td>
                    <td>
                      <Tick on={r.habilitado} />
                    </td>
                  </tr>
                ))}
                <FilasVacias cols={3} ocupadas={reps.length} total={9} />
              </tbody>
            </table>
          </div>
          <GridNavBar total={reps.length} sel={selRep} onSel={setSelRep} onBuscar={() => setBuscar('reps')} />
        </GwGroup>
      </div>
      {elegir && <SelectorDialog titulo="Rutas de Reparto" tabla="ruta_reparto" campoNombre="descripcion" onPick={anadir} onClose={() => setElegir(false)} />}
      {buscar && (
        <BuscarEnFilas
          titulo={buscar === 'rutas' ? 'Localizar ruta' : 'Localizar repartidor'}
          filas={buscar === 'rutas' ? rutas.map((r) => ({ clave: r.ruta_codigo, texto: `${r.ruta_codigo} ${r.descripcion}` })) : reps.map((r) => ({ clave: r.codigo, texto: `${r.codigo} ${r.nombre}` }))}
          onPick={(i) => {
            if (buscar === 'rutas') setSel(i)
            else setSelRep(i)
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
    </div>
  )
}
