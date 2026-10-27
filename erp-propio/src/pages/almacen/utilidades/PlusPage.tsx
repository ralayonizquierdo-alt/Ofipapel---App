import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwInput } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { useListaOrdenada } from '../../../components/gw/GwListaOrdenada'
import { CampoArticulo, msgError } from './comun'

// Almacén → Plu's. Calcada de la captura 06-25 («Asignación de Plu's»): rejilla Cód. Plu ·
// Código Artículo · Descripción con la barra de registro. Un PLU es el código corto que se
// teclea en la balanza o el TPV para un artículo (tabla articulo_plu).

interface Plu {
  plu: string
  articulo_codigo: string
  descripcion: string
}
type Modo = 'consulta' | 'edicion' | 'alta'

export function PlusPage() {
  const navigate = useNavigate()
  const lista = useListaOrdenada()
  const [filas, setFilas] = useState<Plu[]>([])
  const [sel, setSel] = useState(0)
  const [modo, setModo] = useState<Modo>('consulta')
  const [draft, setDraft] = useState<Plu>({ plu: '', articulo_codigo: '', descripcion: '' })
  const [orden, setOrden] = useState<'plu' | 'articulo_codigo'>('plu')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const filaRef = useRef<HTMLTableRowElement>(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('articulo_plu').select('plu, articulo_codigo, articulo(descripcion)').order(orden).limit(5000)
    if (e) return setError(e.message)
    setFilas(
      ((data ?? []) as unknown as { plu: string; articulo_codigo: string; articulo: { descripcion: string } | null }[]).map((r) => ({
        plu: r.plu,
        articulo_codigo: r.articulo_codigo,
        descripcion: r.articulo?.descripcion ?? '',
      })),
    )
  }, [orden])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    filaRef.current?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  async function resolver(codigo: string) {
    if (!codigo.trim()) return
    const { data } = await supabase.from('articulo').select('codigo_interno, descripcion').eq('codigo_interno', codigo.trim()).maybeSingle()
    const a = data as { codigo_interno: string; descripcion: string } | null
    if (!a) {
      setError(`No existe el artículo ${codigo}.`)
      setDraft((d) => ({ ...d, descripcion: '' }))
      return
    }
    setError(null)
    setDraft((d) => (d.articulo_codigo.trim() === codigo.trim() ? { ...d, articulo_codigo: a.codigo_interno, descripcion: a.descripcion } : d))
  }

  // La descripción se busca al escribir o elegir el código (Ctrl+Intro).
  useEffect(() => {
    if (modo === 'consulta') return
    const c = draft.articulo_codigo.trim()
    if (!c) return
    const t = setTimeout(() => resolver(c), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.articulo_codigo, modo])

  async function guardar() {
    setError(null)
    const plu = draft.plu.trim()
    if (!plu) return setError('Falta el Cód. Plu.')
    if (!draft.descripcion) return setError('Indica un artículo válido.')
    setGuardando(true)
    try {
      if (modo === 'alta') {
        const { error: e } = await supabase.from('articulo_plu').insert({ plu, articulo_codigo: draft.articulo_codigo })
        if (e) throw new Error(e.code === '23505' ? `El Plu ${plu} ya está asignado.` : e.message)
      } else {
        const antes = filas[sel]
        const { error: e } = await supabase.from('articulo_plu').update({ plu, articulo_codigo: draft.articulo_codigo, actualizado_en: new Date().toISOString() }).eq('plu', antes.plu)
        if (e) throw new Error(e.code === '23505' ? `El Plu ${plu} ya está asignado.` : e.message)
      }
      await cargar()
      setModo('consulta')
      setFilas((fs) => {
        const i = fs.findIndex((x) => x.plu === plu)
        if (i >= 0) setSel(i)
        return fs
      })
    } catch (e) {
      setError(msgError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar() {
    const f = filas[sel]
    if (!f || !confirm(`¿Eliminar el Plu ${f.plu} (${f.articulo_codigo})?`)) return
    const { error: e } = await supabase.from('articulo_plu').delete().eq('plu', f.plu)
    if (e) return setError(e.message)
    await cargar()
    setSel((s) => Math.max(0, s - 1))
  }

  const editando = modo !== 'consulta'
  const filasVista: (Plu & { _editor?: boolean })[] = modo === 'alta' ? [...filas, { ...draft, _editor: true }] : filas
  const idxEditor = modo === 'alta' ? filas.length : modo === 'edicion' ? sel : -1
  const vacias = Math.max(0, 17 - filasVista.length)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid table-fixed">
          <thead className="sticky top-0 z-10">
            <tr>
              <th style={{ width: 14 }} />
              <th style={{ width: 200 }} className="!text-[20px]">
                Cód. Plu
              </th>
              <th style={{ width: 345 }} className="!text-[20px]">
                Código Artículo
              </th>
              <th className="!text-[20px]">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {filasVista.map((f, i) =>
              i === idxEditor ? (
                <tr key="editor">
                  <td className="!px-0 text-center text-[10px]">▸</td>
                  <td className="!p-0">
                    <GwInput autoFocus className="!h-[26px] !text-[17px]" value={draft.plu} maxLength={13} onChange={(e) => setDraft((d) => ({ ...d, plu: e.target.value.trim() }))} />
                  </td>
                  <td className="!p-0">
                    <CampoArticulo
                      className="!h-[26px] !text-[17px]"
                      value={draft.articulo_codigo}
                      lista={lista}
                      onChange={(v) => {
                        setDraft((d) => ({ ...d, articulo_codigo: v }))
                        if (!v) setDraft((d) => ({ ...d, descripcion: '' }))
                      }}
                      onIntro={resolver}
                    />
                  </td>
                  <td className="text-[17px]">{draft.descripcion}</td>
                </tr>
              ) : (
                <tr
                  key={f.plu}
                  ref={i === sel ? filaRef : undefined}
                  className={i === sel && !editando ? 'gw-selected' : ''}
                  onClick={() => !editando && setSel(i)}
                  onDoubleClick={() => navigate(`/articulos/${encodeURIComponent(f.articulo_codigo)}`)}
                  title="Doble clic: abrir la ficha del artículo"
                >
                  <td className="!px-0 text-center text-[10px]">{i === sel ? '▸' : ''}</td>
                  <td className="!text-[17px]">{f.plu}</td>
                  <td className="!text-[17px]">{f.articulo_codigo}</td>
                  <td className="truncate !text-[17px]">{f.descripcion}</td>
                </tr>
              ),
            )}
            {Array.from({ length: vacias }, (_, i) => (
              <tr key={`v${i}`}>
                <td />
                <td>&nbsp;</td>
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <div className="text-[13px] text-[#c42b1c]">{error}</div>}
      <div className="pr-[64px]">
        <GwRecordBar
          grande
          mode={modo}
          canNavigate={!editando && filas.length > 0}
          saving={guardando}
          onFirst={() => setSel(0)}
          onPrev={() => setSel((s) => Math.max(0, s - 1))}
          onNext={() => setSel((s) => Math.min(filas.length - 1, s + 1))}
          onLast={() => setSel(Math.max(0, filas.length - 1))}
          onSort={() => setOrden((o) => (o === 'plu' ? 'articulo_codigo' : 'plu'))}
          onSearch={() => {
            const t = prompt('Cód. Plu o código de artículo a buscar:')
            if (!t) return
            const i = filas.findIndex((f) => f.plu === t.trim() || f.articulo_codigo === t.trim())
            if (i >= 0) setSel(i)
            else setError(`No hay ningún Plu con ${t}.`)
          }}
          onPrint={() => window.print()}
          onNew={() => {
            setDraft({ plu: '', articulo_codigo: '', descripcion: '' })
            setError(null)
            setModo('alta')
          }}
          onEdit={() => {
            if (!filas[sel]) return
            setDraft(filas[sel])
            setModo('edicion')
          }}
          onDelete={eliminar}
          onSave={guardar}
          onCancel={() => {
            setModo('consulta')
            setError(null)
          }}
          onExit={() => navigate('/')}
        />
      </div>
      {lista.dialogo}
    </div>
  )
}
