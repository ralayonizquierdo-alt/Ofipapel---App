// Gestor de Roturas · pestaña «Cuadrar abono» (tarea 32, fase 5; Rober, 12/11/2026).
// Se arrastra (o se examina) el PDF que manda el proveedor, la IA lo lee y propone a qué expediente
// corresponde cada línea, y la persona lo revisa con el PDF al lado y lo confirma. Nada se guarda
// hasta pulsar «Confirmar»: lo aplica fn_rotura_cuadrar (20261112_roturas_cuadre.sql), todo o nada.

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwInput, GwSelect } from '../../../components/gw'
import type { EstadoRotura, ExpedienteRotura } from '../../../lib/roturas'

const ABIERTOS: EstadoRotura[] = ['ABONO_PROVEEDOR', 'SEPARADO_PROVEEDOR', 'PENDIENTE']
type Tipo = 'ABONO' | 'COMPENSACION_GENERO'

interface LineaIA {
  referencia: string | null
  descripcion: string
  cantidad: number | null
  precio: number | null
  importe: number | null
  expediente_id: number | null
  confianza: 'alta' | 'media' | 'baja'
  motivo: string
}
interface LecturaIA {
  tipo_documento: Tipo | 'OTRO'
  documento_numero: string | null
  documento_fecha: string | null
  base: number | null
  igic: number | null
  total: number | null
  lineas: LineaIA[]
  avisos: string[]
}
interface FilaCuadre {
  incluir: boolean
  importe: string
  retirado: boolean
  linea: LineaIA | null
}

const th = 'border border-[var(--gw-border-light)] bg-[var(--gw-face)] px-1.5 py-0.5 text-left font-bold'
const td = 'border border-[var(--gw-border-light)] px-1.5 py-0.5'
const cant = (n: number | null) => (n == null ? '' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n))
const euros = (n: number | null) => (n == null ? '' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n))
const num = (s: string) => {
  const n = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const txt = (n: number | null) => (n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ','))
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))
const COLOR_CONFIANZA = { alta: '#127a12', media: '#8a5a00', baja: '#c42b1c' }

function aBase64(archivo: File): Promise<string> {
  return new Promise((ok, mal) => {
    const lector = new FileReader()
    lector.onload = () => ok(String(lector.result).split(',')[1] ?? '')
    lector.onerror = () => mal(new Error('No se ha podido leer el archivo.'))
    lector.readAsDataURL(archivo)
  })
}

export function CuadreRoturas({ filas, nombreProveedor, onHecho }: { filas: ExpedienteRotura[]; nombreProveedor: (codigo: string) => string; onHecho: (texto: string) => void }) {
  const abiertos = useMemo(() => filas.filter((f) => !f.anulado_en && !f.tipo_cuadre && ABIERTOS.includes(f.estado)), [filas])
  const proveedores = useMemo(() => [...new Set(abiertos.map((f) => f.proveedor_codigo))].sort((a, b) => nombreProveedor(a).localeCompare(nombreProveedor(b))), [abiertos, nombreProveedor])
  const [proveedor, setProveedor] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [encima, setEncima] = useState(false)
  const [paso, setPaso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lectura, setLectura] = useState<LecturaIA | null>(null)
  const [revisando, setRevisando] = useState(false)
  const [tipo, setTipo] = useState<Tipo>('ABONO')
  const [docNumero, setDocNumero] = useState('')
  const [docFecha, setDocFecha] = useState('')
  const [base, setBase] = useState('')
  const [igic, setIgic] = useState('')
  const [total, setTotal] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [cuadre, setCuadre] = useState<Record<number, FilaCuadre>>({})
  const examinar = useRef<HTMLInputElement>(null)

  const delProveedor = useMemo(() => abiertos.filter((f) => f.proveedor_codigo === proveedor).sort((a, b) => a.id - b.id), [abiertos, proveedor])

  useEffect(() => {
    if (!pdf) return setPdfUrl(null)
    const url = URL.createObjectURL(pdf)
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pdf])

  function ponerPdf(archivo: File | undefined | null) {
    setError(null)
    if (!archivo) return
    if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) return setError('Tiene que ser un PDF.')
    if (archivo.size > 8_000_000) return setError('El PDF pesa demasiado (máximo 8 MB).')
    setPdf(archivo)
  }
  function soltar(e: DragEvent) {
    e.preventDefault()
    setEncima(false)
    ponerPdf(e.dataTransfer.files?.[0])
  }

  function empezar(l: LecturaIA | null) {
    const filasCuadre: Record<number, FilaCuadre> = {}
    for (const f of delProveedor) {
      const linea = l?.lineas.find((x) => x.expediente_id === f.id) ?? null
      filasCuadre[f.id] = { incluir: !!linea, importe: txt(linea?.importe ?? null), retirado: false, linea }
    }
    setCuadre(filasCuadre)
    setLectura(l)
    setTipo(l?.tipo_documento === 'COMPENSACION_GENERO' ? 'COMPENSACION_GENERO' : 'ABONO')
    setDocNumero(l?.documento_numero ?? '')
    setDocFecha(l?.documento_fecha && /^\d{4}-\d{2}-\d{2}$/.test(l.documento_fecha) ? l.documento_fecha : '')
    setBase(txt(l?.base ?? null))
    setIgic(txt(l?.igic ?? null))
    setTotal(txt(l?.total ?? null))
    setObservaciones('')
    setRevisando(true)
  }

  async function leerConIA() {
    if (!pdf || !proveedor) return
    setError(null)
    setPaso('La IA está leyendo el documento… (puede tardar un minuto)')
    try {
      const { data, error: err } = await supabase.functions.invoke('rotura-cuadre-ia', { body: { proveedor_codigo: proveedor, pdf_base64: await aBase64(pdf) } })
      if (err) throw new Error(err.message)
      if (!data?.ok) throw new Error(data?.error ?? 'La IA no ha contestado.')
      empezar(data.lectura as LecturaIA)
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setPaso(null)
    }
  }

  const cambiar = (id: number, c: Partial<FilaCuadre>) => setCuadre((m) => ({ ...m, [id]: { ...m[id], ...c } }))
  const elegidos = delProveedor.filter((f) => cuadre[f.id]?.incluir)
  const suma = elegidos.reduce((s, f) => s + num(cuadre[f.id].importe), 0)
  const sueltas = lectura?.lineas.filter((l) => l.expediente_id == null) ?? []
  const sumaSueltas = sueltas.reduce((s, l) => s + (l.importe ?? 0), 0)
  const diferencia = Math.round((num(base) - suma - sumaSueltas) * 100) / 100
  const esAbono = tipo === 'ABONO'

  async function confirmar() {
    setError(null)
    if (!elegidos.length) return setError('Marca al menos un expediente.')
    if (esAbono && !docNumero.trim()) return setError('Falta el número del abono del proveedor.')
    if (esAbono && num(total) <= 0) return setError('Falta el total del abono.')
    if (esAbono && elegidos.some((f) => num(cuadre[f.id].importe) <= 0)) return setError('Hay expedientes marcados sin importe.')
    const resumen = esAbono
      ? `Vas a apuntar el abono ${docNumero} (${euros(num(total))}) en ${elegidos.length} expediente(s).\n\nSe dan de baja del Almacén 06 y se crea la factura de abono del proveedor.`
      : `Vas a apuntar la compensación con género de ${elegidos.length} expediente(s).\n\nLas unidades pasan del Almacén 06 al 04.`
    if (!confirm(`${resumen}\n\nEsto no se puede deshacer. ¿Seguir?`)) return
    try {
      let ruta: string | null = null
      if (pdf) {
        setPaso('Guardando el PDF…')
        ruta = `${Math.min(...elegidos.map((f) => f.id))}/${crypto.randomUUID()}-${esAbono ? 'abono' : 'compensacion'}.pdf`
        const { error: errSubida } = await supabase.storage.from('roturas').upload(ruta, pdf, { contentType: 'application/pdf', upsert: false })
        if (errSubida) throw new Error(`No se ha podido guardar el PDF: ${errSubida.message}`)
      }
      setPaso('Apuntando el cuadre…')
      const { data, error: err } = await supabase.rpc('fn_rotura_cuadrar', {
        p: {
          tipo,
          proveedor_codigo: proveedor,
          documento_numero: docNumero,
          documento_fecha: docFecha,
          base: num(base),
          igic: num(igic),
          total: num(total),
          pdf_ruta: ruta,
          pdf_nombre: pdf?.name ?? null,
          lectura_ia: lectura,
          observaciones,
          lineas: elegidos.map((f) => ({ expediente_id: f.id, importe: num(cuadre[f.id].importe), retirado: cuadre[f.id].retirado })),
        },
      })
      if (err) throw new Error(err.message)
      const r = data as { expedientes: string[]; factura_id: number | null }
      setRevisando(false)
      setPdf(null)
      setLectura(null)
      onHecho(esAbono ? `Abono ${docNumero} cuadrado: ${r.expedientes.join(', ')}. Factura de abono nº ${r.factura_id} creada (pendiente de contabilizar).` : `Compensación con género apuntada: ${r.expedientes.join(', ')}.`)
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setPaso(null)
    }
  }

  if (!proveedores.length) return <div className="text-[#555]">No hay expedientes reclamados o separados pendientes de cuadrar.</div>

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <GwField label="Proveedor">
          <GwSelect
            className="w-[340px]"
            value={proveedor}
            disabled={revisando}
            onChange={(e) => {
              setProveedor(e.target.value)
              setError(null)
            }}
          >
            <option value="">Elige el proveedor…</option>
            {proveedores.map((c) => (
              <option key={c} value={c}>
                {nombreProveedor(c)} ({abiertos.filter((f) => f.proveedor_codigo === c).length})
              </option>
            ))}
          </GwSelect>
        </GwField>
        {revisando && (
          <button
            type="button"
            className="gw-btn h-[26px]"
            disabled={!!paso}
            onClick={() => {
              setRevisando(false)
              setLectura(null)
            }}
          >
            ← Empezar de nuevo
          </button>
        )}
      </div>

      {!revisando && (
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label="Zona para arrastrar el PDF del proveedor"
            onDragOver={(e) => {
              e.preventDefault()
              setEncima(true)
            }}
            onDragLeave={() => setEncima(false)}
            onDrop={soltar}
            onClick={() => examinar.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && examinar.current?.click()}
            className={`flex min-h-[130px] cursor-pointer flex-col items-center justify-center gap-1 border-2 border-dashed p-3 text-center ${encima ? 'border-[#1d3a8a] bg-[#dbeeff]' : 'border-[var(--gw-border)] bg-[#f7f9fc]'}`}
          >
            {pdf ? (
              <>
                <div className="text-[15px] font-bold text-[#1d3a8a]">📄 {pdf.name}</div>
                <div className="text-[#555]">{Math.round(pdf.size / 1024)} KB · pulsa o arrastra otro para cambiarlo</div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-bold">Arrastra aquí el PDF del abono del proveedor</div>
                <div className="text-[#555]">o pulsa para examinar</div>
              </>
            )}
            <input ref={examinar} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => ponerPdf(e.target.files?.[0])} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className="gw-btn h-[30px] font-bold" disabled={!pdf || !proveedor || !!paso} onClick={() => void leerConIA()}>
              ✨ Leer y cuadrar con IA
            </button>
            <button type="button" className="gw-btn h-[30px]" disabled={!proveedor || !!paso} onClick={() => empezar(null)}>
              Cuadrar a mano
            </button>
            {paso && <span className="font-bold text-[#1d3a8a]">{paso}</span>}
            {!proveedor && <span className="text-[#555]">Elige primero el proveedor.</span>}
          </div>
        </>
      )}
      {error && <div className="font-bold text-[#c42b1c]">{error}</div>}

      {revisando && (
        <div className={`grid gap-2 ${pdfUrl ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-end gap-2">
              <GwField label="Qué es">
                <GwSelect className="w-[210px]" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
                  <option value="ABONO">Abono (nos devuelve dinero)</option>
                  <option value="COMPENSACION_GENERO">Compensación con género</option>
                </GwSelect>
              </GwField>
              <GwField label="Nº del documento">
                <GwInput className="w-[150px]" value={docNumero} onChange={(e) => setDocNumero(e.target.value)} />
              </GwField>
              <GwField label="Fecha">
                <GwInput type="date" className="w-[140px]" value={docFecha} onChange={(e) => setDocFecha(e.target.value)} />
              </GwField>
              {esAbono && (
                <>
                  <GwField label="Base">
                    <GwInput className="w-[90px] text-right" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} />
                  </GwField>
                  <GwField label="IGIC">
                    <GwInput className="w-[80px] text-right" inputMode="decimal" value={igic} onChange={(e) => setIgic(e.target.value)} />
                  </GwField>
                  <GwField label="Total">
                    <GwInput className="w-[90px] text-right font-bold" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
                  </GwField>
                </>
              )}
            </div>
            {lectura?.tipo_documento === 'OTRO' && <div className="font-bold text-[#c42b1c]">La IA no reconoce este documento como un abono ni como una reposición de género. Revísalo bien.</div>}
            {!!lectura?.avisos.length && (
              <ul className="border border-[#e0b400] bg-[#fff8dc] p-1.5">
                {lectura.avisos.map((a, i) => (
                  <li key={i}>⚠ {a}</li>
                ))}
              </ul>
            )}

            <div className="overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th} />
                    <th className={th}>Expediente</th>
                    <th className={th}>Artículo</th>
                    <th className={`${th} text-right`}>Cant.</th>
                    <th className={th}>Línea del documento</th>
                    {esAbono && <th className={`${th} text-right`}>Importe</th>}
                    {esAbono && <th className={th}>Se lo llevó</th>}
                  </tr>
                </thead>
                <tbody>
                  {delProveedor.map((f) => {
                    const c = cuadre[f.id]
                    if (!c) return null
                    const l = c.linea
                    const cantidadDistinta = l?.cantidad != null && l.cantidad !== f.cantidad
                    return (
                      <tr key={f.id} className={c.incluir ? 'bg-[#eef9ee]' : ''}>
                        <td className={`${td} text-center`}>
                          <input type="checkbox" checked={c.incluir} aria-label={`Incluir ${f.numero}`} onChange={(e) => cambiar(f.id, { incluir: e.target.checked })} />
                        </td>
                        <td className={`${td} whitespace-nowrap font-bold`}>{f.numero}</td>
                        <td className={td}>
                          {f.articulo_codigo} · {f.articulo_descripcion}
                          {f.articulo_referencia && <span className="text-[#555]"> (ref. {f.articulo_referencia})</span>}
                        </td>
                        <td className={`${td} text-right`}>{cant(f.cantidad)}</td>
                        <td className={td}>
                          {l ? (
                            <>
                              <div>
                                {l.referencia ? `${l.referencia} · ` : ''}
                                {l.descripcion} · <b className={cantidadDistinta ? 'text-[#c42b1c]' : ''}>{cant(l.cantidad)} ud</b>
                              </div>
                              <div style={{ color: COLOR_CONFIANZA[l.confianza] }}>
                                Confianza {l.confianza}: {l.motivo}
                              </div>
                            </>
                          ) : (
                            <span className="text-[#555]">{lectura ? 'No aparece en el documento' : ''}</span>
                          )}
                        </td>
                        {esAbono && (
                          <td className={`${td} text-right`}>
                            <GwInput className="w-[84px] text-right" inputMode="decimal" disabled={!c.incluir} value={c.importe} aria-label={`Importe de ${f.numero}`} onChange={(e) => cambiar(f.id, { importe: e.target.value })} />
                          </td>
                        )}
                        {esAbono && (
                          <td className={`${td} text-center`}>
                            <input type="checkbox" disabled={!c.incluir} checked={c.retirado} aria-label={`El proveedor se llevó ${f.numero}`} onChange={(e) => cambiar(f.id, { retirado: e.target.checked })} />
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {!!sueltas.length && (
              <div className="border border-[var(--gw-border-light)] p-1.5">
                <div className="font-bold">Líneas del documento que no son de ningún expediente</div>
                {sueltas.map((l, i) => (
                  <div key={i}>
                    {l.referencia ? `${l.referencia} · ` : ''}
                    {l.descripcion} · {cant(l.cantidad)} ud · {euros(l.importe)} <span className="text-[#555]">({l.motivo})</span>
                  </div>
                ))}
              </div>
            )}

            {esAbono && (
              <div className="flex flex-wrap gap-x-4 font-bold">
                <span>Expedientes marcados: {euros(suma)}</span>
                {!!sueltas.length && <span>Otras líneas: {euros(sumaSueltas)}</span>}
                <span>Base del documento: {euros(num(base))}</span>
                <span className={diferencia === 0 ? 'text-[#127a12]' : 'text-[#c42b1c]'}>{diferencia === 0 ? '✔ Cuadra' : `✘ Diferencia: ${euros(diferencia)}`}</span>
              </div>
            )}
            <GwField label="Observaciones (opcional)">
              <GwInput className="w-full" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
            </GwField>
            <div className="text-[12px] text-[#555]">
              {esAbono
                ? '«Se lo llevó»: márcalo si el proveedor retiró la mercancía (queda cerrado). Si no, pasa a Almacén para destruir. Al confirmar se da de baja del Almacén 06 y se crea la factura de abono, pendiente de contabilizar.'
                : 'Al confirmar, las unidades pasan del Almacén 06 al 04 (entra el género de reemplazo) y lo roto pasa a Almacén para destruir.'}
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" className="gw-btn h-[30px] w-[190px] font-bold" disabled={!!paso || !elegidos.length} onClick={() => void confirmar()}>
                Confirmar el cuadre ({elegidos.length})
              </button>
              {paso && <span className="font-bold text-[#1d3a8a]">{paso}</span>}
            </div>
          </div>
          {pdfUrl && <iframe title="PDF del proveedor" src={pdfUrl} className="h-[70vh] w-full border border-[var(--gw-border)]" />}
        </div>
      )}
    </div>
  )
}
