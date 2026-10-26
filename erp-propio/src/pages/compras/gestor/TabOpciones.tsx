import { useState } from 'react'
import { BIG_INPUT, borrarOpciones, guardarOpciones, leerOpciones, OptionButton, ProcesosGroup } from '../../ventas/gestores/comun'
import { CLAVE_OPCIONES, OPCIONES_DEFECTO, type OpcionesGestorCompras } from './opciones'

export function TabOpciones({ opciones, onChange }: { opciones: OpcionesGestorCompras; onChange: (o: OpcionesGestorCompras) => void }) {
  const [msg, setMsg] = useState('')
  const setOp = (p: Partial<OpcionesGestorCompras>) => onChange({ ...opciones, ...p })
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
      <div className="grid grid-cols-2 gap-x-1.5">
        <OptionButton
          label="Al Mostrar el formulario de Pedidos, Mostrar la Confirmación"
          value={opciones.mostrarConfirmacion}
          onChange={(v) => setOp({ mostrarConfirmacion: v })}
          title="Al editar un pedido se abre directamente en la parte de confirmación"
        />
        <OptionButton
          label="Al Mostrar el formulario de Pedidos, Mostrar la Liquidación"
          value={opciones.mostrarLiquidacion}
          onChange={(v) => setOp({ mostrarLiquidacion: v })}
          title="Al editar un pedido se abre directamente en la parte de liquidación (recepción)"
        />
      </div>
      <div className="grid grid-cols-2 gap-x-1.5">
        <OptionButton label="Refrescar Consulta al Cerrar el Form. de Pedidos" value={opciones.refrescarAlCerrar} onChange={(v) => setOp({ refrescarAlCerrar: v })} />
        <OptionButton
          label="Eliminar las Propuestas al Generar los Pedidos"
          value={opciones.eliminarPropuestas}
          onChange={(v) => setOp({ eliminarPropuestas: v })}
          title="Quita de la lista de propuestas los artículos que ya han pasado a un pedido"
        />
      </div>
      <div className="grid grid-cols-2 items-center gap-x-1.5">
        <OptionButton label="Refrescar la Consulta de los Pedidos Automáticamente" value={opciones.refrescoAuto} onChange={(v) => setOp({ refrescoAuto: v })} />
        <div className="flex items-center justify-between gap-2 pl-2">
          <span className="text-[18px]">Segundos del intervalo del refresco:</span>
          <input
            type="number"
            min={0}
            className={`${BIG_INPUT} h-[34px]! w-[140px]! text-right`}
            value={opciones.segundos}
            onChange={(e) => setOp({ segundos: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-1.5">
        <OptionButton label="Colorear según el Estado en Pedidos" value={opciones.colorearEstadoPedido} onChange={(v) => setOp({ colorearEstadoPedido: v })} />
        <OptionButton label="Colorear según el Proveedor en Propuestas" value={opciones.colorearProveedorPropuestas} onChange={(v) => setOp({ colorearProveedorPropuestas: v })} />
      </div>
      <div className="grid grid-cols-2 gap-x-1.5">
        <OptionButton label="Colorear según el Proveedor en Artículos" value={opciones.colorearProveedorArticulos} onChange={(v) => setOp({ colorearProveedorArticulos: v })} />
        <OptionButton label="Colorear según el Estado en Peticiones" value={opciones.colorearEstadoPeticiones} onChange={(v) => setOp({ colorearEstadoPeticiones: v })} />
      </div>
      <ProcesosGroup
        value={opciones.procesos}
        onChange={(p) => setOp({ procesos: p })}
        nombre="Pedidos"
        textoCompleto="Imprimir informe del Pedido completo, de todos los pedidos nuevos Por"
      />
      <div className="flex flex-none items-center gap-[70px]">
        <button
          type="button"
          className="gw-btn h-[42px]! px-4! text-[19px]!"
          onClick={() => setMsg(guardarOpciones(CLAVE_OPCIONES, opciones) ? 'Valores guardados en este puesto.' : 'No se han podido guardar en este navegador.')}
        >
          💾 Guardar Valores
        </button>
        <button
          type="button"
          className="gw-btn h-[42px]! px-4! text-[19px]!"
          onClick={() => {
            onChange(leerOpciones(CLAVE_OPCIONES, OPCIONES_DEFECTO))
            setMsg('Valores cargados.')
          }}
        >
          ↶ Cargar Valores
        </button>
        <button
          type="button"
          className="gw-btn h-[42px]! px-4! text-[19px]!"
          onClick={() => {
            borrarOpciones(CLAVE_OPCIONES)
            onChange(OPCIONES_DEFECTO)
            setMsg('Valores eliminados: se usan los predeterminados.')
          }}
        >
          ✖ Eliminar Valores
        </button>
        {msg && <span className="gw-label text-[15px]!">{msg}</span>}
      </div>
    </div>
  )
}
