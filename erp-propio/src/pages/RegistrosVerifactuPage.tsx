import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatGw } from '../components/gw'
import { verificarCadena, type RegistroFacturacion, type ResultadoVerificacion } from '../lib/verifactu'

/**
 * Facturación → Registros VeriFactu. Consulta la cadena de registros de facturación (alta y
 * anulación) que genera la base de datos y la verifica: recalcula cada huella en el navegador
 * (implementación independiente de la de la BD) y comprueba que cada huella_anterior coincide
 * con la huella del registro previo del mismo emisor.
 */
export function RegistrosVerifactuPage() {
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroFacturacion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [verif, setVerif] = useState<Map<number, ResultadoVerificacion> | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [entorno, setEntorno] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    setVerif(null)
    // Toda la cadena, en orden (la verificación necesita todos los registros)
    const todos: RegistroFacturacion[] = []
    for (let desde = 0; ; desde += 1000) {
      const { data, error: e } = await supabase
        .from('registro_facturacion')
        .select('*')
        .order('id', { ascending: true })
        .range(desde, desde + 999)
      if (e) {
        setError(e.message)
        break
      }
      todos.push(...((data ?? []) as RegistroFacturacion[]))
      if (!data || data.length < 1000) break
    }
    setRegistros(todos)
  }, [])

  useEffect(() => {
    cargar()
    supabase
      .from('verifactu_configuracion')
      .select('entorno')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => setEntorno(data?.entorno ?? null))
  }, [cargar])

  async function verificar() {
    if (!registros) return
    setVerificando(true)
    const res = await verificarCadena(registros)
    setVerif(new Map(res.map((r) => [r.id, r])))
    setVerificando(false)
  }

  const resumen = useMemo(() => {
    if (!verif || !registros) return null
    const malos = [...verif.values()].filter((r) => !r.huellaOk || !r.encadenadoOk)
    return { total: registros.length, malos: malos.length, primero: malos[0]?.id ?? null }
  }, [verif, registros])

  // Más recientes arriba, como el resto de rejillas
  const filas = useMemo(() => (registros ? [...registros].reverse() : []), [registros])
  const actual = filas.find((r) => r.id === sel) ?? null

  function abrirOrigen(r: RegistroFacturacion) {
    if (r.origen_tipo === 'venta') navigate(`/ventas/${r.origen_tienda_codigo}/${r.origen_numero}`)
    else navigate(`/facturacion/${r.origen_tienda_codigo}/${r.origen_numero}`)
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="gw-btn" onClick={verificar} disabled={!registros || verificando}>
          <ShieldCheck size={14} /> {verificando ? 'Verificando…' : 'Verificar cadena'}
        </button>
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar
        </button>
        {resumen && (
          <span className={resumen.malos ? 'font-bold text-[#c42b1c]' : 'font-bold text-[#127a12]'} role="status">
            {resumen.malos
              ? `Cadena ROTA: ${resumen.malos} de ${resumen.total} registros no cuadran (primero: nº ${resumen.primero}).`
              : `Cadena correcta: ${resumen.total} registros, todas las huellas y encadenados coinciden.`}
          </span>
        )}
        <span className="ml-auto text-[12px] text-[#555]">
          Entorno QR: <b>{entorno === 'produccion' ? 'producción (AEAT)' : 'PRUEBAS (preproducción AEAT)'}</b> · Envío a la AEAT: pendiente
          (sin certificado)
        </span>
      </div>
      {error && (
        <p className="text-[#c42b1c]" role="alert">
          {error}
        </p>
      )}
      <div className="max-h-[calc(100vh-330px)] min-h-[200px] overflow-auto border border-[var(--gw-border)]">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th>Nº</th>
              <th>Registro</th>
              <th>Origen</th>
              <th>Nº serie factura</th>
              <th>Fecha exp.</th>
              <th>Tipo</th>
              <th className="text-right!">Cuota</th>
              <th className="text-right!">Importe</th>
              <th>Huella</th>
              <th>Huella anterior</th>
              <th>Envío AEAT</th>
              {verif && <th>Verificación</th>}
            </tr>
          </thead>
          <tbody>
            {registros && filas.length === 0 && (
              <tr>
                <td colSpan={12} className="text-[#555]">
                  Todavía no hay registros VeriFactu.
                </td>
              </tr>
            )}
            {filas.map((r) => {
              const v = verif?.get(r.id)
              return (
                <tr
                  key={r.id}
                  className={sel === r.id ? 'gw-selected' : ''}
                  onClick={() => setSel(r.id)}
                  onDoubleClick={() => abrirOrigen(r)}
                  title="Doble clic: abrir el documento"
                >
                  <td className="text-right">{r.id}</td>
                  <td className={r.tipo_registro === 'anulacion' ? 'font-bold text-[#c42b1c]' : ''}>
                    {r.tipo_registro === 'alta' ? 'Alta' : 'Anulación'}
                  </td>
                  <td>
                    {r.origen_tipo === 'venta' ? 'Venta' : 'Factura'} {r.origen_tienda_codigo}-{r.origen_numero}
                  </td>
                  <td className="font-mono">{r.num_serie_factura}</td>
                  <td>{new Date(`${r.fecha_expedicion}T00:00:00`).toLocaleDateString('es-ES')}</td>
                  <td>
                    {r.tipo_factura ?? ''}
                    {r.rectificada_num_serie ? ` → ${r.rectificada_num_serie}` : ''}
                  </td>
                  <td className="text-right">{r.cuota_total == null ? '' : formatGw(Number(r.cuota_total), 2)}</td>
                  <td className="text-right">{r.importe_total == null ? '' : formatGw(Number(r.importe_total), 2)}</td>
                  <td className="font-mono" title={r.huella}>
                    {r.huella.slice(0, 12)}…
                  </td>
                  <td className="font-mono" title={r.huella_anterior ?? ''}>
                    {r.huella_anterior ? `${r.huella_anterior.slice(0, 12)}…` : '(inicio)'}
                  </td>
                  <td>{r.estado_envio_aeat}</td>
                  {verif && (
                    <td className={v && v.huellaOk && v.encadenadoOk ? 'text-[#127a12]' : 'font-bold text-[#c42b1c]'}>
                      {v ? (v.huellaOk && v.encadenadoOk ? 'OK' : `${v.huellaOk ? '' : 'huella mal '}${v.encadenadoOk ? '' : 'encadenado mal'}`) : ''}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {actual && (
        <div className="grid grid-cols-[150px_1fr] gap-x-2 gap-y-0.5 border border-[var(--gw-border-light)] bg-white p-2 text-[12px]">
          <span className="text-[#555]">Emisor</span>
          <span className="font-mono">{actual.id_emisor}</span>
          <span className="text-[#555]">Generado</span>
          <span className="font-mono">{actual.fecha_hora_huso_texto}</span>
          <span className="text-[#555]">Huella</span>
          <span className="break-all font-mono">{actual.huella}</span>
          <span className="text-[#555]">Huella anterior</span>
          <span className="break-all font-mono">{actual.huella_anterior ?? '(primer registro de la cadena)'}</span>
          {actual.codigo_qr_contenido && (
            <>
              <span className="text-[#555]">QR</span>
              <span className="break-all font-mono">{actual.codigo_qr_contenido}</span>
            </>
          )}
          {actual.motivo && (
            <>
              <span className="text-[#555]">Motivo</span>
              <span>{actual.motivo}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
