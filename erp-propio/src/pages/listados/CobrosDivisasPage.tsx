import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwDate } from '../../components/gw'
import { DLG, DialogoListado, DlgCodigoNombre, DlgDestino, DlgRadio, fechaEs, hoyIso, useInforme } from '../../components/gw/GwListado'

// Ventas → Listados → List. Divisas (captura 06-07: «Listado de Cobros en Divisas»).
// El ERP no registra cobros en moneda extranjera (el TPV cobra solo en euros y la tabla de
// monedas está vacía), así que el informe sale vacío con un aviso claro. No hay función SQL:
// no hay nada que sumar. Cuando se registren, bastará con una fn_lst_cobros_divisas.

export function CobrosDivisasPage() {
  const inf = useInforme()
  const hoy = hoyIso()
  const [f, setF] = useState({ divisaDesde: '', divisaHasta: '', fechaDesde: hoy as string | null, fechaHasta: hoy as string | null, modo: 'resumido' })
  const [destino, setDestino] = useState<'pantalla' | 'impresora'>('pantalla')
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))

  useEffect(() => {
    supabase
      .from('moneda')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => {
        const c = (data ?? []).map((r) => r.codigo as string)
        if (c.length) setF((x) => ({ ...x, divisaDesde: c[0], divisaHasta: c[c.length - 1] }))
      })
  }, [])

  function aceptar() {
    inf.procesar(
      {
        titulo: `Listado de Cobros en Divisas (${f.modo === 'desglosado' ? 'Desglosado' : 'Resumido'})`,
        sinCaptura: true,
        aviso: 'Aviso: el ERP no registra cobros en divisas (el TPV cobra solo en euros y no hay monedas dadas de alta). No hay datos que listar.',
        columnas: [
          { key: 'clave', titulo: 'Divisa', ancho: 60 },
          { key: 'descripcion', titulo: 'Descripción' },
          { key: 'n', titulo: 'Nº Cobros', tipo: 'entero', ancho: 70 },
          { key: 'importe_divisa', titulo: 'Importe Divisa', tipo: 'num', ancho: 90 },
          { key: 'importe', titulo: 'Importe €', tipo: 'num', ancho: 90 },
        ],
        filtros: [`Divisas: ${f.divisaDesde || '…'} a ${f.divisaHasta || '…'}`, `Fecha de venta: ${fechaEs(f.fechaDesde) || '…'} a ${fechaEs(f.fechaHasta) || '…'}`],
        cargar: () => Promise.resolve({ data: [], error: null }),
      },
      destino,
    )
  }

  return (
    <>
      <DialogoListado titulo="Listado de Cobros en Divisas" ancho={252} onAceptar={aceptar} procesando={inf.cargando}>
        <div>
          <div className={DLG.etiqueta}>Divisa:</div>
          <div className={`${DLG.marco} grid grid-cols-[auto_auto] items-center gap-x-1 gap-y-1`}>
            <span className={`${DLG.etiqueta} text-right`}>Desde:</span>
            <DlgCodigoNombre valor={f.divisaDesde} onChange={(v) => set({ divisaDesde: v })} buscador="moneda" anchoCodigo={26} anchoNombre={156} title="Divisa desde" />
            <span className={`${DLG.etiqueta} text-right`}>Hasta:</span>
            <DlgCodigoNombre valor={f.divisaHasta} onChange={(v) => set({ divisaHasta: v })} buscador="moneda" anchoCodigo={26} anchoNombre={156} title="Divisa hasta" />
          </div>
        </div>
        <div className="mx-auto">
          <div className={DLG.etiqueta}>Fecha Vta.:</div>
          <div className={`${DLG.marco} grid grid-cols-[auto_auto] items-center gap-x-2 gap-y-1`}>
            <span className={DLG.etiqueta}>Desde:</span>
            <GwDate className={`${DLG.fecha} w-[62px]!`} value={f.fechaDesde} onChange={(v) => set({ fechaDesde: v })} title="Desde" />
            <span className={DLG.etiqueta}>Hasta:</span>
            <GwDate className={`${DLG.fecha} w-[62px]!`} value={f.fechaHasta} onChange={(v) => set({ fechaHasta: v })} title="Hasta" />
          </div>
        </div>
        <div className="flex justify-center gap-1.5 pt-1">
          <div className={`${DLG.marco} flex flex-col gap-1`}>
            <DlgRadio nombre="div-modo" label={<><u>D</u>esglosado</>} on={f.modo === 'desglosado'} set={() => set({ modo: 'desglosado' })} />
            <DlgRadio nombre="div-modo" label={<><u>R</u>esumido</>} on={f.modo === 'resumido'} set={() => set({ modo: 'resumido' })} />
          </div>
          <DlgDestino nombre="div-dest" valor={destino} onChange={setDestino} />
        </div>
      </DialogoListado>
      {inf.vista}
    </>
  )
}
