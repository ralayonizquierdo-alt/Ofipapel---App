// Archivo → Carga Cotización. SIN CAPTURA de GeminisWin: actualiza la cotización de las monedas
// (tabla `moneda`, unidades de la moneda por 1 € de la empresa, como en su ficha) a mano en una
// rejilla o con los tipos de referencia diarios del Banco Central Europeo. Al guardar se pone la
// fecha de actualización en la moneda y se apunta cada cambio en `moneda_cotizacion`.
//
// El BCE no deja leer su fichero desde otra web (no envía cabeceras CORS): se pide a través de
// la propia web del ERP (/bce/…, regla en public/_redirects; en desarrollo, el proxy de Vite).
// Si no responde, la carga manual sigue funcionando.
//
// Una moneda casa con el BCE por su código o por su descripción corta (código ISO: USD, GBP…).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Save } from 'lucide-react'
import { GwCheck, GwDate, GwGroup, GwNumber, formatGw } from '../../components/gw'
import { supabase } from '../../lib/supabase'
import { useParametros } from '../../lib/parametros'
import { Mensaje } from '../utilidades/comun'
import { fechaEs } from '../../components/gw/GwListado'
import { hoy } from './comun'

interface Fila {
  codigo: string
  descripcion: string
  descripcion_corta: string | null
  valor_billete: number | null
  valor_cheque: number | null
  fecha_actualizacion: string | null
  activo: boolean
}

interface Bce {
  fecha: string
  tipos: Record<string, number>
}

const URL_BCE = 'bce/eurofxref-daily.xml'

/** Lee el fichero diario del BCE: <Cube time="AAAA-MM-DD"><Cube currency="USD" rate="1.08"/>… */
async function leerBce(): Promise<Bce> {
  const r = await fetch(`${import.meta.env.BASE_URL}${URL_BCE}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`El BCE no responde (HTTP ${r.status})`)
  const texto = await r.text()
  if (!texto.includes('Cube')) throw new Error('La respuesta no es el fichero de tipos del BCE')
  const doc = new DOMParser().parseFromString(texto, 'application/xml')
  const cubos = Array.from(doc.getElementsByTagName('Cube'))
  const fecha = cubos.find((c) => c.getAttribute('time'))?.getAttribute('time') ?? hoy()
  const tipos: Record<string, number> = { EUR: 1 }
  for (const c of cubos) {
    const m = c.getAttribute('currency')
    const v = Number(c.getAttribute('rate'))
    if (m && Number.isFinite(v)) tipos[m.toUpperCase()] = v
  }
  return { fecha, tipos }
}

const iso = (f: Fila) => [f.codigo, f.descripcion_corta ?? ''].map((x) => x.trim().toUpperCase()).find((x) => /^[A-Z]{3}$/.test(x)) ?? null

export function CargaCotizacionPage() {
  const navigate = useNavigate()
  const { moneda_empresa } = useParametros()
  const [filas, setFilas] = useState<Fila[]>([])
  const [orig, setOrig] = useState<Record<string, Fila>>({})
  const [sel, setSel] = useState<string | null>(null)
  const [verBajas, setVerBajas] = useState(false)
  const [fecha, setFecha] = useState(hoy())
  const [bce, setBce] = useState<Bce | null>(null)
  const [cargandoBce, setCargandoBce] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('moneda')
      .select('codigo, descripcion, descripcion_corta, valor_billete, valor_cheque, fecha_actualizacion, activo')
      .order('codigo')
    if (error) return setMensaje({ texto: error.message, error: true })
    const l = ((data ?? []) as Fila[]).map((f) => ({ ...f, valor_billete: f.valor_billete == null ? null : Number(f.valor_billete), valor_cheque: f.valor_cheque == null ? null : Number(f.valor_cheque) }))
    setFilas(l)
    setOrig(Object.fromEntries(l.map((f) => [f.codigo, f])))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const visibles = useMemo(() => filas.filter((f) => verBajas || f.activo), [filas, verBajas])
  const cambiadas = filas.filter((f) => {
    const o = orig[f.codigo]
    return o && (o.valor_billete !== f.valor_billete || o.valor_cheque !== f.valor_cheque)
  })

  const set = (codigo: string, p: Partial<Fila>) => setFilas((l) => l.map((f) => (f.codigo === codigo ? { ...f, ...p } : f)))

  async function pedirBce() {
    setCargandoBce(true)
    setMensaje(null)
    try {
      const b = await leerBce()
      setBce(b)
      setFecha(b.fecha)
      setMensaje({ texto: `Tipos del BCE del ${fechaEs(b.fecha)} cargados (${Object.keys(b.tipos).length - 1} monedas). Pulse «Aplicar BCE» para pasarlos a la rejilla.` })
    } catch (e) {
      setMensaje({
        texto: `No se pudieron leer los tipos del BCE: ${e instanceof Error ? e.message : String(e)}. Puede teclear la cotización a mano en la rejilla.`,
        error: true,
      })
    } finally {
      setCargandoBce(false)
    }
  }

  /** Pasa a la rejilla la cotización del BCE frente a la moneda de la empresa. */
  function aplicarBce() {
    if (!bce) return
    const base = bce.tipos[moneda_empresa.toUpperCase()]
    if (!base) return setMensaje({ texto: `El BCE no publica la moneda de la empresa (${moneda_empresa}).`, error: true })
    let n = 0
    setFilas((l) =>
      l.map((f) => {
        const c = iso(f)
        const t = c ? bce.tipos[c] : undefined
        if (!f.activo || t == null) return f
        n++
        const v = Math.round((t / base) * 1e6) / 1e6
        return { ...f, valor_billete: v, valor_cheque: v }
      }),
    )
    setMensaje({ texto: n ? `Aplicada la cotización del BCE a ${n} moneda(s). Revise y pulse Guardar.` : 'Ninguna moneda activa casa con el BCE (código o descripción corta con el código ISO: USD, GBP…).' })
  }

  async function guardar() {
    if (!cambiadas.length) return setMensaje({ texto: 'No hay cambios que guardar.' })
    if (cambiadas.some((f) => (f.valor_billete ?? 0) < 0 || (f.valor_cheque ?? 0) < 0)) return setMensaje({ texto: 'La cotización no puede ser negativa.', error: true })
    setGuardando(true)
    const fuente = bce && cambiadas.every((f) => bce.tipos[iso(f) ?? ''] != null) ? 'bce' : 'manual'
    for (const f of cambiadas) {
      const { error } = await supabase.from('moneda').update({ valor_billete: f.valor_billete, valor_cheque: f.valor_cheque, fecha_actualizacion: fecha }).eq('codigo', f.codigo)
      if (error) {
        setGuardando(false)
        return setMensaje({ texto: `${f.codigo}: ${error.message}`, error: true })
      }
    }
    const { error } = await supabase
      .from('moneda_cotizacion')
      .insert(cambiadas.map((f) => ({ moneda_codigo: f.codigo, fecha, valor_billete: f.valor_billete, valor_cheque: f.valor_cheque, fuente })))
    const n = cambiadas.length
    await cargar()
    setGuardando(false)
    setMensaje(error ? { texto: `Cotización guardada, pero no se pudo apuntar el histórico: ${error.message}`, error: true } : { texto: `Cotización de ${n} moneda(s) guardada con fecha ${fechaEs(fecha)}.` })
  }

  return (
    <div className="flex w-[900px] max-w-full flex-col gap-1.5 text-[12px]">
      <GwGroup title="Origen de la cotización">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="gw-btn" onClick={pedirBce} disabled={cargandoBce}>
            <Download size={14} /> {cargandoBce ? 'Leyendo…' : 'Leer tipos del BCE'}
          </button>
          <button type="button" className="gw-btn" onClick={aplicarBce} disabled={!bce}>
            Aplicar BCE
          </button>
          <span className="gw-label">Fecha de actualización:</span>
          <GwDate value={fecha} onChange={(v) => setFecha(v ?? hoy())} style={{ width: 100 }} />
          <span className="gw-label">Moneda de la empresa: {moneda_empresa}</span>
          <span className="flex-1" />
          <GwCheck label="Ver monedas de baja" checked={verBajas} onChange={setVerBajas} />
        </div>
      </GwGroup>
      {mensaje && <Mensaje texto={mensaje.texto} error={mensaje.error} />}
      <div className="h-[380px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[70px]">Código</th>
              <th>Descripción</th>
              <th className="w-[70px]">D. Corta</th>
              <th className="w-[130px] text-right!">Valor Billete</th>
              <th className="w-[130px] text-right!">Valor Cheque</th>
              <th className="w-[100px] text-right!">BCE</th>
              <th className="w-[90px]">Actualizada</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const c = iso(f)
              const t = bce && c ? bce.tipos[c] : undefined
              const base = bce?.tipos[moneda_empresa.toUpperCase()]
              const cambiada = cambiadas.includes(f)
              return (
                <tr key={f.codigo} className={`${f.codigo === sel ? 'gw-selected' : ''} ${f.activo ? '' : 'text-[#888]'}`} onClick={() => setSel(f.codigo)}>
                  <td>{f.codigo}</td>
                  <td className="truncate">
                    {f.descripcion}
                    {!f.activo && ' (baja)'}
                  </td>
                  <td>{f.descripcion_corta}</td>
                  <td className={`p-0! ${cambiada ? 'bg-[#fff6d5]' : ''}`}>
                    <GwNumber className="h-[20px]! w-full! border-0!" value={f.valor_billete} decimals={6} emptyAsZero onChange={(v) => set(f.codigo, { valor_billete: v })} />
                  </td>
                  <td className={`p-0! ${cambiada ? 'bg-[#fff6d5]' : ''}`}>
                    <GwNumber className="h-[20px]! w-full! border-0!" value={f.valor_cheque} decimals={6} emptyAsZero onChange={(v) => set(f.codigo, { valor_cheque: v })} />
                  </td>
                  <td className="text-right tabular-nums">{t != null && base ? formatGw(t / base, 6) : ''}</td>
                  <td>{fechaEs(f.fecha_actualizacion)}</td>
                </tr>
              )
            })}
            {!visibles.length && (
              <tr>
                <td colSpan={7} className="py-3 text-center text-[#666]">
                  No hay monedas. Se dan de alta en Archivo → Monedas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="gw-label">
          {cambiadas.length ? `${cambiadas.length} moneda(s) modificada(s) sin guardar` : 'Cotización: unidades de cada moneda por 1 € de la empresa'}
        </span>
        <span className="flex-1" />
        <button type="button" className="gw-btn w-[100px]" onClick={guardar} disabled={guardando || !cambiadas.length}>
          <Save size={14} /> Guardar
        </button>
        <button type="button" className="gw-btn w-[100px]" onClick={() => (cambiadas.length ? cargar() : undefined)} disabled={!cambiadas.length}>
          Cancelar
        </button>
        <button type="button" className="gw-btn w-[100px]" onClick={() => navigate('/')}>
          Salir
        </button>
      </div>
    </div>
  )
}
