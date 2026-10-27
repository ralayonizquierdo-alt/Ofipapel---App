import { useNavigate } from 'react-router-dom'
import { DoorOpen, ExternalLink, MessageCircle } from 'lucide-react'
import { GwGroup } from '../../components/gw'

// El bot de WhatsApp vive en las funciones de Netlify del repositorio (netlify/functions/whatsapp-*),
// desplegadas en el sitio «spontaneous-lebkuchen-60fa41» (el nombre aleatorio de Netlify; es el bueno).
const PANEL = 'https://spontaneous-lebkuchen-60fa41.netlify.app/.netlify/functions/conversations'

/** Web → Pedidos y Consultas por WhatsApp: enlace de consulta con el bot existente. */
export function WhatsAppWebPage() {
  const navigate = useNavigate()
  return (
    <div className="flex min-w-0 flex-col gap-2 text-[13px]">
      <GwGroup title="Bot de WhatsApp de Ofipapel">
        <div className="flex gap-2">
          <MessageCircle size={28} className="flex-none text-[#2a9d2a]" />
          <div className="flex flex-col gap-1">
            <p>
              Las consultas y pedidos que llegan por WhatsApp los atiende el bot (Meta Cloud API + IA), que ya consulta la tienda online para dar precios y
              stock y el estado de los pedidos web. Sus conversaciones, las fichas de cliente y el aprendizaje del bot están en su propio panel.
            </p>
            <p className="text-[#555]">
              Desde el ERP solo se consulta: no se envían mensajes ni se cambia nada del bot. Los pedidos que un cliente confirme por WhatsApp se graban a mano
              en Ventas → Pedidos; los que haga en la tienda online entran por «Importar Pedidos Web».
            </p>
            <div className="mt-1 flex gap-2">
              <a className="gw-btn" href={PANEL} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Abrir el panel de conversaciones
              </a>
              <button type="button" className="gw-btn" onClick={() => navigate('/web/importar-pedidos')}>
                Importar Pedidos Web
              </button>
            </div>
          </div>
        </div>
      </GwGroup>
      <div className="flex">
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
