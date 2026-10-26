import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwNumber, GwSelect, GwTabs, type GwTabDef } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { BancosEntidad } from './bancos'
import {
  BarraFicha,
  BotonCasilla,
  BuscarEnFilas,
  FilasVacias,
  GridMiniBar,
  GridNavBar,
  ObsImagen,
  SelectorDialog,
  Tick,
  useFicha,
} from './common'

export interface Repartidor {
  codigo: string
  nombre: string
  nombre_corto: string | null
  direccion: string | null
  codigo_postal: string | null
  poblacion: string | null
  provincia_codigo: string | null
  pais_codigo: string | null
  telefono_fijo: string | null
  telefono_movil: string | null
  fax: string | null
  email: string | null
  web: string | null
  comision_defecto_pct: number | null
  comision_oferta_pct: number | null
  compensa_beneficio: boolean
  deshabilitado: boolean
  observaciones: string | null
  imagen_url: string | null
  imagen_modo: number
  fecha_alta: string | null
  fecha_baja: string | null
  actualizado_en?: string
  [k: string]: unknown
}

const VACIO: Repartidor = {
  codigo: '',
  nombre: '',
  nombre_corto: null,
  direccion: null,
  codigo_postal: null,
  poblacion: null,
  provincia_codigo: null,
  pais_codigo: null,
  telefono_fijo: null,
  telefono_movil: null,
  fax: null,
  email: null,
  web: null,
  comision_defecto_pct: null,
  comision_oferta_pct: null,
  compensa_beneficio: false,
  deshabilitado: false,
  observaciones: null,
  imagen_url: null,
  imagen_modo: 1,
  fecha_alta: null,
  fecha_baja: null,
}

const TABS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'rutas', label: 'Rutas de Reparto' },
    { key: 'comisiones', label: 'Comisiones' },
    { key: 'bancos', label: 'Bancos' },
    { key: 'obs', label: 'Observaciones e Imagen' },
  ],
]
const SATELITES = new Set(['rutas', 'bancos'])

export function RepartidorFichaPage() {
  const f = useFicha<Repartidor>({ tabla: 'repartidor', ruta: '/repartidores', vacio: VACIO, digitos: 3, campoNombre: 'nombre' })
  const [tab, setTab] = useState('generales')
  const ro = !f.editing
  const d = f.draft

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>

  const bloqueado = f.mode === 'alta' || f.vacia
  const aviso = (c: React.ReactNode) =>
    bloqueado ? (
      <div className="p-3 text-[13px]">
        {f.vacia ? 'No hay ningún repartidor. Pulsa Nuevo para dar de alta el primero.' : 'Acepta el alta del repartidor para poder rellenar esta pestaña.'}
      </div>
    ) : (
      c
    )

  async function baja() {
    if (f.vacia || !f.registro.codigo) return
    if (!confirm(`¿Dar de baja el repartidor ${f.registro.codigo} ${f.registro.nombre}? Queda deshabilitado, no se borra.`)) return
    const hoyStr = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('repartidor').update({ deshabilitado: true, fecha_baja: hoyStr }).eq('codigo', f.registro.codigo)
    if (error) return f.setError(error.message)
    f.setRegistro((r) => ({ ...r, deshabilitado: true, fecha_baja: hoyStr }))
    f.setDraft((r) => ({ ...r, deshabilitado: true, fecha_baja: hoyStr }))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[80px_minmax(0,500px)_145px_minmax(0,1fr)_180px] items-end gap-x-1.5">
        <GwField label="Código">
          <GwInput value={d.codigo} disabled={f.mode !== 'alta'} title="CODIGO" onChange={(e) => f.patch({ codigo: e.target.value })} />
        </GwField>
        <GwField label="Nombre">
          <GwInput value={d.nombre} disabled={ro} title="NOMBRE" onChange={(e) => f.patch({ nombre: e.target.value })} />
        </GwField>
        <GwField label="Nomb. corto">
          <GwInput value={d.nombre_corto ?? ''} disabled={ro} title="NOMBCORTO" onChange={(e) => f.patch({ nombre_corto: e.target.value || null })} />
        </GwField>
        <span />
        <BotonCasilla
          label={
            <>
              Reparto
              <br />
              Deshabilitado
            </>
          }
          checked={d.deshabilitado}
          disabled={ro}
          title="Reparto deshabilitado"
          className="h-[42px]"
          onChange={(v) => f.patch({ deshabilitado: v })}
        />
      </div>
      {(f.error || (d.fecha_baja && f.mode !== 'alta')) && (
        <div className="text-[13px] text-[#c42b1c]">{f.error ?? 'Repartidor dado de baja.'}</div>
      )}

      <div className="mt-1">
        <GwTabs rows={TABS} active={tab} onChange={setTab}>
          {f.vacia && !SATELITES.has(tab) ? (
            <div className="p-3 text-[13px]">No hay ningún repartidor. Pulsa Nuevo para dar de alta el primero.</div>
          ) : (
            <>
              {tab === 'generales' && <DatosGenerales r={d} ro={ro} onChange={f.patch} />}
              {tab === 'rutas' && aviso(<RutasRepartidor codigo={f.registro.codigo} editing={f.mode === 'edicion'} />)}
              {tab === 'comisiones' && <Comisiones r={d} ro={ro} codigo={f.registro.codigo} alta={f.mode === 'alta'} onChange={f.patch} />}
              {tab === 'bancos' && aviso(<BancosEntidad tipoEntidad="repartidor" codigo={f.registro.codigo} editing={f.mode === 'edicion'} />)}
              {tab === 'obs' && (
                <ObsImagen
                  nombre="repartidor"
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
        ruta="/repartidores"
        tabla="repartidor"
        titulo="Buscar Repartidor"
        columnas={[
          { key: 'codigo', label: 'Código', width: 80 },
          { key: 'nombre', label: 'Nombre' },
          { key: 'nombre_corto', label: 'Nomb. corto', width: 130 },
          { key: 'poblacion', label: 'Población', width: 150 },
        ]}
        buscarEn={['codigo', 'nombre', 'nombre_corto', 'poblacion']}
        onDelete={baja}
      />
    </div>
  )
}

interface Opcion {
  codigo: string
  nombre: string
}

function DatosGenerales({ r, ro, onChange }: { r: Repartidor; ro: boolean; onChange: (p: Partial<Repartidor>) => void }) {
  const [provincias, setProvincias] = useState<Opcion[]>([])
  const [paises, setPaises] = useState<Opcion[]>([])
  const [buscarCp, setBuscarCp] = useState(false)
  const [buscar, setBuscar] = useState<'provincia' | 'pais' | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('provincia').select('codigo, nombre').order('nombre'),
      supabase.from('pais').select('codigo, nombre').order('nombre'),
    ]).then(([pr, pa]) => {
      setProvincias((pr.data ?? []) as Opcion[])
      setPaises((pa.data ?? []) as Opcion[])
    })
  }, [])

  const txt = (key: keyof Repartidor, title: string) => (
    <GwInput
      value={(r[key] ?? '') as string}
      disabled={ro}
      title={title}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Repartidor>)}
    />
  )
  const opciones = (lista: Opcion[], actual: string | null) => (
    <>
      <option value="">—</option>
      {lista.map((o) => (
        <option key={o.codigo} value={o.codigo}>
          {o.nombre}
        </option>
      ))}
      {actual && !lista.some((o) => o.codigo === actual) && <option value={actual}>{actual}</option>}
    </>
  )

  return (
    <div className="min-h-[260px]">
      <GwGroup className="mt-1 flex flex-col gap-1">
        <div className="grid grid-cols-[190px_minmax(0,1fr)] gap-x-2">
          <GwField label="Cod. Postal">
            <span className="flex">
              {txt('codigo_postal', 'CODPOSTAL')}
              <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar código postal" />
            </span>
          </GwField>
          <GwField label="Dirección">
            <span className="flex">
              {txt('direccion', 'DIRECCION')}
              <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar calle" />
            </span>
          </GwField>
        </div>
        <div className="grid grid-cols-[minmax(0,460px)_minmax(0,360px)_minmax(0,1fr)] gap-x-2">
          <GwField label="Población">
            <span className="flex">
              {txt('poblacion', 'POBLACION')}
              <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar población" />
            </span>
          </GwField>
          <GwField label="Província">
            <span className="flex">
              <GwSelect value={r.provincia_codigo ?? ''} disabled={ro} title="PROVINCIA" onChange={(e) => onChange({ provincia_codigo: e.target.value || null })}>
                {opciones(provincias, r.provincia_codigo)}
              </GwSelect>
              <GwLookupButton disabled={ro} onClick={() => setBuscar('provincia')} title="Buscar provincia" />
            </span>
          </GwField>
          <GwField label="País">
            <span className="flex">
              <GwSelect value={r.pais_codigo ?? ''} disabled={ro} title="PAIS" onChange={(e) => onChange({ pais_codigo: e.target.value || null })}>
                {opciones(paises, r.pais_codigo)}
              </GwSelect>
              <GwLookupButton disabled={ro} onClick={() => setBuscar('pais')} title="Buscar país" />
            </span>
          </GwField>
        </div>
        <GwGroup title="Teléfonos" className="mr-[90px] flex items-center gap-3">
          <GwInline label="Tlf. Fijo:" className="flex-1">
            {txt('telefono_fijo', 'TELEFONO')}
          </GwInline>
          <GwInline label="Tlf. Móvil:" className="flex-1">
            {txt('telefono_movil', 'MOVIL')}
          </GwInline>
          <GwInline label="Fax:" className="flex-1">
            {txt('fax', 'FAX')}
          </GwInline>
        </GwGroup>
        <div className="grid grid-cols-2 gap-x-2">
          <GwField label="Dirección E-mail (Correo Electrónico)">{txt('email', 'EMAIL')}</GwField>
          <GwField label="Dirección Web (URL)">{txt('web', 'WEB')}</GwField>
        </div>
      </GwGroup>

      {buscar && (
        <GwLookupDialog<Opcion & Record<string, unknown>>
          title={buscar === 'provincia' ? 'Provincias' : 'Países'}
          table={buscar}
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="nombre"
          keyColumn="codigo"
          onPick={(o) => {
            onChange(buscar === 'provincia' ? { provincia_codigo: o.codigo } : { pais_codigo: o.codigo })
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {buscarCp && (
        <GwLookupDialog<{ codigo_postal: string; poblacion: string; calle: string | null; provincia_codigo: string | null; pais_codigo: string | null }>
          title="Códigos Postales"
          table="codigo_postal"
          columns={[
            { key: 'codigo_postal', label: 'C. Postal', width: 80 },
            { key: 'poblacion', label: 'Población' },
            { key: 'calle', label: 'Calle' },
            { key: 'provincia_codigo', label: 'Prov.', width: 60 },
          ]}
          searchColumns={['codigo_postal', 'poblacion', 'calle']}
          orderBy="codigo_postal"
          keyColumn="codigo_postal"
          onPick={(cp) => {
            onChange({
              codigo_postal: cp.codigo_postal,
              poblacion: cp.poblacion,
              provincia_codigo: cp.provincia_codigo ?? r.provincia_codigo,
              pais_codigo: cp.pais_codigo ?? r.pais_codigo,
            })
            setBuscarCp(false)
          }}
          onClose={() => setBuscarCp(false)}
        />
      )}
    </div>
  )
}

interface RutaLinea {
  ruta_codigo: string
  descripcion: string
  habilitada: boolean
}
interface ZonaLinea {
  codigo: string
  descripcion: string
  orden: number | null
}

/** Pestaña «Rutas de Reparto»: rutas del repartidor (RUTAREPA) y zonas de la ruta elegida (RUTAZONA). */
function RutasRepartidor({ codigo, editing }: { codigo: string; editing: boolean }) {
  const [rutas, setRutas] = useState<RutaLinea[]>([])
  const [sel, setSel] = useState(0)
  const [zonas, setZonas] = useState<ZonaLinea[]>([])
  const [selZona, setSelZona] = useState(0)
  const [elegir, setElegir] = useState(false)
  const [buscar, setBuscar] = useState<'rutas' | 'zonas' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    const { data } = await supabase
      .from('ruta_reparto_repartidor')
      .select('ruta_codigo, ruta_habilitada, ruta:ruta_codigo(descripcion)')
      .eq('repartidor_codigo', codigo)
      .order('ruta_codigo')
    setRutas(
      ((data ?? []) as unknown as { ruta_codigo: string; ruta_habilitada: boolean; ruta: { descripcion: string } | null }[]).map((r) => ({
        ruta_codigo: r.ruta_codigo,
        descripcion: r.ruta?.descripcion ?? '',
        habilitada: r.ruta_habilitada,
      })),
    )
  }

  useEffect(() => {
    cargar()
    setSel(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo])

  const rutaSel = rutas[sel]?.ruta_codigo
  useEffect(() => {
    if (!rutaSel) return setZonas([])
    supabase
      .from('ruta_reparto_zona')
      .select('zona_territorial_codigo, orden, zona:zona_territorial_codigo(descripcion)')
      .eq('ruta_codigo', rutaSel)
      .order('orden', { nullsFirst: false })
      .order('zona_territorial_codigo')
      .then(({ data }) => {
        setZonas(
          ((data ?? []) as unknown as { zona_territorial_codigo: string; orden: number | null; zona: { descripcion: string } | null }[]).map((z) => ({
            codigo: z.zona_territorial_codigo,
            descripcion: z.zona?.descripcion ?? '',
            orden: z.orden,
          })),
        )
        setSelZona(0)
      })
  }, [rutaSel])

  async function anadir(ruta: string) {
    setElegir(false)
    setError(null)
    if (rutas.some((r) => r.ruta_codigo === ruta)) return setError(`La ruta ${ruta} ya está asignada a este repartidor.`)
    const { error: err } = await supabase.from('ruta_reparto_repartidor').insert({ ruta_codigo: ruta, repartidor_codigo: codigo })
    if (err) return setError(err.message)
    await cargar()
  }

  async function alternar() {
    const r = rutas[sel]
    if (!r) return
    const { error: err } = await supabase
      .from('ruta_reparto_repartidor')
      .update({ ruta_habilitada: !r.habilitada })
      .eq('ruta_codigo', r.ruta_codigo)
      .eq('repartidor_codigo', codigo)
    if (err) return setError(err.message)
    cargar()
  }

  async function quitar() {
    const r = rutas[sel]
    if (!r || !confirm(`¿Quitar la ruta ${r.ruta_codigo} ${r.descripcion} de este repartidor?`)) return
    const { error: err } = await supabase.from('ruta_reparto_repartidor').delete().eq('ruta_codigo', r.ruta_codigo).eq('repartidor_codigo', codigo)
    if (err) return setError(err.message)
    setSel(0)
    cargar()
  }

  return (
    <div className="flex min-h-[285px] flex-col gap-1">
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <GwGroup title="Rutas de Reparto" className="flex flex-col gap-1">
          <div className="h-[215px] overflow-y-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid" title="RUTAREPA">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 100 }}>Código</th>
                  <th>Descripción</th>
                  <th style={{ width: 70 }}>Habilt.</th>
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
        <GwGroup title="Zonas Territoriales de la Ruta" className="flex flex-col gap-1">
          <div className="h-[215px] overflow-y-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid" title="RUTAZONA">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 100 }}>Código</th>
                  <th>Descripción</th>
                  <th style={{ width: 75 }} className="text-right!">
                    Nº Ord.
                  </th>
                </tr>
              </thead>
              <tbody>
                {zonas.map((z, i) => (
                  <tr key={z.codigo} className={i === selZona ? 'gw-selected' : ''} onClick={() => setSelZona(i)}>
                    <td>{z.codigo}</td>
                    <td className="truncate">{z.descripcion}</td>
                    <td className="text-right">{z.orden ?? 0}</td>
                  </tr>
                ))}
                <FilasVacias cols={3} ocupadas={zonas.length} total={9} />
              </tbody>
            </table>
          </div>
          <GridNavBar total={zonas.length} sel={selZona} onSel={setSelZona} onBuscar={() => setBuscar('zonas')} />
        </GwGroup>
      </div>
      {elegir && <SelectorDialog titulo="Rutas de Reparto" tabla="ruta_reparto" campoNombre="descripcion" onPick={anadir} onClose={() => setElegir(false)} />}
      {buscar && (
        <BuscarEnFilas
          titulo={buscar === 'rutas' ? 'Localizar ruta' : 'Localizar zona'}
          filas={(buscar === 'rutas' ? rutas.map((r) => ({ clave: r.ruta_codigo, texto: `${r.ruta_codigo} ${r.descripcion}` })) : zonas.map((z) => ({ clave: z.codigo, texto: `${z.codigo} ${z.descripcion}` })))}
          onPick={(i) => {
            if (buscar === 'rutas') setSel(i)
            else setSelZona(i)
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
    </div>
  )
}

const NIVELES: { nivel: number; label: string }[] = [
  { nivel: 0, label: 'General:' },
  { nivel: 1, label: 'MAYOR  M-1:' },
  { nivel: 2, label: 'MAYOR  M-2:' },
  { nivel: 3, label: 'MAYOR  M-3:' },
  { nivel: 4, label: 'Tarifa Dcto -4:' },
  { nivel: 5, label: 'Tarifa Dcto -5:' },
  { nivel: 6, label: 'Tarifa Dcto -6:' },
]

/**
 * Pestaña «Comisiones»: % por tarifa aplicada al artículo (REPARTIDOR.COMISION0..6) y de oferta.
 * En GeminisWin las comisiones de repartidores existen en la ficha pero no se calculan.
 */
function Comisiones({
  r,
  ro,
  codigo,
  alta,
  onChange,
}: {
  r: Repartidor
  ro: boolean
  codigo: string
  alta: boolean
  onChange: (p: Partial<Repartidor>) => void
}) {
  const [niveles, setNiveles] = useState<Record<number, number | null>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!codigo || alta) return setNiveles({})
    supabase
      .from('repartidor_comision_nivel')
      .select('nivel, comision_pct')
      .eq('repartidor_codigo', codigo)
      .then(({ data }) => setNiveles(Object.fromEntries(((data ?? []) as { nivel: number; comision_pct: number | null }[]).map((n) => [n.nivel, n.comision_pct]))))
  }, [codigo, alta])

  async function guardarNivel(nivel: number, v: number | null) {
    setError(null)
    setNiveles((n) => ({ ...n, [nivel]: v }))
    const { error: err } = await supabase
      .from('repartidor_comision_nivel')
      .upsert({ repartidor_codigo: codigo, nivel, comision_pct: v }, { onConflict: 'repartidor_codigo,nivel' })
    if (err) setError(err.message)
  }

  const celda = (label: string, input: React.ReactNode) => (
    <div className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-2">
      <span className="gw-label text-right text-[14px]">{label}</span>
      {input}
    </div>
  )

  const nivelInput = (n: number) => (
    <GwNumber value={niveles[n] ?? null} decimals={2} disabled={ro || alta} onChange={(v) => guardarNivel(n, v)} />
  )

  return (
    <div className="min-h-[260px]">
      {error && <div className="mb-1 border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <GwGroup title="Comisiones según tarifa aplicada al artículo" className="flex flex-col gap-2">
        <div className="grid grid-cols-4 gap-x-6 gap-y-2" title="COMISION0..6">
          {celda('Precio de Oferta:', <GwNumber value={r.comision_oferta_pct} decimals={2} disabled={ro} onChange={(v) => onChange({ comision_oferta_pct: v })} />)}
          {celda(NIVELES[1].label, nivelInput(1))}
          {celda(NIVELES[3].label, nivelInput(3))}
          {celda(NIVELES[5].label, nivelInput(5))}
          {celda(NIVELES[0].label, nivelInput(0))}
          {celda(NIVELES[2].label, nivelInput(2))}
          {celda(NIVELES[4].label, nivelInput(4))}
          {celda(NIVELES[6].label, nivelInput(6))}
        </div>
        <GwCheck
          label="Aplicar el % de las comisiones sobre el Beneficio"
          checked={r.compensa_beneficio}
          disabled={ro}
          onChange={(v) => onChange({ compensa_beneficio: v })}
        />
      </GwGroup>
      {alta && <div className="mt-1 text-[13px]">Acepta el alta del repartidor para poder poner las comisiones por tarifa.</div>}
    </div>
  )
}
