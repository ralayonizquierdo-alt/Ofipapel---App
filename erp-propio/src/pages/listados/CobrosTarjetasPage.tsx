import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwDate } from '../../components/gw'
import { DLG, DialogoListado, DlgCodigoNombre, DlgDestino, DlgRadio, fechaEs, hoyIso, useInforme, type ColumnaInforme } from '../../components/gw/GwListado'
import { rpc } from './comun'

// Ventas → Listados → List. Tarjetas (captura 06-05: «Listado de Cobros en Tarjetas»).
// Los cobros salen de los movimientos de caja con forma de pago (lo que graba el cobro de una
// venta). Por defecto, de la primera a la última forma de pago de tipo tarjeta, como en la
// captura (02 … 95). Columnas del informe sin captura: confirmar con Luis.

export function CobrosTarjetasPage() {
  const inf = useInforme()
  const hoy = hoyIso()
  const [f, setF] = useState({
    tarjetaDesde: '',
    tarjetaHasta: '',
    fechaDesde: hoy as string | null,
    fechaHasta: hoy as string | null,
    tiendaDesde: '',
    tiendaHasta: '',
    vendedorDesde: '',
    vendedorHasta: '',
    agruparTienda: false,
    agruparVendedor: false,
    modo: 'resumido' as 'resumido' | 'desglosado',
  })
  const [destino, setDestino] = useState<'pantalla' | 'impresora'>('pantalla')
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))

  useEffect(() => {
    supabase
      .from('forma_pago')
      .select('codigo')
      .eq('tipo_contado', 2)
      .order('codigo')
      .then(({ data }) => {
        const c = (data ?? []).map((r) => r.codigo as string)
        if (c.length)
          setF((x) => ({
            ...x,
            tarjetaDesde: x.tarjetaDesde || c[0],
            tarjetaHasta: x.tarjetaHasta || c[c.length - 1],
          }))
      })
  }, [])

  function aceptar() {
    const des = f.modo === 'desglosado'
    const columnas: ColumnaInforme[] = des
      ? [
          { key: 'fecha', titulo: 'Fecha Vta.', tipo: 'fecha', ancho: 66 },
          { key: 'hora', titulo: 'Hora', ancho: 46 },
          { key: 'documento', titulo: 'Venta', ancho: 70 },
          { key: 'descripcion', titulo: 'Concepto' },
          { key: 'importe', titulo: 'Importe', tipo: 'num', ancho: 80 },
        ]
      : [
          { key: 'clave', titulo: 'Tarjeta', ancho: 50 },
          { key: 'descripcion', titulo: 'Descripción' },
          { key: 'n', titulo: 'Nº Cobros', tipo: 'entero', ancho: 70 },
          { key: 'importe', titulo: 'Importe', tipo: 'num', ancho: 90 },
        ]
    inf.procesar(
      {
        titulo: `Listado de Cobros en Tarjetas (${des ? 'Desglosado' : 'Resumido'})`,
        sinCaptura: true,
        columnas,
        filtros: [
          `Tarjetas (formas de pago): ${f.tarjetaDesde || '…'} a ${f.tarjetaHasta || '…'}`,
          `Fecha de venta: ${fechaEs(f.fechaDesde) || '…'} a ${fechaEs(f.fechaHasta) || '…'}`,
          (f.tiendaDesde || f.tiendaHasta) && `Tiendas: ${f.tiendaDesde || '…'} a ${f.tiendaHasta || '…'}`,
          (f.vendedorDesde || f.vendedorHasta) && `Vendedores: ${f.vendedorDesde || '…'} a ${f.vendedorHasta || '…'}`,
          (f.agruparTienda || f.agruparVendedor) &&
            `Agrupado por: ${[f.agruparTienda && 'tienda', f.agruparVendedor && 'vendedor'].filter(Boolean).join(' y ')}`,
        ],
        cargar: () =>
          rpc('fn_lst_cobros_tarjeta', {
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
      <DialogoListado titulo="Listado de Cobros en Tarjetas" ancho={284} onAceptar={aceptar} procesando={inf.cargando}>
        {inf.error && <div className="text-[11px] text-[#c42b1c]">{inf.error}</div>}
        <div>
          <div className={DLG.etiqueta}>Tarjeta:</div>
          <div className={`${DLG.marco} grid grid-cols-[auto_auto] items-center gap-x-1 gap-y-[2px]`}>
            <span className={`${DLG.etiqueta} text-right`}>Desde:</span>
            <DlgCodigoNombre
              valor={f.tarjetaDesde}
              onChange={(v) => set({ tarjetaDesde: v })}
              buscador="formaPago"
              anchoCodigo={20}
              anchoNombre={158}
              title="Forma de pago desde"
            />
            <span className={`${DLG.etiqueta} text-right`}>Hasta:</span>
            <DlgCodigoNombre
              valor={f.tarjetaHasta}
              onChange={(v) => set({ tarjetaHasta: v })}
              buscador="formaPago"
              anchoCodigo={20}
              anchoNombre={158}
              title="Forma de pago hasta"
            />
          </div>
        </div>
        <div className="flex items-start gap-1">
          <div>
            <div className={DLG.etiqueta}>Fecha Vta.:</div>
            <div className={`${DLG.marco} grid grid-cols-[auto_auto] items-center gap-x-2 gap-y-[2px] pl-2!`}>
              <span className={DLG.etiqueta}>Desde:</span>
              <GwDate className={DLG.fecha} value={f.fechaDesde} onChange={(v) => set({ fechaDesde: v })} title="Fecha de venta desde" />
              <span className={DLG.etiqueta}>Hasta:</span>
              <GwDate className={DLG.fecha} value={f.fechaHasta} onChange={(v) => set({ fechaHasta: v })} title="Fecha de venta hasta" />
            </div>
          </div>
          <div>
            <div className={DLG.etiqueta}>Tienda:</div>
            <div className={`${DLG.marco} flex items-center gap-1`}>
              <span className="text-[11px]">Desde:</span>
              <input className={`${DLG.input} w-[22px]`} value={f.tiendaDesde} onChange={(e) => set({ tiendaDesde: e.target.value })} title="Tienda desde" />
              <span className="ml-1 text-[11px]">Hasta:</span>
              <input className={`${DLG.input} w-[22px]`} value={f.tiendaHasta} onChange={(e) => set({ tiendaHasta: e.target.value })} title="Tienda hasta" />
            </div>
          </div>
        </div>
        <div className="flex items-start gap-1">
          <div>
            <div className={DLG.etiqueta}>Vendedor:</div>
            <div className={`${DLG.marco} flex flex-col gap-[2px] p-[2px]!`}>
              <DlgCodigoNombre
                valor={f.vendedorDesde}
                onChange={(v) => set({ vendedorDesde: v })}
                buscador="vendedor"
                anchoCodigo={20}
                anchoNombre={96}
                title="Vendedor desde"
              />
              <DlgCodigoNombre
                valor={f.vendedorHasta}
                onChange={(v) => set({ vendedorHasta: v })}
                buscador="vendedor"
                anchoCodigo={20}
                anchoNombre={96}
                title="Vendedor hasta"
              />
            </div>
          </div>
          <div>
            <div className={DLG.etiqueta}>Agrupar por:</div>
            <div className={`${DLG.marco} flex items-center gap-2 py-1.5!`}>
              <label className="flex items-center gap-1 font-bold">
                <input type="checkbox" className="m-0 h-[12px] w-[12px]" checked={f.agruparTienda} onChange={(e) => set({ agruparTienda: e.target.checked })} />
                Tienda
              </label>
              <label className="flex items-center gap-1 font-bold">
                <input
                  type="checkbox"
                  className="m-0 h-[12px] w-[12px]"
                  checked={f.agruparVendedor}
                  onChange={(e) => set({ agruparVendedor: e.target.checked })}
                />
                Vendedor
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-1.5 pt-1">
          <div className={`${DLG.marco} flex flex-col gap-1`}>
            <DlgRadio
              nombre="tarj-modo"
              label={
                <>
                  <u>D</u>esglosado
                </>
              }
              on={f.modo === 'desglosado'}
              set={() => set({ modo: 'desglosado' })}
            />
            <DlgRadio
              nombre="tarj-modo"
              label={
                <>
                  <u>R</u>esumido
                </>
              }
              on={f.modo === 'resumido'}
              set={() => set({ modo: 'resumido' })}
            />
          </div>
          <DlgDestino nombre="tarj-dest" valor={destino} onChange={setDestino} />
        </div>
      </DialogoListado>
      {inf.vista}
    </>
  )
}
