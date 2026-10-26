import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwGroup, GwInput, GwNumber, GwTabs, type GwTabDef } from '../../../components/gw'
import { BarraFicha, BotonCasilla, BuscarEnFilas, FilasVacias, GridMiniBar, ObsImagen, RejillaClientes, SelectorDialog, Tick, useFicha } from './common'

export interface RutaReparto {
  codigo: string
  descripcion: string
  deshabilitada: boolean
  observaciones: string | null
  imagen_url: string | null
  imagen_modo: number
  actualizado_en?: string
  [k: string]: unknown
}

const VACIO: RutaReparto = { codigo: '', descripcion: '', deshabilitada: false, observaciones: null, imagen_url: null, imagen_modo: 1 }

const TABS: GwTabDef[][] = [
  [
    { key: 'rutas', label: 'Rutas y Repartidores' },
    { key: 'clientes', label: 'Clientes asignados directamente a ésta Ruta' },
    { key: 'obs', label: 'Observaciones e Imagen' },
  ],
]
const SATELITES = new Set(['rutas', 'clientes'])

export function RutaFichaPage() {
  const f = useFicha<RutaReparto>({ tabla: 'ruta_reparto', ruta: '/rutas-reparto', vacio: VACIO, digitos: 2, campoNombre: 'descripcion' })
  const [tab, setTab] = useState('rutas')
  const ro = !f.editing
  const d = f.draft

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>

  const bloqueado = f.mode === 'alta' || f.vacia
  const aviso = (c: React.ReactNode) =>
    bloqueado ? (
      <div className="min-h-[285px] p-3 text-[13px]">
        {f.vacia ? 'No hay ninguna ruta de reparto. Pulsa Nuevo para dar de alta la primera.' : 'Acepta el alta de la ruta para poder rellenar esta pestaña.'}
      </div>
    ) : (
      c
    )

  async function borrar() {
    if (f.vacia || !f.registro.codigo) return
    if (!confirm(`¿Eliminar la ruta de reparto ${f.registro.codigo} ${f.registro.descripcion}?`)) return
    const { error } = await supabase.from('ruta_reparto').delete().eq('codigo', f.registro.codigo)
    if (error) {
      f.setError(error.code === '23503' ? 'No se puede eliminar: la ruta está usada en repartos, pedidos o ventas. Márcala como «Reparto Deshabilitado».' : error.message)
      return
    }
    f.setLista((l) => l.filter((x) => x.codigo !== f.registro.codigo))
    f.navigate('/rutas-reparto', { replace: true })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[95px_minmax(0,520px)_minmax(0,1fr)_270px] items-end gap-x-2">
        <GwField label="Código">
          <GwInput value={d.codigo} disabled={f.mode !== 'alta'} title="RUTAS.CODIGO" onChange={(e) => f.patch({ codigo: e.target.value })} />
        </GwField>
        <GwField label="Descripción">
          <GwInput value={d.descripcion} disabled={ro} title="DESCRIP" onChange={(e) => f.patch({ descripcion: e.target.value })} />
        </GwField>
        <span />
        <BotonCasilla
          label="Reparto Deshabilitado"
          checked={d.deshabilitada}
          disabled={ro}
          title="Reparto deshabilitado"
          className="h-[34px] justify-center"
          onChange={(v) => f.patch({ deshabilitada: v })}
        />
      </div>
      {f.error && <div className="text-[13px] text-[#c42b1c]">{f.error}</div>}

      <div className="mt-1">
        <GwTabs rows={TABS} active={tab} onChange={setTab}>
          {f.vacia && !SATELITES.has(tab) ? (
            <div className="min-h-[285px] p-3 text-[13px]">No hay ninguna ruta de reparto. Pulsa Nuevo para dar de alta la primera.</div>
          ) : (
            <>
              {tab === 'rutas' && aviso(<ZonasYRepartidores ruta={f.registro.codigo} editing={f.mode === 'edicion'} />)}
              {tab === 'clientes' && aviso(<RejillaClientes filtro="ruta_codigo" valor={f.registro.codigo} />)}
              {tab === 'obs' && (
                <ObsImagen
                  nombre="ruta"
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
        ruta="/rutas-reparto"
        tabla="ruta_reparto"
        titulo="Buscar Ruta de Reparto"
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

interface ZonaRuta {
  codigo: string
  descripcion: string
  orden: number | null
}
interface RepartidorRuta {
  codigo: string
  nombre: string
  habilitado: boolean
}

/** «Rutas y Repartidores»: zonas de la ruta con su orden (RUTAZONA) y repartidores de la ruta (RUTAREPA). */
function ZonasYRepartidores({ ruta, editing }: { ruta: string; editing: boolean }) {
  const [zonas, setZonas] = useState<ZonaRuta[]>([])
  const [selZona, setSelZona] = useState(0)
  const [editOrden, setEditOrden] = useState<string | null>(null)
  const [reps, setReps] = useState<RepartidorRuta[]>([])
  const [selRep, setSelRep] = useState(0)
  const [elegir, setElegir] = useState<'zona' | 'rep' | null>(null)
  const [buscar, setBuscar] = useState<'zonas' | 'reps' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargarZonas() {
    const { data } = await supabase
      .from('ruta_reparto_zona')
      .select('zona_territorial_codigo, orden, zona:zona_territorial_codigo(descripcion)')
      .eq('ruta_codigo', ruta)
      .order('orden', { nullsFirst: false })
      .order('zona_territorial_codigo')
    setZonas(
      ((data ?? []) as unknown as { zona_territorial_codigo: string; orden: number | null; zona: { descripcion: string } | null }[]).map((z) => ({
        codigo: z.zona_territorial_codigo,
        descripcion: z.zona?.descripcion ?? '',
        orden: z.orden,
      })),
    )
  }

  async function cargarReps() {
    const { data } = await supabase
      .from('ruta_reparto_repartidor')
      .select('repartidor_codigo, repartidor_habilitado, repartidor:repartidor_codigo(nombre)')
      .eq('ruta_codigo', ruta)
      .order('repartidor_codigo')
    setReps(
      ((data ?? []) as unknown as { repartidor_codigo: string; repartidor_habilitado: boolean; repartidor: { nombre: string } | null }[]).map((r) => ({
        codigo: r.repartidor_codigo,
        nombre: r.repartidor?.nombre ?? '',
        habilitado: r.repartidor_habilitado,
      })),
    )
  }

  useEffect(() => {
    cargarZonas()
    cargarReps()
    setSelZona(0)
    setSelRep(0)
    setEditOrden(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta])

  async function anadirZona(zona: string) {
    setElegir(null)
    setError(null)
    if (zonas.some((z) => z.codigo === zona)) return setError(`La zona ${zona} ya está en esta ruta.`)
    const orden = zonas.reduce((m, z) => Math.max(m, z.orden ?? 0), 0) + 1
    const { error: err } = await supabase.from('ruta_reparto_zona').insert({ ruta_codigo: ruta, zona_territorial_codigo: zona, orden })
    if (err) return setError(err.message)
    cargarZonas()
  }

  async function guardarOrden(zona: string, orden: number | null) {
    setEditOrden(null)
    const { error: err } = await supabase.from('ruta_reparto_zona').update({ orden }).eq('ruta_codigo', ruta).eq('zona_territorial_codigo', zona)
    if (err) return setError(err.message)
    cargarZonas()
  }

  async function quitarZona() {
    const z = zonas[selZona]
    if (!z || !confirm(`¿Quitar la zona ${z.codigo} ${z.descripcion} de esta ruta?`)) return
    const { error: err } = await supabase.from('ruta_reparto_zona').delete().eq('ruta_codigo', ruta).eq('zona_territorial_codigo', z.codigo)
    if (err) return setError(err.message)
    setSelZona(0)
    cargarZonas()
  }

  async function anadirRep(rep: string) {
    setElegir(null)
    setError(null)
    if (reps.some((r) => r.codigo === rep)) return setError(`El repartidor ${rep} ya está en esta ruta.`)
    const { error: err } = await supabase.from('ruta_reparto_repartidor').insert({ ruta_codigo: ruta, repartidor_codigo: rep })
    if (err) return setError(err.message)
    cargarReps()
  }

  async function alternarRep() {
    const r = reps[selRep]
    if (!r) return
    const { error: err } = await supabase
      .from('ruta_reparto_repartidor')
      .update({ repartidor_habilitado: !r.habilitado })
      .eq('ruta_codigo', ruta)
      .eq('repartidor_codigo', r.codigo)
    if (err) return setError(err.message)
    cargarReps()
  }

  async function quitarRep() {
    const r = reps[selRep]
    if (!r || !confirm(`¿Quitar al repartidor ${r.codigo} ${r.nombre} de esta ruta?`)) return
    const { error: err } = await supabase.from('ruta_reparto_repartidor').delete().eq('ruta_codigo', ruta).eq('repartidor_codigo', r.codigo)
    if (err) return setError(err.message)
    setSelRep(0)
    cargarReps()
  }

  return (
    <div className="flex min-h-[285px] flex-col gap-1">
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <GwGroup title="Zonas Territoriales de ésta Ruta" className="flex flex-col gap-1">
          <div className="h-[215px] overflow-y-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid" title="RUTAZONA">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 125 }}>Código</th>
                  <th>Descripción</th>
                  <th style={{ width: 80 }}>Nº Ord.</th>
                </tr>
              </thead>
              <tbody>
                {zonas.map((z, i) => (
                  <tr key={z.codigo} className={i === selZona && editOrden !== z.codigo ? 'gw-selected' : ''} onClick={() => setSelZona(i)}>
                    <td>{z.codigo}</td>
                    <td className="truncate">{z.descripcion}</td>
                    <td className="text-right">
                      {editOrden === z.codigo ? <GwNumber value={z.orden} decimals={0} onChange={(v) => guardarOrden(z.codigo, v)} /> : z.orden ?? 0}
                    </td>
                  </tr>
                ))}
                <FilasVacias cols={3} ocupadas={zonas.length} total={9} />
              </tbody>
            </table>
          </div>
          <GridMiniBar
            nuevo={editing}
            modificar={editing && zonas.length > 0}
            borrar={editing && zonas.length > 0}
            buscar={zonas.length > 0}
            onNuevo={() => setElegir('zona')}
            onModificar={() => zonas[selZona] && setEditOrden(zonas[selZona].codigo)}
            onBorrar={quitarZona}
            onBuscar={() => setBuscar('zonas')}
          >
            <span className="text-[15px] text-[#1a4fd0]">Nº Zonas: {zonas.length}</span>
          </GridMiniBar>
        </GwGroup>
        <GwGroup title="Repartidores de ésta Ruta" className="flex flex-col gap-1">
          <div className="h-[215px] overflow-y-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid" title="RUTAREPA">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 100 }}>Código</th>
                  <th>Nombre</th>
                  <th style={{ width: 70 }}>Habilt.</th>
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
          <GridMiniBar
            nuevo={editing}
            modificar={editing && reps.length > 0}
            borrar={editing && reps.length > 0}
            buscar={reps.length > 0}
            onNuevo={() => setElegir('rep')}
            onModificar={alternarRep}
            onBorrar={quitarRep}
            onBuscar={() => setBuscar('reps')}
          >
            <span className="text-[15px] text-[#1a4fd0]">Nº Repartidores: {reps.length}</span>
          </GridMiniBar>
        </GwGroup>
      </div>
      {elegir === 'zona' && (
        <SelectorDialog titulo="Zonas Territoriales" tabla="zona_territorial" campoNombre="descripcion" onPick={anadirZona} onClose={() => setElegir(null)} />
      )}
      {elegir === 'rep' && <SelectorDialog titulo="Repartidores" tabla="repartidor" campoNombre="nombre" onPick={anadirRep} onClose={() => setElegir(null)} />}
      {buscar && (
        <BuscarEnFilas
          titulo={buscar === 'zonas' ? 'Localizar zona' : 'Localizar repartidor'}
          filas={buscar === 'zonas' ? zonas.map((z) => ({ clave: z.codigo, texto: `${z.codigo} ${z.descripcion}` })) : reps.map((r) => ({ clave: r.codigo, texto: `${r.codigo} ${r.nombre}` }))}
          onPick={(i) => {
            if (buscar === 'zonas') setSelZona(i)
            else setSelRep(i)
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
    </div>
  )
}
