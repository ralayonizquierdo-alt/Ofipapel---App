// Archivo → Diccionario de textos (Luis, 02/11/2026: «para cambiar las mayúsculas por minúsculas tienes que
// añadir un diccionario tanto a la web como a la gestión»). Un solo diccionario para el ERP y la web: dice cómo
// se escribe cada palabra cuando una descripción de GeminisWin («CALCULADORA CIENTIFICA Casio») se pasa a
// minúsculas («Calculadora científica Casio»). Lo aplica la función fn_texto_natural de la base de datos.
// Datos: migración 20261102_diccionario_textos (diccionario_texto, fn_texto_natural, fn_diccionario_pendientes).

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { GwField, GwInput, GwSelect, GwTabs, GwTextArea } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'

interface Entrada {
  palabra: string
  forma: string
  tipo: 'palabra' | 'sigla' | 'marca' | 'abreviatura'
}
interface Pendiente {
  palabra: string
  veces: number
  ejemplo: string
  propuesta: string
}

const TIPOS: Record<Entrada['tipo'], string> = { palabra: 'Palabra', sigla: 'Sigla', marca: 'Marca', abreviatura: 'Abreviatura (con punto)' }

export function DiccionarioTextosPage() {
  const { realAdmin } = usePermisos()
  const [tab, setTab] = useState('pendientes')
  const [msg, setMsg] = useState<{ texto: string; error: boolean } | null>(null)
  return (
    <div className="p-2">
      <GwTabs
        rows={[
          [
            { key: 'pendientes', label: 'Palabras por revisar' },
            { key: 'diccionario', label: 'Diccionario' },
            { key: 'probar', label: 'Probar' },
            { key: 'operativa', label: 'Operativa' },
          ],
        ]}
        active={tab}
        onChange={(t) => (setTab(t), setMsg(null))}
      >
        <div className="flex flex-col gap-2 p-2 text-[13px]">
          {msg && <div className={`text-[12px] ${msg.error ? 'text-[#c42b1c]' : 'text-[#1a7f37]'}`}>{msg.texto}</div>}
          {!realAdmin && tab !== 'operativa' && <div className="text-[12px] text-[#8a5a00]">Solo un administrador puede añadir o cambiar palabras.</div>}
          {tab === 'pendientes' && <Pendientes puede={realAdmin} setMsg={setMsg} />}
          {tab === 'diccionario' && <Diccionario puede={realAdmin} setMsg={setMsg} />}
          {tab === 'probar' && <Probar />}
          {tab === 'operativa' && <Operativa />}
        </div>
      </GwTabs>
    </div>
  )
}

async function guardar(e: Entrada): Promise<string | null> {
  const palabra = e.palabra.trim().toUpperCase()
  if (!palabra || !e.forma.trim()) return 'Falta la palabra o cómo se escribe.'
  const { error } = await supabase.from('diccionario_texto').upsert({ palabra, forma: e.forma.trim(), tipo: e.tipo, actualizado_en: new Date().toISOString() })
  return error ? error.message : null
}

function Pendientes({ puede, setMsg }: { puede: boolean; setMsg: (m: { texto: string; error: boolean }) => void }) {
  const [lista, setLista] = useState<(Pendiente & { forma: string; tipo: Entrada['tipo'] })[]>([])
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data } = await supabase.rpc('fn_diccionario_pendientes', { p_limite: 200 })
    setCargando(false)
    setLista(((data ?? []) as Pendiente[]).map((p) => ({ ...p, forma: p.propuesta, tipo: 'palabra' as const })))
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  const poner = (i: number, c: Partial<{ forma: string; tipo: Entrada['tipo'] }>) => setLista((l) => l.map((x, j) => (j === i ? { ...x, ...c } : x)))

  async function anadir(i: number) {
    const p = lista[i]
    const error = await guardar({ palabra: p.palabra, forma: p.forma, tipo: p.tipo })
    if (error) return setMsg({ texto: error, error: true })
    setMsg({ texto: `«${p.palabra}» → «${p.forma}» añadida.`, error: false })
    setLista((l) => l.filter((_, j) => j !== i))
  }

  // Guardar toda la lista de una vez: primero se corrigen las pocas con tilde, siglas o marcas; el resto ya está bien en minúsculas.
  async function guardarTodas() {
    if (!lista.length) return
    if (!confirm(`¿Guardar las ${lista.length} palabras de la lista tal como están ahora? Revisa antes las que lleven tilde, las siglas y las marcas.`)) return
    const filas = lista.map((p) => ({ palabra: p.palabra, forma: p.forma.trim() || p.propuesta, tipo: p.tipo, actualizado_en: new Date().toISOString() }))
    const { error } = await supabase.from('diccionario_texto').upsert(filas)
    if (error) return setMsg({ texto: error.message, error: true })
    setMsg({ texto: `${filas.length} palabras guardadas. Salen las siguientes.`, error: false })
    void cargar()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 text-[12px] text-[#555]">
          Palabras en MAYÚSCULAS de las descripciones de los artículos que aún no están en el diccionario, las más repetidas primero. Si se quedan así, salen en
          minúsculas tal cual. Corrige las que lleven tilde, las siglas (que van en mayúsculas) y las marcas o modelos, y pulsa «Añadir»; o corrige esas y
          guarda toda la lista de una vez.
        </div>
        {puede && (
          <button type="button" className="gw-btn font-bold" disabled={!lista.length} onClick={() => void guardarTodas()}>
            Guardar toda la lista
          </button>
        )}
      </div>
      <div className="max-h-[62vh] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid w-full">
          <thead className="sticky top-0">
            <tr>
              <th>Palabra</th>
              <th className="text-right">Veces</th>
              <th>Se escribirá</th>
              <th>Tipo</th>
              <th>Ejemplo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((p, i) => (
              <tr key={p.palabra}>
                <td className="font-bold">{p.palabra}</td>
                <td className="text-right">{p.veces}</td>
                <td>
                  <GwInput className="w-[180px]" disabled={!puede} value={p.forma} onChange={(e) => poner(i, { forma: e.target.value })} />
                </td>
                <td>
                  <GwSelect
                    disabled={!puede}
                    value={p.tipo}
                    onChange={(e) => poner(i, { tipo: e.target.value as Entrada['tipo'], ...(e.target.value === 'sigla' ? { forma: p.palabra } : {}) })}
                  >
                    {(['palabra', 'sigla', 'marca'] as const).map((t) => (
                      <option key={t} value={t}>
                        {TIPOS[t]}
                      </option>
                    ))}
                  </GwSelect>
                </td>
                <td className="max-w-[360px] truncate text-[12px] text-[#555]" title={p.ejemplo}>
                  {p.ejemplo}
                </td>
                <td>
                  <button type="button" className="gw-btn" disabled={!puede} onClick={() => void anadir(i)}>
                    Añadir
                  </button>
                </td>
              </tr>
            ))}
            {!lista.length && (
              <tr>
                <td colSpan={6} className="p-2 text-center text-[#777]">
                  {cargando ? 'Mirando los artículos…' : 'No queda ninguna palabra por revisar.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Diccionario({ puede, setMsg }: { puede: boolean; setMsg: (m: { texto: string; error: boolean }) => void }) {
  const [lista, setLista] = useState<Entrada[]>([])
  const [filtro, setFiltro] = useState('')
  const [nueva, setNueva] = useState<Entrada>({ palabra: '', forma: '', tipo: 'palabra' })

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('diccionario_texto').select('palabra, forma, tipo').order('palabra')
    setLista((data ?? []) as Entrada[])
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  async function anadir() {
    const error = await guardar(nueva)
    if (error) return setMsg({ texto: error, error: true })
    setMsg({ texto: 'Guardada.', error: false })
    setNueva({ palabra: '', forma: '', tipo: 'palabra' })
    void cargar()
  }

  async function quitar(e: Entrada) {
    if (!confirm(`¿Quitar «${e.palabra}» del diccionario? Pasará a escribirse en minúsculas tal cual.`)) return
    const { error } = await supabase.from('diccionario_texto').delete().eq('palabra', e.palabra)
    if (error) return setMsg({ texto: error.message, error: true })
    void cargar()
  }

  const f = filtro.trim().toUpperCase()
  const vistas = f ? lista.filter((e) => e.palabra.includes(f) || e.forma.toUpperCase().includes(f)) : lista
  return (
    <div className="flex flex-col gap-2">
      {puede && (
        <div className="flex flex-wrap items-end gap-2 border-b border-[var(--gw-border)] pb-2">
          <GwField label="Palabra (como viene, en mayúsculas)">
            <GwInput
              className="w-[180px]"
              value={nueva.palabra}
              placeholder="PROYECCION"
              onChange={(e) => setNueva({ ...nueva, palabra: e.target.value.toUpperCase() })}
            />
          </GwField>
          <GwField label="Se escribe">
            <GwInput className="w-[180px]" value={nueva.forma} placeholder="proyección" onChange={(e) => setNueva({ ...nueva, forma: e.target.value })} />
          </GwField>
          <GwField label="Tipo">
            <GwSelect value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value as Entrada['tipo'] })}>
              {(Object.keys(TIPOS) as Entrada['tipo'][]).map((t) => (
                <option key={t} value={t}>
                  {TIPOS[t]}
                </option>
              ))}
            </GwSelect>
          </GwField>
          <button type="button" className="gw-btn" onClick={() => void anadir()}>
            Añadir o cambiar
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <GwInput className="w-[240px]" placeholder="Buscar en el diccionario…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <span className="text-[12px] text-[#555]">{lista.length} palabras</span>
      </div>
      <div className="max-h-[56vh] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid w-full">
          <thead className="sticky top-0">
            <tr>
              <th>Palabra</th>
              <th>Se escribe</th>
              <th>Tipo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vistas.map((e) => (
              <tr key={e.palabra}>
                <td className="font-bold">{e.palabra}</td>
                <td>{e.forma}</td>
                <td>{TIPOS[e.tipo]}</td>
                <td>
                  {puede && (
                    <button type="button" className="gw-btn" onClick={() => void quitar(e)}>
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Probar() {
  const [texto, setTexto] = useState(
    'CART. INK-JET HP (Nº305) DeskJet 2300 NEGRO\nCALCULADORA CIENTIFICA Casio FX-991-SPCW\nPANTALLA PROYECCION TRIPODE 240x240',
  )
  const [resultado, setResultado] = useState('')
  const [muestra, setMuestra] = useState<{ antes: string; despues: string }[]>([])

  async function probar() {
    const lineas = texto.split('\n')
    const salida = await Promise.all(lineas.map((l) => supabase.rpc('fn_texto_natural', { p_texto: l }).then(({ data }) => (data as string | null) ?? '')))
    setResultado(salida.join('\n'))
  }

  async function verArticulos() {
    const { data } = await supabase.from('articulo').select('descripcion').not('descripcion', 'is', null).limit(400)
    const elegidos = ((data ?? []) as { descripcion: string }[]).sort(() => Math.random() - 0.5).slice(0, 25)
    const r = await Promise.all(
      elegidos.map((a) =>
        supabase.rpc('fn_texto_natural', { p_texto: a.descripcion }).then(({ data: d }) => ({ antes: a.descripcion, despues: (d as string | null) ?? '' })),
      ),
    )
    setMuestra(r)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <GwField label="Escribe o pega descripciones (una por línea)">
          <GwTextArea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </GwField>
        <GwField label="Así quedarían">
          <GwTextArea rows={6} readOnly value={resultado} />
        </GwField>
      </div>
      <div className="flex gap-2">
        <button type="button" className="gw-btn" onClick={() => void probar()}>
          Probar
        </button>
        <button type="button" className="gw-btn" onClick={() => void verArticulos()}>
          Ver 25 artículos al azar
        </button>
      </div>
      {muestra.length > 0 && (
        <div className="max-h-[48vh] overflow-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid w-full">
            <thead className="sticky top-0">
              <tr>
                <th>Ahora (GeminisWin)</th>
                <th>En minúsculas</th>
              </tr>
            </thead>
            <tbody>
              {muestra.map((m, i) => (
                <tr key={i}>
                  <td className="text-[12px]">{m.antes}</td>
                  <td>{m.despues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Operativa() {
  return (
    <GwOperativa
      bloques={[
        {
          titulo: 'Para qué sirve',
          notas: [
            'Las descripciones de los artículos vienen de GeminisWin en MAYÚSCULAS y sin tildes. Para la web y para lo que vea el cliente se pasan a minúsculas, y este diccionario dice cómo se escribe cada palabra: con su tilde (proyección), en mayúsculas si es una sigla (HP, XL) o como se escribe una marca.',
            'Es el mismo diccionario para el ERP y para la web.',
            'Lo que ya está bien escrito (Casio, Brother) y los códigos con números (FX-991, TN-421, 80x60) no se tocan nunca.',
          ],
        },
        {
          titulo: 'Cómo se va completando',
          pasos: [
            '«Palabras por revisar»: salen las palabras en MAYÚSCULAS de los artículos que aún no están en el diccionario, las más repetidas primero.',
            'Corrige cómo se escribe (la tilde, o la sigla en mayúsculas eligiendo «Sigla») y pulsa «Añadir». Las que ya estén bien en minúsculas también conviene añadirlas, para que dejen de salir.',
            '«Probar»: pega descripciones o mira 25 artículos al azar para ver cómo quedan.',
          ],
          notas: [
            'Abreviaturas con punto: escribe la palabra con su punto (CART.) y cómo se lee (cartucho).',
            'Solo los administradores pueden añadir o quitar palabras; todo queda en la auditoría.',
          ],
        },
      ]}
    />
  )
}
