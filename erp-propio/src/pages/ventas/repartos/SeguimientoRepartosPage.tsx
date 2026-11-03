import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../../lib/supabase'
import { Aviso, base, BotonClaro, C, PanelReparto, type DatosSeg, type RutaSeg } from '../../../reparto-app/PanelReparto'

// Seguimiento de repartos (Ventas → Seguimiento de repartos, /repartos/seguimiento).
// Back office del reparto. La TV del departamento de pedidos NO usa esta pantalla: abre /reparto-tv con el enlace que
// se genera aquí («Enlace para la TV»), sin ERP. Dos vistas
//  · «Rutas»: una línea por ruta con lo que va quedando, en tiempo real (se refresca cada 20 s).
//  · «Mapa»: Tenerife con la última posición de cada repartidor (solo mientras tiene la ruta abierta en la app)
//    y los puntos donde ha marcado entregas.
// Debajo, ranking semanal de entregas por repartidor y totales de la semana, el mes y el año.
// Desde aquí también: cerrar un reparto y poner el PIN de la app a cada repartidor.
// Datos: fn_reparto_seguimiento / fn_reparto_cerrar / fn_repartidores_app / fn_repartidor_pin_poner
// (migración 20261103_reparto_app.sql).

export function SeguimientoRepartosPage() {
  const [datos, setDatos] = useState<DatosSeg | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<'rutas' | 'mapa'>('rutas')
  const [pines, setPines] = useState(false)
  const [enlaceTv, setEnlaceTv] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('fn_reparto_seguimiento', {})
    if (e) setError(e.message)
    else {
      setDatos(data as DatosSeg)
      setError(null)
    }
  }, [])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => void cargar(), 20_000)
    return () => clearInterval(t)
  }, [cargar])

  const cerrar = async (r: RutaSeg) => {
    if (r.pendientes && !confirm(`Quedan ${r.pendientes} pedido(s) sin marcar en ${r.ruta_nombre}. Si cierras, pasan al reparto del día siguiente como no entregados. ¿Cerrar?`)) return
    if (!r.pendientes && !confirm(`¿Cerrar el reparto de ${r.ruta_nombre}? Lo no entregado o con incidencia pasa al día siguiente.`)) return
    const { data, error: e } = await supabase.rpc('fn_reparto_cerrar', { p_tienda: r.tienda, p_numero: r.numero })
    if (e) return setMensaje(e.message)
    const x = data as { entregados: number; pasan: number; siguiente: string | null }
    setMensaje(`Reparto de ${r.ruta_nombre} cerrado: ${x.entregados} entregados${x.pasan ? `, ${x.pasan} pasan al reparto ${x.siguiente}` : ''}.`)
    void cargar()
  }

  return (
    <>
      <PanelReparto
        datos={datos}
        error={error}
        vista={vista}
        setVista={setVista}
        tv={false}
        onCerrar={cerrar}
        derecha={
          <>
            <BotonClaro onClick={() => setPines(true)}>PIN de la app</BotonClaro>
            <BotonClaro onClick={() => setEnlaceTv(true)}>📺 Enlace para la TV</BotonClaro>
          </>
        }
        avisos={
          mensaje && (
            <Aviso color={C.verdeMed} onCerrar={() => setMensaje(null)}>
              {mensaje}
            </Aviso>
          )
        }
      />
      {pines && <DialogoPines onCerrar={() => setPines(false)} />}
      {enlaceTv && <DialogoEnlaceTv onCerrar={() => setEnlaceTv(false)} />}
    </>
  )
}

// ------------------------------------------------------------------ Enlace para la TV
function DialogoEnlaceTv({ onCerrar }: { onCerrar: () => void }) {
  const [enlace, setEnlace] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const generar = async () => {
    if (!confirm('Se crea un enlace nuevo y el anterior deja de funcionar (habrá que abrir el nuevo en la TV). ¿Seguir?')) return
    const { data, error } = await supabase.rpc('fn_reparto_tv_generar')
    if (error) return setMsg(error.message)
    const url = `${location.origin}${base}reparto-tv?k=${data as string}`
    setEnlace(url)
    setQr(await QRCode.toDataURL(url, { margin: 1, width: 220 }))
  }
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, borderTop: `5px solid ${C.lima}`, padding: 18, width: 520, maxWidth: '94vw' }}>
        <div style={{ fontWeight: 800, color: C.verde, fontSize: 18, marginBottom: 4 }}>Pantalla de la TV</div>
        <div style={{ fontSize: 13, color: '#5f6b5f', marginBottom: 10 }}>
          La TV no necesita el ERP: abre en su navegador el enlace que se crea aquí y lo deja en pantalla completa. Se ven las rutas,
          el mapa, el ranking y los totales, y se alternan solos. El enlace solo se enseña una vez: guárdalo en la TV (favoritos).
          Si se pierde o lo ve quien no debe, crea otro y el anterior deja de valer.
        </div>
        {!enlace ? (
          <button type="button" onClick={generar} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: C.verdeMed, color: '#fff', fontWeight: 700 }}>
            Crear enlace para la TV
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {qr && <img src={qr} alt="Código QR del enlace" style={{ width: 160, height: 160 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, wordBreak: 'break-all', background: '#f3f6f3', borderRadius: 8, padding: 8 }}>{enlace}</div>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(enlace).then(() => setMsg('Enlace copiado.'))}
                style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: `2px solid ${C.verdeMed}`, background: '#fff', color: C.verde, fontWeight: 700 }}
              >
                Copiar enlace
              </button>
            </div>
          </div>
        )}
        {msg && <div style={{ fontSize: 13, marginTop: 8, color: C.verde }}>{msg}</div>}
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <button type="button" onClick={onCerrar} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #bbb', background: '#fff' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ PIN de la app
function DialogoPines({ onCerrar }: { onCerrar: () => void }) {
  const [lista, setLista] = useState<{ codigo: string; nombre: string; con_pin: boolean; puede_cambiar_ruta: boolean }[] | null>(null)
  const [quien, setQuien] = useState('')
  const [pin, setPin] = useState('')
  const [cambiar, setCambiar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const cargar = useCallback(() => {
    void supabase.rpc('fn_repartidores_app').then(({ data, error }) => (error ? setMsg(error.message) : setLista((data ?? []) as typeof lista)))
  }, [])
  useEffect(cargar, [cargar])
  const guardar = async () => {
    const { error } = await supabase.rpc('fn_repartidor_pin_poner', { p_repartidor: quien, p_pin: pin, p_puede_cambiar_ruta: cambiar })
    if (error) return setMsg(error.message)
    setMsg('PIN guardado. Si tenía la app abierta, tendrá que volver a entrar.')
    setPin('')
    cargar()
  }
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, borderTop: `5px solid ${C.lima}`, padding: 18, width: 440, maxWidth: '94vw' }}>
        <div style={{ fontWeight: 800, color: C.verde, fontSize: 18, marginBottom: 4 }}>PIN de la app de reparto</div>
        <div style={{ fontSize: 13, color: '#5f6b5f', marginBottom: 10 }}>
          Los repartidores entran en <b>{location.origin}{base}repartidor</b> con su nombre y este PIN de 4 cifras.
        </div>
        <select value={quien} onChange={(e) => {
          setQuien(e.target.value)
          setCambiar(lista?.find((x) => x.codigo === e.target.value)?.puede_cambiar_ruta ?? false)
        }} style={{ width: '100%', padding: 8, border: '1px solid #bbb', borderRadius: 8, marginBottom: 8 }}>
          <option value="">Elige repartidor…</option>
          {lista?.map((r) => (
            <option key={r.codigo} value={r.codigo}>
              {r.nombre} {r.con_pin ? '· tiene PIN' : ''}
            </option>
          ))}
        </select>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          placeholder="PIN nuevo (4 cifras)"
          style={{ width: '100%', padding: 8, border: '1px solid #bbb', borderRadius: 8, marginBottom: 8, fontSize: 18, letterSpacing: 6 }}
        />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 12 }}>
          <input type="checkbox" checked={cambiar} onChange={(e) => setCambiar(e.target.checked)} /> Puede cambiar pedidos de ruta él mismo (queda anotado)
        </label>
        {msg && <div style={{ fontSize: 13, marginBottom: 8, color: C.verde }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #bbb', background: '#fff' }}>
            Cerrar
          </button>
          <button
            type="button"
            disabled={!quien || pin.length !== 4}
            onClick={guardar}
            style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: C.verdeMed, color: '#fff', fontWeight: 700, opacity: !quien || pin.length !== 4 ? 0.5 : 1 }}
          >
            Guardar PIN
          </button>
        </div>
      </div>
    </div>
  )
}

