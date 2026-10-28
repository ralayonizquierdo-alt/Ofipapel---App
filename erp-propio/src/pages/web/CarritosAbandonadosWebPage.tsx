import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, Info } from 'lucide-react'
import { wc, type WcEstado } from '../../lib/woocommerce'
import { BotonPendiente, Nota, Tabla, WebError, type Col } from './comun'

interface Carrito {
  id: string
}

const COLS: Col<Carrito>[] = [
  { key: 'fecha', label: 'Fecha', width: 115, value: () => '' },
  { key: 'cli', label: 'Cliente', width: 220, value: () => '' },
  { key: 'email', label: 'Email', width: 200, value: () => '' },
  { key: 'tel', label: 'Teléfono', width: 100, value: () => '' },
  { key: 'prod', label: 'Productos', width: 300, value: () => '' },
  { key: 'imp', label: 'Importe', width: 85, align: 'right', value: () => '' },
  { key: 'rec', label: 'Recuperado', width: 85, value: () => '' },
]

/**
 * Web → Carritos Abandonados. WooCommerce NO guarda carritos abandonados ni los expone en su API
 * REST estándar: hace falta un plugin. La pantalla queda preparada y vacía (no se inventan datos).
 */
export function CarritosAbandonadosWebPage() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<WcEstado | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    wc.estado()
      .then(setEstado)
      .catch((e) => setError(e))
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <WebError error={error} />
      <div className="flex flex-none gap-2 border border-[#9db7d9] bg-[#eef4fc] p-2">
        <Info size={18} className="flex-none text-[#1d3a8a]" />
        <div className="min-w-0 space-y-1">
          <div>
            <b>WooCommerce no guarda los carritos abandonados</b> y su API REST estándar no tiene ningún recurso para leerlos: un carrito solo existe en la sesión
            del navegador del cliente hasta que hace el pedido. Por eso esta ventana está vacía; no se muestra nada que no venga de la web.
          </div>
          <div>
            Para tenerlos haría falta que la empresa que gestiona la web instale un plugin que los registre, por ejemplo <b>Cart Abandonment Recovery</b>{' '}
            (CartFlows), <b>Abandoned Cart Lite for WooCommerce</b> o un servicio de email marketing conectado a la tienda (Mailchimp, Klaviyo…). Después, si el
            plugin publica su propia API de lectura, se añade ese recurso a la lista blanca de la función «woocommerce-erp» (solo GET) y esta tabla se rellena.
          </div>
          <div className="text-[12px] text-[#444]">
            Conexión con la web:{' '}
            {estado ? (
              <>
                {estado.url} · {estado.hayClaves ? 'claves configuradas' : <b className="text-[#b05a00]">faltan las claves de WooCommerce</b>} · solo lectura
              </>
            ) : error ? (
              'no disponible'
            ) : (
              'comprobando…'
            )}
          </div>
        </div>
      </div>
      <Nota>Plugin de carritos abandonados: ninguno conectado.</Nota>
      <Tabla rows={[] as Carrito[]} cols={COLS} rowKey={(c) => c.id} vacio="Sin datos: la web no expone carritos abandonados (hace falta un plugin)." />
      <div className="flex flex-none items-center gap-2">
        <BotonPendiente>Enviar recordatorio al cliente</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
