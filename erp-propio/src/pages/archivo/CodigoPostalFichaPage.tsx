import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { GwField, GwGroup, GwInput, GwSelect } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { gwBuscarPorInicio, useListaOrdenada, type GwListaOrdenadaDef } from '../../components/gw/GwListaOrdenada'
import { useNavRegistro, type NavDir } from '../../components/gw/useNavRegistro'
import { PieEstado } from '../almacen/piezas'
import type { ModoFicha } from '../almacen/useFichaMaestro'
import { PestanaPendiente } from './comun'
import { TEXTO_BAJA, bajaOReactivar } from './bajaLogica'

interface CodigoPostal {
  codigo_postal: string
  poblacion: string
  calle: string | null
  provincia_codigo: string | null
  pais_codigo: string | null
  activo: boolean
}

const VACIO: CodigoPostal = { codigo_postal: '', poblacion: '', calle: null, provincia_codigo: null, pais_codigo: 'ES', activo: true }
const BASE = '/codigos-postales'
const RPC = 'gw_lista_ordenada_archivo'

/** La clave es compuesta (código postal + población): en la ruta va como «35001|LAS PALMAS». */
const claveDe = (r: { codigo_postal: string; poblacion: string }) => `${r.codigo_postal}|${r.poblacion}`
const ruta = (clave: string) => `${BASE}/${encodeURIComponent(clave)}`

/**
 * Archivo → Códigos Postales. SIN CAPTURA de GeminisWin: hecha con el esquema (CODPOSTA) y el
 * estilo de las fichas de Archivo; ajustar cuando llegue la captura. Un mismo código postal
 * puede tener varias poblaciones, por eso la clave es el par código + población.
 */
export function CodigoPostalFichaPage() {
  const params = useParams()
  const navigate = useNavigate()
  const sub = decodeURIComponent((params['*'] ?? '').replace(/\/+$/, ''))
  const isNew = sub === 'nuevo'
  const [cpRuta, ...resto] = isNew ? [''] : sub.split('|')
  const pobRuta = resto.join('|')

  const [mode, setMode] = useState<ModoFicha>(isNew ? 'alta' : 'consulta')
  const [registro, setRegistro] = useState<CodigoPostal>(VACIO)
  const [draft, setDraft] = useState<CodigoPostal>(VACIO)
  const [loading, setLoading] = useState(true)
  const [sinRegistros, setSinRegistros] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orden, setOrden] = useState<'codigo' | 'nombre'>('codigo')
  const [buscar, setBuscar] = useState(false)
  const [provincias, setProvincias] = useState<{ codigo: string; nombre: string; pais_codigo: string }[]>([])
  const [paises, setPaises] = useState<{ codigo: string; nombre: string }[]>([])
  const listaOrd = useListaOrdenada()

  useEffect(() => {
    supabase
      .from('provincia')
      .select('codigo, nombre, pais_codigo')
      .order('nombre')
      .then(({ data }) => setProvincias((data ?? []) as typeof provincias))
    supabase
      .from('pais')
      .select('codigo, nombre')
      .order('nombre')
      .then(({ data }) => setPaises((data ?? []) as typeof paises))
  }, [])

  useEffect(() => {
    setError(null)
    if (isNew) {
      setRegistro(VACIO)
      setDraft(VACIO)
      setSinRegistros(false)
      setMode('alta')
      setLoading(false)
      return
    }
    if (!cpRuta) {
      supabase
        .from('codigo_postal')
        .select('codigo_postal, poblacion')
        .order('codigo_postal')
        .order('poblacion')
        .limit(1)
        .then(({ data }) => {
          const p = (data as CodigoPostal[] | null)?.[0]
          if (p) navigate(ruta(claveDe(p)), { replace: true })
          else {
            setSinRegistros(true)
            setMode('consulta')
            setLoading(false)
          }
        })
      return
    }
    setLoading(true)
    supabase
      .from('codigo_postal')
      .select('*')
      .eq('codigo_postal', cpRuta)
      .eq('poblacion', pobRuta)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('No se ha encontrado el registro.')
          setLoading(false)
          return
        }
        setRegistro(data as CodigoPostal)
        setDraft(data as CodigoPostal)
        setSinRegistros(false)
        setMode('consulta')
        setLoading(false)
      })
  }, [cpRuta, pobRuta, isNew, navigate])

  const porNombre = orden === 'nombre'
  const nav = useNavRegistro<{ codigo_postal: string; poblacion: string }>({
    tabla: 'codigo_postal',
    orden: porNombre ? ['poblacion', 'codigo_postal'] : ['codigo_postal', 'poblacion'],
    actual: sinRegistros || mode === 'alta' || !registro.codigo_postal ? null : porNombre ? [registro.poblacion, registro.codigo_postal] : [registro.codigo_postal, registro.poblacion],
    select: 'codigo_postal, poblacion',
  })
  const idx = nav.posicion != null ? nav.posicion - 1 : -1
  const irA = async (dir: NavDir) => {
    const r = await nav.ir(dir)
    if (r) navigate(ruta(claveDe(r)))
  }
  const goTo = (clave: string) => navigate(ruta(clave))

  const defLista = (campo: 'codigo_postal' | 'poblacion'): GwListaOrdenadaDef => ({
    fuente: 'codigo_postal',
    rpc: RPC,
    campo,
    etiqueta: campo === 'codigo_postal' ? 'Código Postal' : 'Población',
    que: 'Códigos Postales',
    columnas: [
      { key: 'codigo_postal', label: 'C. Postal', width: 90 },
      { key: 'poblacion', label: 'Población' },
      { key: 'provincia_codigo', label: 'Prov.', width: 50 },
    ],
  })
  function busqueda(campo: 'codigo_postal' | 'poblacion') {
    return {
      onBuscar: async (t: string) => {
        if (campo === 'codigo_postal') {
          const { data } = await supabase.from('codigo_postal').select('codigo_postal, poblacion').eq('codigo_postal', t).order('poblacion').limit(1)
          const p = (data as CodigoPostal[] | null)?.[0]
          return p ? goTo(claveDe(p)) : setError(`No existe el código postal ${t}`)
        }
        const fila = await gwBuscarPorInicio('codigo_postal', 'poblacion', t, RPC)
        if (fila) goTo(String(fila.codigo))
        else setError(`No existe ninguna población que empiece por «${t}»`)
      },
      onLista:
        mode === 'consulta'
          ? (texto: string | null) =>
              listaOrd.abrir(defLista(campo), { texto, ancla: registro.codigo_postal ? claveDe(registro) : null, onPick: (fl) => goTo(String(fl.codigo)) })
          : undefined,
    }
  }

  const patch = (p: Partial<CodigoPostal>) => setDraft((d) => ({ ...d, ...p }))

  /** Al escribir el código postal propone la provincia por sus dos primeras cifras (35 → Las Palmas). */
  function cambiaCp(v: string) {
    const cp = v.replace(/\D/g, '').slice(0, 5)
    const prov = cp.length >= 2 ? provincias.find((p) => p.codigo === cp.slice(0, 2)) : undefined
    patch({ codigo_postal: cp, ...(prov && !draft.provincia_codigo ? { provincia_codigo: prov.codigo, pais_codigo: prov.pais_codigo } : {}) })
  }

  async function guardar() {
    setError(null)
    const cp = draft.codigo_postal.trim()
    const pob = draft.poblacion.trim().toUpperCase()
    if (!/^\d{5}$/.test(cp)) return setError('El código postal son 5 cifras.')
    if (!pob) return setError('La población es obligatoria.')
    if (draft.provincia_codigo && cp.slice(0, 2) !== draft.provincia_codigo && draft.pais_codigo === 'ES')
      if (!confirm(`El código postal ${cp} no empieza por el de la provincia (${draft.provincia_codigo}). ¿Guardar igualmente?`)) return
    const cambiaClave = mode === 'alta' || cp !== registro.codigo_postal || pob !== registro.poblacion
    if (cambiaClave) {
      const { count } = await supabase.from('codigo_postal').select('codigo_postal', { count: 'exact', head: true }).eq('codigo_postal', cp).eq('poblacion', pob)
      if (count) return setError(`Ya existe el código postal ${cp} con la población ${pob}.`)
    }
    setSaving(true)
    const payload = { codigo_postal: cp, poblacion: pob, calle: draft.calle?.trim() || null, provincia_codigo: draft.provincia_codigo, pais_codigo: draft.pais_codigo, activo: draft.activo }
    const res =
      mode === 'alta'
        ? await supabase.from('codigo_postal').insert(payload)
        : await supabase.from('codigo_postal').update(payload).eq('codigo_postal', registro.codigo_postal).eq('poblacion', registro.poblacion)
    setSaving(false)
    if (res.error) return setError(res.error.code === '23505' ? `Ya existe el código postal ${cp} con la población ${pob}.` : res.error.message)
    nav.refrescar()
    if (cambiaClave) return navigate(ruta(claveDe(payload)), { replace: true })
    setRegistro(payload)
    setDraft(payload)
    setMode('consulta')
  }

  function cancelar() {
    if (mode === 'alta') return navigate(BASE)
    setDraft(registro)
    setError(null)
    setMode('consulta')
  }

  async function baja() {
    if (sinRegistros || !registro.codigo_postal) return
    const r = await bajaOReactivar({
      tabla: 'codigo_postal',
      clave: { codigo_postal: registro.codigo_postal, poblacion: registro.poblacion },
      activo: registro.activo,
      descripcion: `el código postal ${registro.codigo_postal} ${registro.poblacion}`,
    })
    if (r === true) return
    if (r) return setError(r)
    const nuevo = { ...registro, activo: !registro.activo }
    setRegistro(nuevo)
    setDraft(nuevo)
  }

  if (loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const editing = mode !== 'consulta'
  const ro = !editing
  const d = draft

  return (
    <div className="flex max-w-[900px] flex-col gap-1">
      <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3">
        <GwField label="Código Postal">
          <GwCampoBusqueda value={d.codigo_postal} editable={editing} title="CODPOSTAL" maxLength={5} onChange={cambiaCp} {...busqueda('codigo_postal')} />
        </GwField>
        <GwField label="Población">
          <GwCampoBusqueda value={d.poblacion} editable={editing} title="POBLACION" maxLength={60} onChange={(v) => patch({ poblacion: v.toUpperCase() })} {...busqueda('poblacion')} />
        </GwField>
      </div>
      {(error || (!registro.activo && !sinRegistros && mode !== 'alta')) && <div className="text-[13px] text-[#c42b1c]">{error ?? TEXTO_BAJA}</div>}

      {sinRegistros ? (
        <PestanaPendiente texto="No hay ningún código postal. Pulsa Nuevo para dar de alta el primero." alto={130} />
      ) : (
        <GwGroup className="grid grid-cols-[minmax(0,1fr)_220px_200px] gap-x-3 gap-y-1">
          <GwField label="Calle / Zona (opcional)">
            <GwInput value={d.calle ?? ''} disabled={ro} title="CALLE" onChange={(e) => patch({ calle: e.target.value || null })} />
          </GwField>
          <GwField label="Provincia">
            <GwSelect
              value={d.provincia_codigo ?? ''}
              disabled={ro}
              title="PROVINCIA"
              onChange={(e) => {
                const p = provincias.find((x) => x.codigo === e.target.value)
                patch({ provincia_codigo: e.target.value || null, ...(p ? { pais_codigo: p.pais_codigo } : {}) })
              }}
            >
              <option value="" />
              {provincias.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.codigo} — {p.nombre}
                </option>
              ))}
            </GwSelect>
          </GwField>
          <GwField label="País">
            <GwSelect value={d.pais_codigo ?? ''} disabled={ro} title="PAIS" onChange={(e) => patch({ pais_codigo: e.target.value || null })}>
              <option value="" />
              {paises.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nombre}
                </option>
              ))}
            </GwSelect>
          </GwField>
        </GwGroup>
      )}

      <GwRecordBar
        mode={mode}
        canNavigate={mode === 'consulta' && !sinRegistros}
        saving={saving}
        onFirst={() => irA('primero')}
        onPrev={() => irA('anterior')}
        onNext={() => irA('siguiente')}
        onLast={() => irA('ultimo')}
        onSort={() => setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={() => navigate(`${BASE}/nuevo`)}
        onEdit={() => !sinRegistros && setMode('edicion')}
        onDelete={baja}
        onSave={guardar}
        onCancel={cancelar}
        onExit={() => navigate('/')}
      />
      <PieEstado orden={orden} idx={idx} total={nav.total ?? 0} mode={mode} que="código postal" porNombre="por población" />

      {buscar && (
        <GwLookupDialog<CodigoPostal & Record<string, unknown>>
          title="Buscar Código Postal"
          table="codigo_postal"
          columns={[
            { key: 'codigo_postal', label: 'C. Postal', width: 90 },
            { key: 'poblacion', label: 'Población' },
            { key: 'provincia_codigo', label: 'Prov.', width: 60 },
          ]}
          searchColumns={['codigo_postal', 'poblacion', 'calle']}
          orderBy={orden === 'codigo' ? 'codigo_postal' : 'poblacion'}
          keyColumn="codigo_postal"
          onPick={(r) => {
            setBuscar(false)
            goTo(claveDe(r))
          }}
          onClose={() => setBuscar(false)}
        />
      )}
      {listaOrd.dialogo}
    </div>
  )
}
