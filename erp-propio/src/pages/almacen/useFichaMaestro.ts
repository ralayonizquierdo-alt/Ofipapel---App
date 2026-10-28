import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { selectTodo, supabase } from '../../lib/supabase'
import { gwBuscarPorInicio, useListaOrdenada, type GwListaOrdenadaDef } from '../../components/gw/GwListaOrdenada'
import { useNavRegistro, type NavDir } from '../../components/gw/useNavRegistro'

export type ModoFicha = 'consulta' | 'edicion' | 'alta'

interface Fila {
  codigo: string
  nombre: string
}

/**
 * Comportamiento común de las fichas de maestros de Almacén (como GeminisWin): la ruta
 * sin código abre el primer registro, /nuevo da de alta, se navega por código o por
 * descripción y se guarda con Aceptar. La ruta lleva comodín: /familias/*, /marcas/*…
 */
export function useFichaMaestro<T extends { codigo: string }>({
  tabla,
  base,
  vacio,
  campoNombre,
  sinColumnas = ['actualizado_en'],
  que = 'el registro',
  titulo = 'Registros',
  etiquetaCodigo = 'Código',
  etiquetaNombre = 'Descripción',
  rpc,
}: {
  tabla: string
  base: string
  vacio: T
  campoNombre: string
  sinColumnas?: string[]
  /** Para los avisos: «No existe la familia XX». */
  que?: string
  /** Para el título de la lista ordenada: «Familias ordenadas por …». */
  titulo?: string
  etiquetaCodigo?: string
  etiquetaNombre?: string
  /** RPC de la lista ordenada si la tabla no está en gw_lista_ordenada (p. ej. gw_lista_ordenada_maestros). */
  rpc?: string
}) {
  const params = useParams()
  const navigate = useNavigate()
  const codigo = decodeURIComponent((params['*'] ?? '').replace(/\/+$/, ''))
  const isNew = codigo === 'nuevo'

  const [mode, setMode] = useState<ModoFicha>(isNew ? 'alta' : 'consulta')
  const [registro, setRegistro] = useState<T>(vacio)
  const [draft, setDraft] = useState<T>(vacio)
  const [loading, setLoading] = useState(true)
  const [sinRegistros, setSinRegistros] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lista, setLista] = useState<Fila[]>([])
  const [listaCargada, setListaCargada] = useState(false)
  const [orden, setOrden] = useState<'codigo' | 'nombre'>('codigo')

  // Los códigos solo hacen falta en el alta (para proponer el siguiente libre): ya no se bajan
  // al abrir la ficha. La navegación va contra el servidor (useNavRegistro).
  useEffect(() => {
    if (mode !== 'alta' || listaCargada) return
    selectTodo<Record<string, string>>(tabla, 'codigo', 'codigo').then(({ data }) => {
      setLista(data.map((r) => ({ codigo: r.codigo, nombre: r.codigo })))
      setListaCargada(true)
    })
  }, [mode, tabla, listaCargada])

  useEffect(() => {
    setError(null)
    if (isNew) {
      setRegistro(vacio)
      setDraft(vacio)
      setSinRegistros(false)
      setMode('alta')
      setLoading(false)
      return
    }
    if (!codigo) {
      supabase
        .from(tabla)
        .select('codigo')
        .order('codigo')
        .limit(1)
        .then(({ data }) => {
          const primero = (data as { codigo: string }[] | null)?.[0]
          if (primero) navigate(`${base}/${encodeURIComponent(primero.codigo)}`, { replace: true })
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
      .from(tabla)
      .select('*')
      .eq('codigo', codigo)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('No se ha encontrado el registro.')
          setLoading(false)
          return
        }
        setRegistro(data as T)
        setDraft(data as T)
        setSinRegistros(false)
        setMode('consulta')
        setLoading(false)
      })
    // `vacio` cambia en cada render del llamador: no es dependencia real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, isNew, navigate, tabla, base])

  const porNombre = orden === 'nombre' && campoNombre !== 'codigo'
  const nav = useNavRegistro<{ codigo: string }>({
    tabla,
    orden: porNombre ? [campoNombre, 'codigo'] : ['codigo'],
    actual:
      sinRegistros || mode === 'alta' || !registro.codigo
        ? null
        : porNombre
          ? [String((registro as Record<string, unknown>)[campoNombre] ?? ''), registro.codigo]
          : [registro.codigo],
    select: 'codigo',
  })
  /** Posición (0…) del registro actual en el orden, -1 si no se sabe. */
  const idx = nav.posicion != null ? nav.posicion - 1 : -1
  const goTo = (c?: string) => c && navigate(`${base}/${encodeURIComponent(c)}`)
  const irA = async (d: NavDir) => goTo((await nav.ir(d))?.codigo)

  function patch(p: Partial<T>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function payloadDe(d: T) {
    const copia: Record<string, unknown> = { ...d }
    for (const c of sinColumnas) delete copia[c]
    return copia
  }

  /** Guarda la cabecera. `despues` recibe el código guardado (para tablas hijas). */
  async function guardar(validar: () => string | null, despues?: (cod: string) => Promise<string | null>) {
    setError(null)
    const fallo = validar()
    if (fallo) {
      setError(fallo)
      return false
    }
    setSaving(true)
    const payload = payloadDe(draft)
    const cod = String(payload.codigo).trim()
    payload.codigo = cod
    const res =
      mode === 'alta'
        ? await supabase.from(tabla).insert(payload)
        : await supabase.from(tabla).update(payload).eq('codigo', registro.codigo)
    if (res.error) {
      setSaving(false)
      setError(res.error.code === '23505' ? `Ya existe un registro con el código ${cod}.` : res.error.message)
      return false
    }
    if (despues) {
      const err = await despues(cod)
      if (err) {
        setSaving(false)
        setError(err)
        return false
      }
    }
    setSaving(false)
    const nombre = String((payload as Record<string, unknown>)[campoNombre] ?? cod)
    if (mode === 'alta') {
      setLista((l) => [...l, { codigo: cod, nombre }].sort((a, b) => a.codigo.localeCompare(b.codigo)))
      nav.refrescar()
      navigate(`${base}/${encodeURIComponent(cod)}`, { replace: true })
      return true
    }
    const { data } = await supabase.from(tabla).select('*').eq('codigo', cod).maybeSingle()
    const guardado = (data as T | null) ?? draft
    setRegistro(guardado)
    setDraft(guardado)
    setLista((l) => l.map((x) => (x.codigo === cod ? { ...x, nombre } : x)))
    setMode('consulta')
    return true
  }

  function cancelar() {
    if (mode === 'alta') {
      navigate(base)
      return
    }
    setDraft(registro)
    setError(null)
    setMode('consulta')
  }

  /** Borra el registro si `enUso` no devuelve motivo para impedirlo. */
  async function eliminar(descripcion: string, enUso: () => Promise<string | null>, antesDeBorrar?: () => Promise<string | null>) {
    if (sinRegistros || !registro.codigo) return
    setError(null)
    const motivo = await enUso()
    if (motivo) {
      alert(motivo)
      return
    }
    if (!confirm(`¿Eliminar ${descripcion}? Esta acción no se puede deshacer.`)) return
    if (antesDeBorrar) {
      const fallo = await antesDeBorrar()
      if (fallo) {
        setError(fallo)
        return
      }
    }
    // El que queda en su sitio: el siguiente, o el anterior si era el último.
    const siguiente = (await nav.ir('siguiente')) ?? (await nav.ir('anterior'))
    const { data: borradas, error: err } = await supabase.from(tabla).delete().eq('codigo', registro.codigo).select('codigo')
    if (err) {
      setError(err.message)
      return
    }
    // Los maestros solo los borra un administrador (políticas admin_borra_*): sin error, pero 0 filas.
    if (!borradas?.length) {
      setError('Solo un administrador puede eliminar registros. Dalo de baja (desmarca «Activo») o pídeselo a un administrador.')
      return
    }
    setLista((l) => l.filter((x) => x.codigo !== registro.codigo))
    nav.refrescar()
    navigate(siguiente ? `${base}/${encodeURIComponent(siguiente.codigo)}` : base, { replace: true })
  }

  // Búsqueda desde los campos en consulta (Intro) y lista ordenada (Ctrl+Intro), como en
  // Artículos. `busqueda('codigo' | 'nombre')` da los props para GwCampoBusqueda; la tabla
  // tiene que estar en la lista blanca de gw_lista_ordenada.
  const listaOrd = useListaOrdenada()
  const columnaNombre = campoNombre === 'codigo' ? [] : [{ key: campoNombre, label: etiquetaNombre }]
  const defLista = (campo: string): GwListaOrdenadaDef => ({
    fuente: tabla,
    rpc,
    campo,
    etiqueta: campo === 'codigo' ? etiquetaCodigo : etiquetaNombre,
    que: titulo,
    columnas: [{ key: 'codigo', label: etiquetaCodigo, width: campoNombre === 'codigo' ? undefined : 130 }, ...columnaNombre],
  })
  function busqueda(cual: 'codigo' | 'nombre') {
    const campo = cual === 'codigo' ? 'codigo' : campoNombre
    return {
      onBuscar: async (t: string) => {
        if (campo === 'codigo') {
          const { data } = await supabase.from(tabla).select('codigo').in('codigo', [t, t.toUpperCase()]).limit(1)
          const c = (data as { codigo: string }[] | null)?.[0]?.codigo
          if (c) return goTo(c)
          return setError(`No existe ${que} ${t}`)
        }
        const f = await gwBuscarPorInicio(tabla, campo, t, rpc)
        if (f) goTo(String(f.codigo))
        else setError(`No existe ${que} que empiece por «${t}»`)
      },
      onLista:
        mode === 'consulta'
          ? (texto: string | null) =>
              listaOrd.abrir(defLista(campo), { texto, ancla: registro.codigo || null, onPick: (f) => goTo(String(f.codigo)) })
          : undefined,
    }
  }

  return {
    busqueda,
    dialogoLista: listaOrd.dialogo,
    navigate,
    mode,
    setMode,
    editing: mode !== 'consulta',
    registro,
    draft,
    patch,
    loading,
    sinRegistros,
    saving,
    error,
    setError,
    lista,
    listaCargada,
    orden,
    setOrden,
    idx,
    /** Número de registros (0 mientras se cuenta). */
    total: nav.total ?? 0,
    goTo,
    /** Primero · anterior · siguiente · último, pidiendo al servidor solo ese registro. */
    irA,
    guardar,
    cancelar,
    eliminar,
    canNavigate: mode === 'consulta' && !sinRegistros,
  }
}
