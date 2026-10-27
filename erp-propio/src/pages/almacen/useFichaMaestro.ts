import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { selectTodo, supabase } from '../../lib/supabase'

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
}: {
  tabla: string
  base: string
  vacio: T
  campoNombre: string
  sinColumnas?: string[]
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

  useEffect(() => {
    selectTodo<Record<string, string>>(tabla, campoNombre === 'codigo' ? 'codigo' : `codigo, ${campoNombre}`, 'codigo')
      .then(({ data }) => {
        const filas = data.map((r) => ({
          codigo: r.codigo,
          nombre: r[campoNombre] ?? r.codigo,
        }))
        setLista(filas)
        setListaCargada(true)
      })
  }, [tabla, campoNombre])

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

  const ordenada = useMemo(
    () =>
      orden === 'codigo'
        ? lista
        : [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.codigo.localeCompare(b.codigo)),
    [lista, orden],
  )
  const idx = ordenada.findIndex((r) => r.codigo === registro.codigo)
  const goTo = (c?: string) => c && navigate(`${base}/${encodeURIComponent(c)}`)

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
      navigate(lista[0] ? `${base}/${encodeURIComponent(lista[0].codigo)}` : base)
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
    const { error: err } = await supabase.from(tabla).delete().eq('codigo', registro.codigo)
    if (err) {
      setError(err.message)
      return
    }
    const resto = lista.filter((x) => x.codigo !== registro.codigo)
    setLista(resto)
    const siguiente = resto[Math.min(Math.max(idx, 0), resto.length - 1)]
    navigate(siguiente ? `${base}/${encodeURIComponent(siguiente.codigo)}` : base, { replace: true })
  }

  return {
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
    ordenada,
    idx,
    goTo,
    guardar,
    cancelar,
    eliminar,
    canNavigate: mode === 'consulta' && ordenada.length > 0,
  }
}
