import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwDate } from '../../components/gw'
import { DLG, DialogoListado, DlgCodigoNombre, DlgDestino, fechaEs, hoyIso, useInforme } from '../../components/gw/GwListado'
import { rpc } from './comun'

// Ventas → Listados → List. Apert. Cajón (captura 06-06: «Listado de Aperturas de Cajón»).
// GeminisWin apunta cada apertura del cajón portamonedas y quién la hizo. En el ERP se creó la
// tabla apertura_cajon para este listado; la rellena el TPV (apuntarAperturaCajon, en
// ventas/ventaModel.ts) en cada cobro en efectivo y con el botón «Cajón» (Ctrl+F12).

export function AperturasCajonPage() {
  const inf = useInforme()
  const hoy = hoyIso()
  const [f, setF] = useState({
    fechaDesde: hoy as string | null,
    fechaHasta: hoy as string | null,
    empleadoDesde: '',
    empleadoHasta: '',
  })
  const [destino, setDestino] = useState<'pantalla' | 'impresora'>('pantalla')
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))

  useEffect(() => {
    Promise.all([
      supabase.from('empleado').select('codigo').order('codigo').limit(1),
      supabase.from('empleado').select('codigo').order('codigo', { ascending: false }).limit(1),
    ]).then(([a, b]) =>
      setF((x) => ({
        ...x,
        empleadoDesde: (a.data?.[0]?.codigo as string) ?? '',
        empleadoHasta: (b.data?.[0]?.codigo as string) ?? '',
      })),
    )
  }, [])

  function aceptar() {
    inf.procesar(
      {
        titulo: 'Listado de Aperturas de Cajón',
        sinCaptura: true,
        columnas: [
          { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 70 },
          { key: 'hora', titulo: 'Hora', ancho: 60 },
          { key: 'tienda', titulo: 'Tienda', ancho: 50 },
          { key: 'documento', titulo: 'Venta', ancho: 80 },
          { key: 'motivo', titulo: 'Motivo' },
          {
            key: 'n',
            titulo: 'Aperturas',
            tipo: 'entero',
            ancho: 70,
            suma: true,
          },
        ],
        filtros: [
          `Fecha: ${fechaEs(f.fechaDesde) || '…'} a ${fechaEs(f.fechaHasta) || '…'}`,
          `Empleados: ${f.empleadoDesde || '…'} a ${f.empleadoHasta || '…'}`,
        ],
        cargar: () =>
          rpc('fn_lst_aperturas_cajon', {
            ...f,
            fechaDesde: f.fechaDesde ?? '',
            fechaHasta: f.fechaHasta ?? '',
          }),
      },
      destino,
    )
  }

  return (
    <>
      <DialogoListado titulo="Listado de Aperturas de Cajón" ancho={234} onAceptar={aceptar} textoCancelar="Salir" procesando={inf.cargando}>
        {inf.error && <div className="text-[11px] text-[#c42b1c]">{inf.error}</div>}
        <div className="mx-auto">
          <div className={`${DLG.marco} relative pt-3!`}>
            <span className={`${DLG.etiqueta} absolute left-1.5 top-[-2px]`}>Fecha:</span>
            <div className="flex items-center gap-1">
              <div className="grid grid-cols-[auto_auto] items-center gap-x-1 gap-y-[2px]">
                <span className={`${DLG.etiqueta} text-right`}>Desde:</span>
                <GwDate className={`${DLG.fecha} w-[68px]!`} value={f.fechaDesde} onChange={(v) => set({ fechaDesde: v })} title="Desde" />
                <span className={`${DLG.etiqueta} text-right`}>Hasta:</span>
                <GwDate className={`${DLG.fecha} w-[68px]!`} value={f.fechaHasta} onChange={(v) => set({ fechaHasta: v })} title="Hasta" />
              </div>
              <button type="button" className={`${DLG.boton} min-w-0! px-1!`} onClick={() => set({ fechaDesde: hoyIso(), fechaHasta: hoyIso() })}>
                Hoy
              </button>
            </div>
          </div>
        </div>
        <div className={`${DLG.marco} relative pt-3!`}>
          <span className={`${DLG.etiqueta} absolute left-1.5 top-[-2px]`}>Empleado:</span>
          <div className="grid grid-cols-[auto_auto] items-center gap-x-1 gap-y-[2px]">
            <span className={`${DLG.etiqueta} text-right`}>Desde:</span>
            <DlgCodigoNombre
              valor={f.empleadoDesde}
              onChange={(v) => set({ empleadoDesde: v })}
              buscador="empleado"
              anchoCodigo={54}
              anchoNombre={110}
              title="Empleado desde"
            />
            <span className={`${DLG.etiqueta} text-right`}>Hasta:</span>
            <DlgCodigoNombre
              valor={f.empleadoHasta}
              onChange={(v) => set({ empleadoHasta: v })}
              buscador="empleado"
              anchoCodigo={54}
              anchoNombre={110}
              title="Empleado hasta"
            />
          </div>
        </div>
        <div className="flex justify-center">
          <DlgDestino nombre="cajon-dest" valor={destino} onChange={setDestino} />
        </div>
      </DialogoListado>
      {inf.vista}
    </>
  )
}
