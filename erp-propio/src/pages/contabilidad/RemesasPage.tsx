// Contabilidad → Remesas SEPA (Luis, 01/11/2026). Pestañas:
// · Nueva remesa: recibos domiciliados pendientes (vencimientos de facturas con forma de pago de
//   domiciliación) hasta una fecha; se marcan y se crea la remesa. Los que no tienen mandato salen en rojo.
// · Remesas: las creadas; «Descargar fichero SEPA» genera el XML (pain.008) para subirlo a la web del
//   banco; «Marcar enviada»; «Anular». Al llegar el abono en el Norma 43, la Conciliación la casa sola
//   y cobra todos los recibos.
// · Devoluciones: recibos devueltos por el banco (la Conciliación los vuelve a dejar pendientes) para
//   llamar al cliente.
// · Mandatos: IBAN y mandato SEPA de cada cliente (cuando se cargue GeminisWin entero vendrán de allí).
// · Datos SEPA: IBAN, BIC e Identificador de Acreedor de cada cuenta de la empresa.
// Datos: migración 20261101_remesas_sepa.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Download, FilePlus2, Save, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { GwDate, GwField, GwGroup, GwInput, GwSelect } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { eur0, fechaEs, isoDe } from './contabModel'
import { Aviso, Barra, Rejilla, Vacio } from './ui'
import { descargarXml, ibanValido, xmlRemesa, type DatosRemesa } from './sepa'

type Pestana = 'nueva' | 'remesas' | 'devoluciones' | 'mandatos' | 'datos'

interface Banco {
  id: number
  nombre: string
  cuenta_contable: string
  iban: string | null
  bic: string | null
  acreedor_id: string | null
  activo: boolean
}
interface Candidato {
  tienda: string
  codigo: number
  cliente_codigo: string
  cliente_nombre: string | null
  factura: string | null
  concepto: string | null
  vencimiento: string
  importe: number
  mandato_ref: string | null
  iban_final: string | null
  tipo: string | null
  problema: string | null
}
interface Remesa {
  id: number
  referencia: string
  banco_cuenta_id: number
  fecha_creacion: string
  fecha_cargo: string
  estado: string
  num_recibos: number
  total: number
  abonada_en: string | null
  comision: number | null
}
interface Recibo {
  id: number
  e2e: string
  cliente_codigo: string
  importe: number
  vencimiento: string | null
  concepto: string | null
  estado: string
}
interface Mandato {
  id: number
  cliente_codigo: string
  iban: string
  bic: string | null
  titular: string | null
  referencia: string
  fecha_firma: string
  tipo: 'CORE' | 'B2B'
  activo: boolean
}
interface Devolucion {
  id: number
  e2e: string
  cliente_codigo: string
  cliente_nombre: string | null
  telefono: string | null
  importe: number
  devuelto_en: string
  gasto: number | null
  referencia: string
  veces: number
  decision: string[] | null
  decision_por: string | null
  decision_en: string | null
  decision_nota: string | null
  bloqueado: boolean
  credito_bloqueado: boolean
}

const ESTADO: Record<string, string> = {
  preparada: '📝 Preparada',
  generada: '📄 Fichero generado',
  enviada: '📤 Enviada al banco',
  abonada: '✔ Abonada',
  anulada: '✖ Anulada',
}
const sumarDias = (d: number) => {
  const x = new Date()
  x.setDate(x.getDate() + d)
  return isoDe(x)
}
const ibanOculto = (iban: string) => (iban.length > 8 ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : iban)

export function RemesasPage() {
  const [pestana, setPestana] = useState<Pestana>(() => (new URLSearchParams(window.location.search).get('pestana') as Pestana) || 'nueva')
  const [bancos, setBancos] = useState<Banco[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState(false)

  const cargarBancos = useCallback(async () => {
    const { data, error: e } = await supabase.from('banco_cuenta').select('id, nombre, cuenta_contable, iban, bic, acreedor_id, activo').order('nombre')
    if (e) return setError(e.message)
    setBancos((data ?? []) as Banco[])
  }, [])
  useEffect(() => {
    void cargarBancos()
  }, [cargarBancos])

  const avisar = (e: string | null, o: string | null = null) => {
    setError(e)
    setOk(o)
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        {(
          [
            ['nueva', 'Nueva remesa'],
            ['remesas', 'Remesas'],
            ['devoluciones', 'Devoluciones'],
            ['mandatos', 'Mandatos de clientes'],
            ['datos', 'Datos SEPA de la empresa'],
          ] as [Pestana, string][]
        ).map(([p, t]) => (
          <button key={p} type="button" className={`gw-btn ${pestana === p ? 'bg-[#91c9f7] font-bold' : ''}`} onClick={() => setPestana(p)}>
            {t}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" className="gw-btn" onClick={() => setAyuda((a) => !a)}>
          Operativa
        </button>
      </Barra>
      <Aviso error={error} ok={ok} />
      {ayuda && <OperativaRemesas />}
      {pestana === 'nueva' && <NuevaRemesa bancos={bancos} avisar={avisar} onCreada={() => setPestana('remesas')} />}
      {pestana === 'remesas' && <ListaRemesas bancos={bancos} avisar={avisar} />}
      {pestana === 'devoluciones' && <Devoluciones avisar={avisar} />}
      {pestana === 'mandatos' && <Mandatos avisar={avisar} />}
      {pestana === 'datos' && <DatosSepa bancos={bancos} avisar={avisar} onCambio={cargarBancos} />}
    </div>
  )
}

type Avisar = (e: string | null, o?: string | null) => void

function NuevaRemesa({ bancos, avisar, onCreada }: { bancos: Banco[]; avisar: Avisar; onCreada: () => void }) {
  const [hasta, setHasta] = useState(sumarDias(7))
  const [cargo, setCargo] = useState(sumarDias(3))
  const [bancoId, setBancoId] = useState<number | null>(null)
  const [lista, setLista] = useState<Candidato[]>([])
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const clave = (c: Candidato) => `${c.tienda}|${c.codigo}`

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('fn_remesa_candidatos', { p_hasta: hasta })
    if (e) return avisar(e.message)
    const l = (data ?? []) as Candidato[]
    setLista(l)
    setMarcados(new Set(l.filter((c) => !c.problema).map(clave)))
  }, [hasta, avisar])
  useEffect(() => {
    void cargar()
  }, [cargar])
  useEffect(() => {
    if (bancoId == null && bancos.length) setBancoId(bancos.find((b) => b.activo && b.iban && b.acreedor_id)?.id ?? bancos[0].id)
  }, [bancos, bancoId])

  const elegidos = lista.filter((c) => marcados.has(clave(c)))
  const total = elegidos.reduce((s, c) => s + Number(c.importe), 0)
  const conProblema = lista.filter((c) => c.problema).length

  const crear = async () => {
    const { error: e } = await supabase.rpc('fn_remesa_crear', {
      p_banco: bancoId,
      p_fecha_cargo: cargo,
      p_recibos: elegidos.map((c) => ({ tienda: c.tienda, codigo: c.codigo })),
    })
    if (e) return avisar(e.message)
    avisar(null, `Remesa creada con ${elegidos.length} recibos (${eur0(total)} €). Ahora descarga el fichero y súbelo a la web del banco.`)
    onCreada()
  }

  return (
    <>
      <Barra>
        <GwField label="Recibos que vencen hasta">
          <GwDate value={hasta} onChange={(v) => v && setHasta(v)} className="w-[100px]" />
        </GwField>
        <GwField label="Cuenta del cobro">
          <GwSelect value={bancoId ?? ''} onChange={(e) => setBancoId(Number(e.target.value) || null)} className="w-[220px]">
            {bancos.length === 0 && <option value="">(da de alta la cuenta en Conciliación)</option>}
            {bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
                {!b.iban || !b.acreedor_id ? ' (faltan datos SEPA)' : ''}
              </option>
            ))}
          </GwSelect>
        </GwField>
        <GwField label="Fecha de cargo al cliente">
          <GwDate value={cargo} onChange={(v) => v && setCargo(v)} className="w-[100px]" />
        </GwField>
        <button type="button" className="gw-btn font-bold" disabled={!elegidos.length || !bancoId} onClick={() => void crear()}>
          <FilePlus2 size={14} /> Crear remesa ({elegidos.length} · {eur0(total)} €)
        </button>
        {conProblema > 0 && (
          <span className="mb-1 font-bold text-[#c42b1c]">{conProblema} recibos sin mandato o con IBAN mal: no pueden ir (pestaña «Mandatos»)</span>
        )}
      </Barra>
      <Rejilla alto="calc(100vh - 300px)">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[28px]" />
              <th className="w-[85px]">Vence</th>
              <th>Cliente</th>
              <th className="w-[110px]">Factura</th>
              <th className="w-[160px]">Mandato</th>
              <th className="w-[95px] text-right!">Importe</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <Vacio cols={6} texto="No hay recibos domiciliados pendientes hasta esa fecha." />}
            {lista.map((c) => {
              const k = clave(c)
              return (
                <tr
                  key={k}
                  className={c.problema ? 'bg-[#fdecea] text-[#8a1c12]' : marcados.has(k) ? '' : 'text-[#888]'}
                  onClick={() =>
                    !c.problema &&
                    setMarcados((m) => {
                      const n = new Set(m)
                      if (n.has(k)) n.delete(k)
                      else n.add(k)
                      return n
                    })
                  }
                  title={c.problema ?? ''}
                >
                  <td className="text-center">{c.problema ? '⚠' : marcados.has(k) ? '☑' : '☐'}</td>
                  <td>{fechaEs(c.vencimiento)}</td>
                  <td className="truncate">
                    {c.cliente_codigo} · {c.cliente_nombre}
                  </td>
                  <td>{c.factura}</td>
                  <td className="truncate">{c.problema ?? `${c.mandato_ref} · …${c.iban_final} · ${c.tipo}`}</td>
                  <td className="text-right">{eur0(c.importe)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Rejilla>
    </>
  )
}

function ListaRemesas({ bancos, avisar }: { bancos: Banco[]; avisar: Avisar }) {
  const [lista, setLista] = useState<Remesa[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [recibos, setRecibos] = useState<Recibo[]>([])

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('remesa').select('*').order('id', { ascending: false }).limit(200)
    if (e) return avisar(e.message)
    setLista((data ?? []) as Remesa[])
  }, [avisar])
  useEffect(() => {
    void cargar()
  }, [cargar])
  useEffect(() => {
    if (!sel) return setRecibos([])
    supabase
      .from('remesa_recibo')
      .select('id, e2e, cliente_codigo, importe, vencimiento, concepto, estado')
      .eq('remesa_id', sel)
      .order('id')
      .then(({ data }) => setRecibos((data ?? []) as Recibo[]))
  }, [sel, lista])

  const r = lista.find((x) => x.id === sel) ?? null

  const descargar = async () => {
    if (!r) return
    const { data, error: e } = await supabase.rpc('fn_remesa_datos_xml', { p_id: r.id })
    if (e) return avisar(e.message)
    const d = data as DatosRemesa
    const malos = d.recibos.filter((x) => !ibanValido(x.iban))
    if (malos.length) return avisar(`Hay ${malos.length} recibos con IBAN no válido: corrígelos en «Mandatos».`)
    const xml = xmlRemesa(d)
    descargarXml(`${r.referencia}.xml`, xml)
    const { error: e2 } = await supabase.rpc('fn_remesa_marcar', { p_id: r.id, p_estado: 'generada', p_xml: xml })
    if (e2) return avisar(e2.message)
    avisar(null, `Fichero ${r.referencia}.xml descargado. Súbelo en la web del banco (Cobros → Adeudos SEPA / Remesas) y luego pulsa «Marcar enviada».`)
    void cargar()
  }
  const marcar = async (estado: string, msg: string) => {
    if (!r) return
    if (estado === 'anulada' && !window.confirm(`¿Anular la remesa ${r.referencia}? Sus recibos vuelven a quedar libres para otra remesa.`)) return
    const { error: e } = await supabase.rpc('fn_remesa_marcar', { p_id: r.id, p_estado: estado })
    if (e) return avisar(e.message)
    avisar(null, msg)
    void cargar()
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 max-lg:grid-cols-1">
      <Rejilla alto="calc(100vh - 260px)">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[140px]">Remesa</th>
              <th className="w-[80px]">Cargo</th>
              <th>Cuenta</th>
              <th className="w-[50px] text-right!">Rec.</th>
              <th className="w-[90px] text-right!">Total</th>
              <th className="w-[140px]">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <Vacio cols={6} texto="Todavía no hay remesas." />}
            {lista.map((x) => (
              <tr key={x.id} className={sel === x.id ? 'gw-selected' : x.estado === 'anulada' ? 'text-[#999]' : ''} onClick={() => setSel(x.id)}>
                <td className="font-mono">{x.referencia}</td>
                <td>{fechaEs(x.fecha_cargo)}</td>
                <td className="truncate">{bancos.find((b) => b.id === x.banco_cuenta_id)?.nombre}</td>
                <td className="text-right">{x.num_recibos}</td>
                <td className="text-right">{eur0(x.total)}</td>
                <td>{ESTADO[x.estado] ?? x.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rejilla>
      {r ? (
        <GwGroup title={`Remesa ${r.referencia} · ${ESTADO[r.estado] ?? r.estado}`}>
          <div className="mb-1 flex flex-wrap gap-1.5">
            <button type="button" className="gw-btn font-bold" disabled={['abonada', 'anulada'].includes(r.estado)} onClick={() => void descargar()}>
              <Download size={14} /> Descargar fichero SEPA
            </button>
            <button type="button" className="gw-btn" disabled={r.estado !== 'generada'} onClick={() => void marcar('enviada', 'Remesa marcada como enviada.')}>
              <Send size={14} /> Marcar enviada
            </button>
            <button
              type="button"
              className="gw-btn"
              disabled={['abonada', 'anulada'].includes(r.estado)}
              onClick={() => void marcar('anulada', 'Remesa anulada.')}
            >
              <Ban size={14} /> Anular
            </button>
          </div>
          {r.estado === 'abonada' && (
            <div className="mb-1 text-[#127a12]">
              Abonada el {fechaEs(r.abonada_en)}
              {r.comision ? ` · comisión ${eur0(r.comision)} €` : ''}: recibos cobrados.
            </div>
          )}
          <div className="max-h-[calc(100vh-340px)] overflow-auto border border-[var(--gw-border-light)] bg-white">
            <table className="gw-grid">
              <tbody>
                {recibos.map((x) => (
                  <tr key={x.id} className={x.estado === 'devuelto' ? 'bg-[#fdecea] font-bold text-[#c42b1c]' : ''}>
                    <td className="w-[150px] font-mono text-[12px]">{x.e2e}</td>
                    <td className="w-[70px]">{x.cliente_codigo}</td>
                    <td className="truncate">{x.concepto}</td>
                    <td className="w-[80px] text-right">{eur0(x.importe)}</td>
                    <td className="w-[75px]">{x.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GwGroup>
      ) : (
        <div className="p-2 text-[#555]">Pincha una remesa para ver sus recibos y descargar el fichero.</div>
      )}
    </div>
  )
}

const ACCIONES: { id: string; texto: string; ayuda: string }[] = [
  { id: 'otra_via', texto: '💶 El cliente paga por otros medios', ayuda: 'Lo normal: transferencia o caja. El recibo ya no va en las remesas.' },
  {
    id: 'reremesar',
    texto: '🔁 Volver a pasarlo al cobro (excepción)',
    ayuda: 'Solo lo decide el jefe de ventas (super administradores). Sale otra vez en «Nueva remesa» con el vencimiento que pongas.',
  },
  { id: 'repercutir_gastos', texto: '➕ Repercutir los gastos al cliente', ayuda: 'Se le cargan los gastos del banco (cuenta del cliente contra 759).' },
  { id: 'bloquear_credito', texto: '⛔ Bloquear el crédito (solo contado)', ayuda: 'Límite de deuda 0, cliente marcado y aviso en cada venta.' },
  { id: 'bloquear_cliente', texto: '🚫 Bloquear el cliente', ayuda: 'No se le podrá vender hasta desbloquearlo en su ficha.' },
  { id: 'dudoso_cobro', texto: '⚠️ Pasar a dudoso cobro', ayuda: 'Asiento 436 / cliente, para la asesoría (y, si llega el caso, rectificativa por impago).' },
]
const textoAccion = (id: string) => ACCIONES.find((a) => a.id === id)?.texto ?? id

function Devoluciones({ avisar }: { avisar: Avisar }) {
  const { superAdmin } = usePermisos()
  const [lista, setLista] = useState<Devolucion[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [acciones, setAcciones] = useState<string[]>([])
  const [nota, setNota] = useState('')
  const [vence, setVence] = useState(sumarDias(10))
  const cargar = useCallback(() => {
    supabase.rpc('fn_remesa_devoluciones').then(({ data, error: e }) => {
      if (e) return avisar(e.message)
      setLista((data ?? []) as Devolucion[])
    })
  }, [avisar])
  useEffect(() => {
    cargar()
  }, [cargar])
  const d = lista.find((x) => x.id === sel) ?? null
  // Al elegir una devolución: a partir de la 2.ª del cliente se propone bloquear el crédito.
  useEffect(() => {
    if (!d || d.decision) return
    setAcciones(d.veces >= 2 && !d.credito_bloqueado ? ['otra_via', 'bloquear_credito'] : ['otra_via'])
    setNota('')
  }, [d])
  const marcar = (id: string) =>
    setAcciones((a) => {
      if (a.includes(id)) return a.filter((x) => x !== id)
      const sin = id === 'reremesar' ? a.filter((x) => x !== 'otra_via') : id === 'otra_via' ? a.filter((x) => x !== 'reremesar') : a
      return [...sin, id]
    })
  const decidir = async () => {
    if (!d) return
    const { error: e } = await supabase.rpc('fn_remesa_devolucion_decidir', {
      p_recibo: d.id,
      p_acciones: acciones,
      p_nota: nota || null,
      p_vencimiento: acciones.includes('reremesar') ? vence : null,
    })
    if (e) return avisar(e.message)
    avisar(null, `Decisión guardada para el recibo ${d.e2e}.`)
    setSel(null)
    cargar()
  }
  const pendientes = lista.filter((x) => !x.decision).length
  // Estado de los avisos por correo (la cola solo la ven los administradores).
  const [correos, setCorreos] = useState<{ pend: number; error: string | null; ultimo: string | null } | null>(null)
  useEffect(() => {
    supabase
      .from('correo_pendiente')
      .select('enviado_en, error, creado_en')
      .order('id', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!data?.length) return setCorreos(null)
        const pend = data.filter((c) => !c.enviado_en)
        setCorreos({ pend: pend.length, error: pend.find((c) => c.error)?.error ?? null, ultimo: data.find((c) => c.enviado_en)?.enviado_en ?? null })
      })
  }, [lista])

  return (
    <>
      <div className="text-[12px] text-[#555]">
        Recibos que el banco ha devuelto. Al conciliar la devolución el recibo vuelve a quedar <b>pendiente</b> (la deuda del cliente sube) y{' '}
        <b>ya no va en las remesas</b>: el cliente lo paga por otros medios. Cada devolución hay que
        <b> decidirla</b>: pincha en ella, llama al cliente y elige qué hacer.{' '}
        {pendientes > 0 && <b className="text-[#c42b1c]">{pendientes} pendientes de decidir.</b>}
      </div>
      {correos && (
        <div className={`text-[12px] ${correos.error ? 'font-bold text-[#c42b1c]' : 'text-[#555]'}`}>
          📧 Avisos por correo: {correos.pend ? `${correos.pend} por enviar` : 'todos enviados'}
          {correos.ultimo ? ` · último enviado ${fechaEs(correos.ultimo.slice(0, 10))}` : ''}
          {correos.error ? ` · ${correos.error}` : ''}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-2 max-lg:grid-cols-1">
        <Rejilla alto="calc(100vh - 290px)">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[80px]">Devuelto</th>
                <th>Cliente</th>
                <th className="w-[45px] text-right!" title="Devoluciones de este cliente">
                  Veces
                </th>
                <th className="w-[80px] text-right!">Importe</th>
                <th className="w-[160px]">Decisión</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && <Vacio cols={5} texto="No hay recibos devueltos." />}
              {lista.map((x) => (
                <tr
                  key={x.id}
                  className={`${sel === x.id ? 'gw-selected' : ''} ${x.decision ? 'text-[#555]' : 'font-bold text-[#8a1c12]'}`}
                  onClick={() => setSel(x.id)}
                >
                  <td>{fechaEs(x.devuelto_en)}</td>
                  <td className="truncate">
                    {x.cliente_codigo} · {x.cliente_nombre}
                  </td>
                  <td className={`text-right ${x.veces >= 2 ? 'text-[#c42b1c]' : ''}`}>{x.veces}</td>
                  <td className="text-right">{eur0(x.importe)}</td>
                  <td className="truncate">{x.decision ? `✔ ${x.decision.map(textoAccion).join(', ')}` : '⏳ Pendiente de decidir'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Rejilla>
        {d ? (
          <GwGroup title={`Recibo ${d.e2e}`}>
            <div className="flex flex-col gap-1.5 text-[13px]">
              <div>
                <b>
                  {d.cliente_codigo} · {d.cliente_nombre}
                </b>
                {d.telefono && <span> · ☎ {d.telefono}</span>}
              </div>
              <div>
                Devuelto el {fechaEs(d.devuelto_en)} · {eur0(d.importe)} €{d.gasto ? ` + ${eur0(d.gasto)} € de gastos` : ''} · remesa {d.referencia}
              </div>
              {d.veces >= 2 && <div className="font-bold text-[#c42b1c]">⚠ Es la {d.veces}.ª devolución de este cliente: se propone bloquear el crédito.</div>}
              {(d.credito_bloqueado || d.bloqueado) && (
                <div className="text-[#8a5a00]">Ya está {d.bloqueado ? 'bloqueado' : 'con el crédito bloqueado (solo contado)'}.</div>
              )}
              {d.decision ? (
                <div className="border border-[#6cbf6c] bg-[#eef8ee] p-1.5">
                  ✔ Decidido por {d.decision_por ?? '?'} el {fechaEs(d.decision_en?.slice(0, 10))}: {d.decision.map(textoAccion).join(', ')}
                  {d.decision_nota ? ` · «${d.decision_nota}»` : ''}
                </div>
              ) : (
                <>
                  <b>¿Qué se hace?</b>
                  {ACCIONES.map((a) => (
                    <label key={a.id} className="flex cursor-pointer items-start gap-1.5" title={a.ayuda}>
                      <input
                        type="checkbox"
                        className="mt-[3px]"
                        checked={acciones.includes(a.id)}
                        disabled={(a.id === 'repercutir_gastos' && !d.gasto) || (a.id === 'reremesar' && !superAdmin)}
                        onChange={() => marcar(a.id)}
                      />
                      <span>
                        {a.texto}
                        <span className="block text-[11px] text-[#666]">{a.ayuda}</span>
                      </span>
                    </label>
                  ))}
                  {acciones.includes('reremesar') && (
                    <GwField label="Nuevo vencimiento (para la próxima remesa)">
                      <GwDate value={vence} onChange={(v) => v && setVence(v)} className="w-[100px]" />
                    </GwField>
                  )}
                  <GwField label="Nota (qué ha dicho el cliente…)">
                    <GwInput value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
                  </GwField>
                  <button type="button" className="gw-btn self-end font-bold" disabled={!acciones.length} onClick={() => void decidir()}>
                    <Save size={14} /> Guardar decisión
                  </button>
                </>
              )}
            </div>
          </GwGroup>
        ) : (
          <div className="p-2 text-[#555]">Pincha una devolución para decidir qué hacer.</div>
        )}
      </div>
    </>
  )
}

const mandatoVacio = {
  id: 0,
  cliente_codigo: '',
  iban: '',
  bic: '',
  titular: '',
  referencia: '',
  fecha_firma: isoDe(new Date()),
  tipo: 'CORE' as 'CORE' | 'B2B',
}

function Mandatos({ avisar }: { avisar: Avisar }) {
  const [lista, setLista] = useState<Mandato[]>([])
  const [filtro, setFiltro] = useState('')
  const [ficha, setFicha] = useState(mandatoVacio)
  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('cliente_mandato').select('*').order('cliente_codigo').limit(2000)
    if (e) return avisar(e.message)
    setLista((data ?? []) as Mandato[])
  }, [avisar])
  useEffect(() => {
    void cargar()
  }, [cargar])
  const filas = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    return f ? lista.filter((m) => `${m.cliente_codigo} ${m.titular ?? ''} ${m.referencia}`.toLowerCase().includes(f)) : lista
  }, [lista, filtro])
  const ibanOk = ibanValido(ficha.iban)

  const guardar = async () => {
    const datos = {
      cliente_codigo: ficha.cliente_codigo.trim(),
      iban: ficha.iban.replace(/\s/g, '').toUpperCase(),
      bic: ficha.bic.trim().toUpperCase() || null,
      titular: ficha.titular.trim() || null,
      referencia: ficha.referencia.trim() || `OFI-${ficha.cliente_codigo.trim()}`,
      fecha_firma: ficha.fecha_firma,
      tipo: ficha.tipo,
    }
    const { error: e } = ficha.id
      ? await supabase.from('cliente_mandato').update(datos).eq('id', ficha.id)
      : await supabase.from('cliente_mandato').insert(datos)
    if (e) return avisar(e.message.includes('cliente') ? `No existe el cliente ${datos.cliente_codigo}.` : e.message)
    avisar(null, 'Mandato guardado.')
    setFicha(mandatoVacio)
    void cargar()
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-2 max-lg:grid-cols-1">
      <div className="flex flex-col gap-1">
        <GwField label="Buscar (cliente, titular, referencia)">
          <GwInput value={filtro} onChange={(e) => setFiltro(e.target.value)} className="w-[260px]" />
        </GwField>
        <Rejilla alto="calc(100vh - 310px)">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[80px]">Cliente</th>
                <th>Titular</th>
                <th className="w-[150px]">IBAN</th>
                <th className="w-[130px]">Mandato</th>
                <th className="w-[80px]">Firma</th>
                <th className="w-[50px]">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && <Vacio cols={6} texto="No hay mandatos. Cuando se cargue GeminisWin entero vendrán de allí." />}
              {filas.map((m) => (
                <tr
                  key={m.id}
                  className={`${ficha.id === m.id ? 'gw-selected' : ''} ${m.activo ? '' : 'text-[#999]'}`}
                  onClick={() => setFicha({ ...m, bic: m.bic ?? '', titular: m.titular ?? '' })}
                >
                  <td>{m.cliente_codigo}</td>
                  <td className="truncate">{m.titular}</td>
                  <td className={`font-mono text-[12px] ${ibanValido(m.iban) ? '' : 'font-bold text-[#c42b1c]'}`}>{ibanOculto(m.iban)}</td>
                  <td className="truncate">{m.referencia}</td>
                  <td>{fechaEs(m.fecha_firma)}</td>
                  <td>{m.tipo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Rejilla>
      </div>
      <GwGroup title={ficha.id ? `Mandato de ${ficha.cliente_codigo}` : 'Alta de mandato'}>
        <div className="flex flex-col gap-1.5">
          <GwField label="Cliente (código)">
            <GwInput value={ficha.cliente_codigo} disabled={!!ficha.id} onChange={(e) => setFicha({ ...ficha, cliente_codigo: e.target.value })} />
          </GwField>
          <GwField label="IBAN">
            <GwInput value={ficha.iban} onChange={(e) => setFicha({ ...ficha, iban: e.target.value.toUpperCase() })} className="font-mono" />
          </GwField>
          {ficha.iban && (
            <div className={`text-[12px] font-bold ${ibanOk ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>{ibanOk ? '✔ IBAN correcto' : '✖ IBAN no válido'}</div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <GwField label="BIC (opcional)">
              <GwInput value={ficha.bic} onChange={(e) => setFicha({ ...ficha, bic: e.target.value.toUpperCase() })} />
            </GwField>
            <GwField label="Esquema">
              <GwSelect value={ficha.tipo} onChange={(e) => setFicha({ ...ficha, tipo: e.target.value as 'CORE' | 'B2B' })}>
                <option value="CORE">CORE (todos)</option>
                <option value="B2B">B2B (solo empresas)</option>
              </GwSelect>
            </GwField>
          </div>
          <GwField label="Titular de la cuenta (si no es el cliente)">
            <GwInput value={ficha.titular} onChange={(e) => setFicha({ ...ficha, titular: e.target.value })} />
          </GwField>
          <div className="grid grid-cols-2 gap-1.5">
            <GwField label="Referencia del mandato">
              <GwInput
                value={ficha.referencia}
                placeholder={`OFI-${ficha.cliente_codigo || 'cliente'}`}
                onChange={(e) => setFicha({ ...ficha, referencia: e.target.value })}
              />
            </GwField>
            <GwField label="Fecha de firma">
              <GwDate value={ficha.fecha_firma} onChange={(v) => v && setFicha({ ...ficha, fecha_firma: v })} />
            </GwField>
          </div>
          <div className="flex justify-end gap-2">
            {ficha.id ? (
              <button type="button" className="gw-btn" onClick={() => setFicha(mandatoVacio)}>
                Nuevo
              </button>
            ) : null}
            <button type="button" className="gw-btn font-bold" disabled={!ficha.cliente_codigo.trim() || !ibanOk} onClick={() => void guardar()}>
              <Save size={14} /> Guardar
            </button>
          </div>
        </div>
      </GwGroup>
    </div>
  )
}

function DatosSepa({ bancos, avisar, onCambio }: { bancos: Banco[]; avisar: Avisar; onCambio: () => void }) {
  const guardar = async (b: Banco, cambios: Partial<Banco>) => {
    const { error: e } = await supabase.from('banco_cuenta').update(cambios).eq('id', b.id)
    if (e) return avisar(e.message)
    avisar(null, 'Guardado.')
    onCambio()
  }
  return (
    <>
      <div className="text-[12px] text-[#555]">
        Para mandar remesas, cada cuenta necesita su <b>IBAN</b> y el <b>Identificador de Acreedor SEPA</b> de la empresa (lo da el banco a partir del CIF, p.
        ej. ES12000B12345678). Las cuentas se crean al importar su primer Norma 43 en Conciliación Bancaria.
      </div>
      <table className="gw-grid">
        <thead>
          <tr>
            <th>Cuenta</th>
            <th className="w-[260px]">IBAN</th>
            <th className="w-[120px]">BIC</th>
            <th className="w-[190px]">Identificador de Acreedor</th>
          </tr>
        </thead>
        <tbody>
          {bancos.length === 0 && <Vacio cols={4} texto="No hay cuentas: importa un Norma 43 en Conciliación Bancaria." />}
          {bancos.map((b) => (
            <tr key={b.id}>
              <td>
                {b.nombre} · {b.cuenta_contable}
              </td>
              <td>
                <input
                  className={`gw-input h-[22px] w-full font-mono ${b.iban && !ibanValido(b.iban) ? 'text-[#c42b1c]' : ''}`}
                  defaultValue={b.iban ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.replace(/\s/g, '').toUpperCase()
                    if (v !== (b.iban ?? '')) {
                      if (v && !ibanValido(v)) return avisar('El IBAN no es válido.')
                      void guardar(b, { iban: v || null })
                    }
                  }}
                />
              </td>
              <td>
                <input
                  className="gw-input h-[22px] w-full"
                  defaultValue={b.bic ?? ''}
                  onBlur={(e) => e.target.value !== (b.bic ?? '') && void guardar(b, { bic: e.target.value.toUpperCase() || null })}
                />
              </td>
              <td>
                <input
                  className="gw-input h-[22px] w-full font-mono"
                  defaultValue={b.acreedor_id ?? ''}
                  onBlur={(e) => e.target.value !== (b.acreedor_id ?? '') && void guardar(b, { acreedor_id: e.target.value.toUpperCase().trim() || null })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function OperativaRemesas() {
  return (
    <div className="border border-[var(--gw-border)] bg-white p-2">
      <GwOperativa
        bloques={[
          {
            titulo: 'Antes de la primera remesa',
            pasos: [
              '«Datos SEPA de la empresa»: pon el IBAN y el Identificador de Acreedor SEPA de cada cuenta desde la que se remesa.',
              '«Mandatos de clientes»: cada cliente que paga por domiciliación necesita su IBAN y su mandato (referencia y fecha de firma). Cuando se cargue GeminisWin entero vendrán de allí.',
            ],
          },
          {
            titulo: 'Hacer una remesa',
            pasos: [
              '«Nueva remesa»: elige hasta qué fecha de vencimiento, la cuenta y la fecha de cargo. Salen marcados todos los recibos domiciliados pendientes; desmarca los que no quieras. Los rojos no pueden ir (sin mandato o IBAN mal).',
              'Pulsa «Crear remesa». En «Remesas», pínchala y pulsa «Descargar fichero SEPA»: se baja un fichero .xml.',
              'Entra en la web del banco (Cobros → Adeudos / Remesas SEPA), sube ese fichero y firma. Vuelve y pulsa «Marcar enviada».',
            ],
          },
          {
            titulo: 'Cuando el banco abona',
            pasos: [
              'Importa el Norma 43 en Conciliación Bancaria: el abono de la remesa sale en verde («Remesa REM…»). Al confirmarlo se cobran todos sus recibos y, si el banco se quedó comisión, se hace su asiento.',
              'Si un cliente devuelve el recibo, el cargo de la devolución sale en Conciliación («Devolución del recibo…»). Al confirmarlo el recibo vuelve a quedar pendiente (la deuda del cliente sube) y deja de ir en las remesas, su cobro se anula en la contabilidad con la fecha del cargo y los gastos van a comisiones.',
              'Avisos por correo: en Archivo → Parámetros → Generales → «Avisos por correo» se ponen los correos (jefe de ventas, contabilidad…). Llega un correo en cada devolución y un recordatorio cada mañana si queda alguna sin decidir.',
              'Arriba en la cabecera sale el aviso «⚠ N recibos devueltos por decidir». En «Devoluciones» pincha cada uno, llama al cliente y elige qué hacer: que pague por otros medios (lo normal), volver a pasarlo al cobro (excepción, solo el jefe de ventas), repercutir los gastos, bloquear el crédito (solo contado), bloquear el cliente o pasar a dudoso cobro. Desde la 2.ª devolución del mismo cliente se propone bloquear el crédito.',
            ],
          },
          {
            titulo: 'Bueno es saber',
            notas: [
              'El fichero es el estándar europeo SEPA (pain.008), el mismo para Santander, BBVA, CaixaBank y Cajasiete.',
              'Contabilidad de las remesas: al marcarla «enviada» los recibos pasan de la cuenta del cliente a la 4312 (efectos en gestión de cobro); al abonarla el banco, de la 4312 al banco (y la comisión a la 626). Si se devuelve un recibo pasa a la 4315 (efectos impagados) y, cuando el cliente lo paga, sale de la 4315. Saldo de la 4312 = remesas enviadas sin cobrar; saldo de la 4315 = recibos devueltos sin cobrar.',
              'Una remesa abonada o una devolución conciliada no se deshacen desde Conciliación (los cobros ya están hechos): avisa a un administrador.',
              'Los IBAN se ven ocultos en las listas; completos solo en la ficha del mandato y en el fichero.',
            ],
          },
        ]}
      />
    </div>
  )
}
