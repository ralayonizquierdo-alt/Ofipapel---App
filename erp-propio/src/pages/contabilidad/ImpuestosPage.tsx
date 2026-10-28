import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todasLasFilas } from '../../lib/todasLasFilas'
import { GwField, GwGroup, GwNumber, GwRadio, GwSelect } from '../../components/gw'
import {
  cargarLibro,
  descargarCsv,
  eur0,
  fechaEs,
  finAnio,
  inicioAnio,
  numCsv,
  pct,
  r2,
  rangoTrimestre,
  resumenPorTipo,
  type LineaLibro,
} from './contabModel'
import { Aviso, Barra, Rango, Rejilla, Vacio } from './ui'

const anioActual = new Date().getFullYear()
const trimActual = Math.floor(new Date().getMonth() / 3) + 1

/** Contabilidad → Libros Registro de IGIC (facturas emitidas / recibidas). */
export function LibrosIgicPage() {
  const [libro, setLibro] = useState<'emitidas' | 'recibidas'>('emitidas')
  const [desde, setDesde] = useState(inicioAnio())
  const [hasta, setHasta] = useState(finAnio())
  const [lineas, setLineas] = useState<LineaLibro[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setLineas(await cargarLibro(desde, hasta, libro))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [desde, hasta, libro])

  useEffect(() => {
    cargar()
  }, [cargar])

  const resumen = useMemo(() => resumenPorTipo(lineas), [lineas])
  const tot = resumen.reduce((s, r) => ({ b: s.b + r.base, c: s.c + r.cuota }), { b: 0, c: 0 })

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <GwField label="Libro">
          <div className="flex gap-3 pt-0.5">
            <GwRadio name="libro" label="Facturas emitidas" checked={libro === 'emitidas'} onChange={() => setLibro('emitidas')} />
            <GwRadio name="libro" label="Facturas recibidas" checked={libro === 'recibidas'} onChange={() => setLibro('recibidas')} />
          </div>
        </GwField>
        <Rango desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!lineas.length}
          onClick={() =>
            descargarCsv(
              `libro_igic_${libro}_${desde}_${hasta}.csv`,
              ['Fecha', 'Documento', 'Clase', 'NIF', 'Nombre', 'Tipo IGIC %', 'Base imponible', 'Cuota IGIC', 'Total'],
              lineas.map((l) => [fechaEs(l.fecha), l.documento, l.clase, l.nif ?? '', l.nombre ?? '', l.tipo == null ? '' : numCsv(l.tipo), numCsv(l.base), numCsv(l.cuota), numCsv(l.total)]),
            )
          }
        >
          <Download size={14} /> Excel (CSV)
        </button>
      </Barra>
      <Aviso error={error} />
      <p className="text-[12px] text-[#555]">
        Se obtiene de los documentos (no de los asientos). {libro === 'emitidas'
          ? 'Los tickets sin factura van resumidos por día, tienda y tipo; los albaranes entran con su factura mensual.'
          : 'El IGIC de cada factura de proveedor se reparte por tipo con las líneas de sus pedidos.'}
      </p>
      <Rejilla alto="calc(100vh - 400px)">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[85px]">Fecha</th>
              <th className="w-[170px]">Documento</th>
              <th className="w-[90px]">Clase</th>
              <th className="w-[100px]">NIF</th>
              <th>Nombre</th>
              <th className="w-[60px] text-right!">Tipo</th>
              <th className="w-[110px] text-right!">Base</th>
              <th className="w-[100px] text-right!">Cuota</th>
              <th className="w-[110px] text-right!">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && <Vacio cols={9} />}
            {lineas.map((l, i) => (
              <tr key={i}>
                <td>{fechaEs(l.fecha)}</td>
                <td className="truncate">{l.documento}</td>
                <td>{l.clase}</td>
                <td>{l.nif}</td>
                <td className="truncate">{l.nombre}</td>
                <td className={`text-right ${l.tipo == null ? 'font-bold text-[#c42b1c]' : ''}`}>{pct(l.tipo)}</td>
                <td className="text-right">{eur0(l.base)}</td>
                <td className="text-right">{eur0(l.cuota)}</td>
                <td className="text-right">{eur0(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rejilla>
      <ResumenTipos titulo="Resumen por tipo" filas={resumen} total={{ base: tot.b, cuota: tot.c }} />
    </div>
  )
}

function ResumenTipos({ titulo, filas, total }: { titulo: string; filas: ReturnType<typeof resumenPorTipo>; total: { base: number; cuota: number } }) {
  return (
    <GwGroup title={titulo}>
      <table className="gw-grid max-w-[560px]">
        <thead>
          <tr>
            <th>Tipo IGIC</th>
            <th className="text-right!">Registros</th>
            <th className="text-right!">Base imponible</th>
            <th className="text-right!">Cuota</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <Vacio cols={4} texto="Sin operaciones." />}
          {filas.map((r) => (
            <tr key={String(r.tipo)} className={r.tipo == null ? 'font-bold text-[#c42b1c]' : ''}>
              <td>{r.tipo == null ? 'Tipo no reconocido (revisar)' : pct(r.tipo)}</td>
              <td className="text-right">{r.n}</td>
              <td className="text-right">{eur0(r.base)}</td>
              <td className="text-right">{eur0(r.cuota)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={2} className="text-right">
              Total
            </td>
            <td className="text-right">{eur0(total.base)}</td>
            <td className="text-right">{eur0(total.cuota)}</td>
          </tr>
        </tfoot>
      </table>
    </GwGroup>
  )
}

function AnioTrimestre({ anio, onAnio, trim, onTrim }: { anio: number; onAnio: (n: number) => void; trim?: number; onTrim?: (n: number) => void }) {
  return (
    <>
      <GwField label="Ejercicio">
        <GwNumber value={anio} decimals={0} onChange={(v) => v && onAnio(Math.trunc(v))} className="w-[70px]" />
      </GwField>
      {onTrim && (
        <GwField label="Trimestre">
          <GwSelect value={trim} onChange={(e) => onTrim(Number(e.target.value))} className="w-[150px]">
            <option value={1}>1T (enero-marzo)</option>
            <option value={2}>2T (abril-junio)</option>
            <option value={3}>3T (julio-septiembre)</option>
            <option value={4}>4T (octubre-diciembre)</option>
          </GwSelect>
        </GwField>
      )}
    </>
  )
}

async function liquidacion(desde: string, hasta: string) {
  const [em, re] = await Promise.all([cargarLibro(desde, hasta, 'emitidas'), cargarLibro(desde, hasta, 'recibidas')])
  const dev = resumenPorTipo(em)
  const sop = resumenPorTipo(re)
  const cuotaDev = r2(dev.reduce((s, r) => s + r.cuota, 0))
  const cuotaSop = r2(sop.reduce((s, r) => s + r.cuota, 0))
  return {
    dev,
    sop,
    baseDev: r2(dev.reduce((s, r) => s + r.base, 0)),
    baseSop: r2(sop.reduce((s, r) => s + r.base, 0)),
    cuotaDev,
    cuotaSop,
    resultado: r2(cuotaDev - cuotaSop),
    pendientes: [...dev, ...sop].filter((r) => r.tipo == null).length,
  }
}
type Liq = Awaited<ReturnType<typeof liquidacion>>

function Liquidacion({ l, titulo }: { l: Liq; titulo: string }) {
  return (
    <>
      {l.pendientes > 0 && (
        <p className="font-bold text-[#c42b1c]">Hay documentos con tipo de IGIC no reconocido: revísalos en Libros Registro de IGIC antes de presentar.</p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <ResumenTipos titulo="IGIC devengado (repercutido)" filas={l.dev} total={{ base: l.baseDev, cuota: l.cuotaDev }} />
        <ResumenTipos titulo="IGIC deducible (soportado en operaciones interiores)" filas={l.sop} total={{ base: l.baseSop, cuota: l.cuotaSop }} />
      </div>
      <GwGroup title={titulo}>
        <div className="flex flex-wrap gap-6 text-[14px]">
          <span>
            Total cuotas devengadas: <b>{eur0(l.cuotaDev)}</b>
          </span>
          <span>
            Total a deducir: <b>{eur0(l.cuotaSop)}</b>
          </span>
          <span className={l.resultado < 0 ? 'font-bold text-[#c42b1c]' : 'font-bold text-[#127a12]'}>
            Resultado: {eur0(l.resultado)} {l.resultado < 0 ? '(a compensar / devolver)' : '(a ingresar)'}
          </span>
        </div>
      </GwGroup>
    </>
  )
}

function csvLiq(nombre: string, l: Liq) {
  const filas: unknown[][] = [
    ...l.dev.map((r) => ['Devengado', r.tipo == null ? '' : numCsv(r.tipo), numCsv(r.base), numCsv(r.cuota)]),
    ...l.sop.map((r) => ['Deducible', r.tipo == null ? '' : numCsv(r.tipo), numCsv(r.base), numCsv(r.cuota)]),
    ['Total devengado', '', numCsv(l.baseDev), numCsv(l.cuotaDev)],
    ['Total deducible', '', numCsv(l.baseSop), numCsv(l.cuotaSop)],
    ['Resultado', '', '', numCsv(l.resultado)],
  ]
  descargarCsv(nombre, ['Concepto', 'Tipo IGIC %', 'Base imponible', 'Cuota'], filas)
}

/** Contabilidad → Modelo 420 (autoliquidación trimestral de IGIC). */
export function Modelo420Page() {
  const [anio, setAnio] = useState(anioActual)
  const [trim, setTrim] = useState(trimActual)
  const [l, setL] = useState<Liq | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [desde, hasta] = rangoTrimestre(anio, trim)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setL(await liquidacion(desde, hasta))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [desde, hasta])
  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <AnioTrimestre anio={anio} onAnio={setAnio} trim={trim} onTrim={setTrim} />
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Calcular
        </button>
        <button type="button" className="gw-btn" disabled={!l} onClick={() => l && csvLiq(`modelo420_${anio}_${trim}T.csv`, l)}>
          <Download size={14} /> Excel (CSV)
        </button>
        <span className="mb-1 text-[12px] text-[#555]">
          Del {fechaEs(desde)} al {fechaEs(hasta)} · Datos para rellenar el 420 en la sede de la ATC (no genera el fichero oficial).
        </span>
      </Barra>
      <Aviso error={error} />
      {l && <Liquidacion l={l} titulo={`Resultado del ${trim}T ${anio}`} />}
    </div>
  )
}

/** Contabilidad → Modelo 425 (resumen anual de IGIC). */
export function Modelo425Page() {
  const [anio, setAnio] = useState(anioActual)
  const [l, setL] = useState<Liq | null>(null)
  const [trims, setTrims] = useState<Liq[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [total, ...ts] = await Promise.all([liquidacion(inicioAnio(anio), finAnio(anio)), ...[1, 2, 3, 4].map((t) => liquidacion(...rangoTrimestre(anio, t)))])
      setL(total)
      setTrims(ts)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [anio])
  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <AnioTrimestre anio={anio} onAnio={setAnio} />
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Calcular
        </button>
        <button type="button" className="gw-btn" disabled={!l} onClick={() => l && csvLiq(`modelo425_${anio}.csv`, l)}>
          <Download size={14} /> Excel (CSV)
        </button>
        <span className="mb-1 text-[12px] text-[#555]">Resumen anual · datos para el 425 de la ATC (no genera el fichero oficial).</span>
      </Barra>
      <Aviso error={error} />
      {l && <Liquidacion l={l} titulo={`Resultado anual ${anio}`} />}
      <GwGroup title="Resultado de cada trimestre (debe coincidir con los 420 presentados)">
        <table className="gw-grid max-w-[620px]">
          <thead>
            <tr>
              <th>Trimestre</th>
              <th className="text-right!">Devengado</th>
              <th className="text-right!">Deducible</th>
              <th className="text-right!">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {trims.map((t, i) => (
              <tr key={i}>
                <td>{i + 1}T</td>
                <td className="text-right">{eur0(t.cuotaDev)}</td>
                <td className="text-right">{eur0(t.cuotaSop)}</td>
                <td className="text-right font-bold">{eur0(t.resultado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GwGroup>
    </div>
  )
}

interface Fila347 {
  clave: string
  codigo: string
  nif: string | null
  nombre: string | null
  t1: number
  t2: number
  t3: number
  t4: number
  total: number
}

/** Contabilidad → Modelo 347 (operaciones con terceros > 3.005,06 €). */
export function Modelo347Page() {
  const [anio, setAnio] = useState(anioActual)
  const [filas, setFilas] = useState<Fila347[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    // Supabase corta cada respuesta en 1000 filas, también en las funciones: por bloques.
    const { data, error: e } = await todasLasFilas(() => supabase.rpc('fn_contab_347', { p_ejercicio: anio }), { tope: 500000 })
    if (e) return setError(e)
    setFilas((data ?? []) as Fila347[])
  }, [anio])
  useEffect(() => {
    cargar()
  }, [cargar])

  const sinNif = filas.filter((f) => !f.nif).length

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <AnioTrimestre anio={anio} onAnio={setAnio} />
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Calcular
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!filas.length}
          onClick={() =>
            descargarCsv(
              `modelo347_${anio}.csv`,
              ['Clave', 'Código', 'NIF', 'Nombre', '1T', '2T', '3T', '4T', 'Total anual'],
              filas.map((f) => [f.clave, f.codigo, f.nif ?? '', f.nombre ?? '', numCsv(f.t1), numCsv(f.t2), numCsv(f.t3), numCsv(f.t4), numCsv(f.total)]),
            )
          }
        >
          <Download size={14} /> Excel (CSV)
        </button>
        <span className="mb-1 text-[12px] text-[#555]">
          Clave A = compras (facturas de proveedor) · B = ventas (facturas y tickets de clientes identificados). Importes con IGIC.
        </span>
      </Barra>
      <Aviso error={error ?? (sinNif ? `${sinNif} tercero(s) sin NIF en su ficha: complétalo antes de presentar.` : null)} />
      <Rejilla alto="calc(100vh - 290px)">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[50px]">Clave</th>
              <th className="w-[80px]">Código</th>
              <th className="w-[110px]">NIF</th>
              <th>Nombre</th>
              <th className="w-[100px] text-right!">1T</th>
              <th className="w-[100px] text-right!">2T</th>
              <th className="w-[100px] text-right!">3T</th>
              <th className="w-[100px] text-right!">4T</th>
              <th className="w-[110px] text-right!">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <Vacio cols={9} texto="Ningún cliente ni proveedor supera los 3.005,06 € en el ejercicio." />}
            {filas.map((f) => (
              <tr key={f.clave + f.codigo}>
                <td>{f.clave}</td>
                <td>{f.codigo}</td>
                <td className={f.nif ? '' : 'bg-[#fde7e9]'}>{f.nif}</td>
                <td className="truncate">{f.nombre}</td>
                <td className="text-right">{eur0(f.t1)}</td>
                <td className="text-right">{eur0(f.t2)}</td>
                <td className="text-right">{eur0(f.t3)}</td>
                <td className="text-right">{eur0(f.t4)}</td>
                <td className="text-right font-bold">{eur0(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rejilla>
    </div>
  )
}
