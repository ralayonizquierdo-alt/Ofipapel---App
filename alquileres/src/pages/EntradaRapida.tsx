import { ClipboardPaste } from 'lucide-react'
import { CajaPegar } from '../components/PegarWhatsApp'
import SoltarGastos from '../components/SoltarGastos'
import PageHeader from '../components/ui/PageHeader'

/**
 * Entrada de reservas, cobros y gastos para quien solo sube documentos.
 *
 * Es la caja de «Entrada rápida» del Dashboard y nada más: los mismos dos
 * componentes, sin copiar ni una línea de su lógica. El resto del Dashboard
 * —lo cobrado del mes, el neto del año, los pagos pendientes, los avisos de
 * descuadre— es dinero, y Mónica y Cande no lo ven: entran a aportar datos,
 * no a consultarlos.
 */
export default function EntradaRapida() {
  return (
    <div className="p-6">
      <PageHeader
        title="Subir reservas y gastos"
        subtitle="Pega el aviso de una reserva, o suelta el PDF de un cobro o el Excel de gastos"
      />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
          <ClipboardPaste size={15} className="text-blue-600" />
          <p className="text-sm font-semibold text-slate-700">Entrada rápida</p>
        </div>
        <div className="p-4 space-y-3">
          <CajaPegar compacta />
          <SoltarGastos />
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-4 leading-relaxed">
        Nada se guarda hasta que lo confirmas: primero se enseña lo que ha entendido
        y tú decides. Todo lo que subas queda anotado con tu nombre y la fecha.
      </p>
    </div>
  )
}
