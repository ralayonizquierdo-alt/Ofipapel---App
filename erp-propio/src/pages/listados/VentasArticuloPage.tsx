import { useState } from 'react'
import {
  BotonOpcion,
  GrupoFecha,
  GrupoRango,
  LST_INPUT,
  LstCheck,
  LstGrupo,
  LstRadio,
  ListadoVentana,
  describirFecha,
  describirPar,
  describirRango,
  par,
  rango,
  rangoSql,
  useInforme,
  type Destino,
  type Par,
  type RangoFecha,
} from '../../components/gw/GwListado'
import {
  GrupoCampoCliente,
  GrupoTiendaNumero,
  campoCliente,
  describirCampoCliente,
  describirTiendaNumero,
  mesEnCurso,
  rpc,
  tiendaNumero,
  tiendaNumeroSql,
} from './comun'

// Ventas → Listados → List. Ventas → Ventas por Artículo (Alt+F9; captura 06-02: «Listado de
// Ventas por Artículo»). Filtros calcados; columnas del informe sin captura: confirmar con Luis.
// Cálculo en fn_lst_ventas_articulo (unidades, importe sin IGIC, coste, beneficio y %).

const INFORMES = [
  { value: 'articulo', label: 'Ventas por Artículo' },
  { value: 'familia_articulo', label: 'Ventas por Artículo Agrupado por Familia' },
  { value: 'familia', label: 'Ventas por Familia' },
  { value: 'marca', label: 'Ventas por Marca' },
  { value: 'proveedor_articulo', label: 'Ventas por Artículo Agrupado por Proveedor' },
  { value: 'proveedor', label: 'Ventas por Proveedor' },
  { value: 'cliente_articulo', label: 'Ventas por Artículo Agrupado por Cliente' },
]

const ORDENES = [
  { value: 'cod_intern', label: 'Cod_intern' },
  { value: 'descripcion', label: 'Descripcion' },
  { value: 'unidades', label: 'Unidades (de mayor a menor)' },
  { value: 'importe', label: 'Importe (de mayor a menor)' },
  { value: 'beneficio', label: 'Beneficio (de mayor a menor)' },
]

const CAMPOS_FECHA = [
  { value: 'venta', label: 'Venta' },
  { value: 'factura', label: 'Factura' },
  { value: 'pagoVenta', label: 'Pago Venta' },
  { value: 'pagoFactura', label: 'Pago Factura' },
]

type Por = 'vendedor' | 'tecnico' | 'empleado'

export function VentasArticuloPage() {
  const inf = useInforme()
  const [informe, setInforme] = useState('articulo')
  const [soloTotales, setSoloTotales] = useState(false)
  const [agrupar, setAgrupar] = useState({ tienda: false, almacen: false, descripcion: false })
  const [orden, setOrden] = useState('cod_intern')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [campoFecha, setCampoFecha] = useState('venta')
  const [fecha, setFecha] = useState<RangoFecha>(() => ({ modo: 'cualquiera', desde: mesEnCurso().desde, hasta: '' }))
  const [formas, setFormas] = useState(rango())
  const [fraccionados, setFraccionados] = useState(false)
  const [clientes, setClientes] = useState(rango())
  const [campoCli, setCampoCli] = useState(campoCliente())
  const [porArt, setPorArt] = useState<'articulo' | 'familia'>('articulo')
  const [nivelFam, setNivelFam] = useState<'1' | '2' | '3'>('3')
  const [articulos, setArticulos] = useState(rango())
  const [porMarca, setPorMarca] = useState<'marca' | 'campo_libre'>('marca')
  const [marcas, setMarcas] = useState(rango())
  const [por, setPor] = useState<Por>('vendedor')
  const [personas, setPersonas] = useState(rango())
  const [proveedores, setProveedores] = useState(rango())
  const [tiendas, setTiendas] = useState(rango())
  const [tNum, setTNum] = useState(tiendaNumero())
  const [facturadas, setFacturadas] = useState<Par>(par())
  const [pagadas, setPagadas] = useState<Par>(par())
  const [aplazadas, setAplazadas] = useState(false)
  const [ranking, setRanking] = useState({ activo: false, por: 'valor', modo: 'mas', n: 10 })

  function procesar() {
    const p = {
      informe,
      orden,
      agrupar,
      campoFecha,
      fecha,
      formasPago: rangoSql(formas),
      fraccionados,
      clientes: rangoSql(clientes),
      campoCliente: campoCli,
      articulos: { ...rangoSql(articulos), por: porArt, nivelFamilia: nivelFam },
      marcas: { ...rangoSql(marcas), por: porMarca },
      filtrarPor: por,
      personas: rangoSql(personas),
      proveedores: rangoSql(proveedores),
      tiendas: rangoSql(tiendas),
      tiendaNumero: tiendaNumeroSql(tNum),
      facturadas,
      pagadas,
      soloAplazadas: aplazadas,
      ranking,
    }
    const clave =
      informe === 'familia' ? 'Familia' : informe === 'marca' ? 'Marca' : informe === 'proveedor' ? 'Proveedor' : agrupar.descripcion ? 'Descripción' : 'Cód. Interno'
    const nombrePor = por === 'tecnico' ? 'Técnicos' : por === 'empleado' ? 'Empleados' : 'Vendedores'
    inf.procesar(
      {
        titulo: INFORMES.find((i) => i.value === informe)?.label ?? 'Ventas por Artículo',
        sinCaptura: true,
        soloTotales,
        columnas: [
          ...(informe === 'marca' || (agrupar.descripcion && !['familia', 'proveedor'].includes(informe)) ? [] : [{ key: 'clave', titulo: clave, ancho: 90 }]),
          { key: 'descripcion', titulo: informe === 'marca' ? 'Marca' : 'Descripción' },
          { key: 'unidades', titulo: 'Unidades', tipo: 'num', dec: 3, ancho: 75 },
          { key: 'importe', titulo: 'Importe', tipo: 'num', ancho: 85 },
          { key: 'coste', titulo: 'Coste', tipo: 'num', ancho: 80 },
          { key: 'beneficio', titulo: 'Beneficio', tipo: 'num', ancho: 80 },
          { key: 'pct_beneficio', titulo: '% Benef.', tipo: 'num', ancho: 60 },
        ],
        filtros: [
          describirFecha(`Fecha de ${CAMPOS_FECHA.find((c) => c.value === campoFecha)?.label.toLowerCase()}`, fecha),
          describirRango('Formas de pago', formas),
          fraccionados && 'Solo pagos fraccionados',
          describirRango('Clientes', clientes),
          describirCampoCliente(campoCli),
          describirRango(porArt === 'familia' ? `Familias (nivel ${nivelFam}º)` : 'Artículos', articulos),
          describirRango(porMarca === 'marca' ? 'Marcas' : 'Campo libre', marcas),
          describirRango(nombrePor, personas),
          describirRango('Proveedores', proveedores),
          describirRango('Tiendas', tiendas),
          describirTiendaNumero('Tienda y número de venta', tNum),
          describirPar('Facturadas', 'No facturadas', facturadas),
          describirPar('Pagadas', 'No pagadas', pagadas),
          aplazadas && 'Solo ventas aplazadas',
          (agrupar.tienda || agrupar.almacen || agrupar.descripcion) &&
            `Artículos agrupados por: ${[agrupar.tienda && 'tienda', agrupar.almacen && 'almacén', agrupar.descripcion && 'descripción'].filter(Boolean).join(', ')}`,
          ranking.activo &&
            `Los ${ranking.n} artículos ${ranking.modo === 'menos' ? 'menos' : 'más'} vendidos según ${{ valor: 'valor', cantidad: 'cantidad', beneficio: 'beneficio', pct: '% de beneficio' }[ranking.por]}`,
          'Importes sin IGIC; coste: precio de compra liquidado de la línea o coste neto del artículo',
        ],
        cargar: () => rpc('fn_lst_ventas_articulo', p),
      },
      destino,
    )
  }

  return (
    <>
      <ListadoVentana
        informes={INFORMES}
        informe={informe}
        onInforme={setInforme}
        cabeceraExtra={<LstCheck label="Sólo Ver los Totales del informe" on={soloTotales} set={setSoloTotales} />}
        cabeceraDebajo={
          <>
            <span>Agrupar Artículos por</span>
            <LstCheck label="Tienda" on={agrupar.tienda} set={(v) => setAgrupar({ ...agrupar, tienda: v })} />
            <LstCheck label="Almacén" on={agrupar.almacen} set={(v) => setAgrupar({ ...agrupar, almacen: v })} />
            <LstCheck label="Descripción" on={agrupar.descripcion} set={(v) => setAgrupar({ ...agrupar, descripcion: v })} title="Agrupa por el texto de la línea (artículos genéricos)" />
          </>
        }
        ordenes={ORDENES}
        orden={orden}
        onOrden={setOrden}
        destino={destino}
        onDestino={setDestino}
        onProcesar={procesar}
        procesando={inf.cargando}
      >
        {inf.error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[14px] text-[#c42b1c]">{inf.error}</div>}
        <div className="grid grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)] gap-2">
          <GrupoFecha nombre="va-fecha" campos={CAMPOS_FECHA} campo={campoFecha} onCampo={setCampoFecha} valor={fecha} onChange={setFecha} />
          <GrupoRango
            nombre="va-formas"
            titulo={
              <>
                <span>Formas de pago</span>
                <LstCheck label="Fraccionados" on={fraccionados} set={setFraccionados} className="text-[17px]" title="Solo ventas cobradas con más de una forma de pago" />
              </>
            }
            valor={formas}
            onChange={setFormas}
            buscador="formaPago"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrupoRango nombre="va-clientes" titulo="Clientes" valor={clientes} onChange={setClientes} buscador="cliente" />
          <GrupoCampoCliente titulo="Filtrar Clientes" multiple="Múltip." valor={campoCli} onChange={setCampoCli} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrupoRango
            nombre="va-art"
            titulo={
              <>
                <span>Filtrar por:</span>
                <LstRadio nombre="va-porart" label="Artículo" on={porArt === 'articulo'} set={() => setPorArt('articulo')} />
                <LstRadio nombre="va-porart" label="Familia, Nivel:" on={porArt === 'familia'} set={() => setPorArt('familia')} />
                {(['1', '2', '3'] as const).map((n) => (
                  <LstRadio key={n} nombre="va-nivel" label={`${n}º`} on={nivelFam === n} set={() => setNivelFam(n)} disabled={porArt !== 'familia'} />
                ))}
              </>
            }
            valor={articulos}
            onChange={setArticulos}
            buscador={porArt === 'familia' ? 'familia' : 'articulo'}
          />
          <GrupoRango
            nombre="va-marca"
            titulo={
              <>
                <span>Filtrar por:</span>
                <LstRadio nombre="va-pormarca" label="Marca" on={porMarca === 'marca'} set={() => setPorMarca('marca')} />
                <LstRadio nombre="va-pormarca" label="Campo Libre" on={porMarca === 'campo_libre'} set={() => setPorMarca('campo_libre')} />
              </>
            }
            valor={marcas}
            onChange={setMarcas}
            buscador={porMarca === 'marca' ? 'marca' : undefined}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrupoRango
            nombre="va-personas"
            titulo={
              <>
                <span>Filtrar por:</span>
                {(['vendedor', 'tecnico', 'empleado'] as Por[]).map((k) => (
                  <LstRadio key={k} nombre="va-por" label={k === 'vendedor' ? 'Vendedor' : k === 'tecnico' ? 'Técnico' : 'Empleado'} on={por === k} set={() => setPor(k)} />
                ))}
              </>
            }
            valor={personas}
            onChange={setPersonas}
            buscador={por}
          />
          <GrupoRango nombre="va-prov" titulo="Proveedores" valor={proveedores} onChange={setProveedores} buscador="proveedor" />
        </div>
        <div className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)] gap-2">
          <GrupoRango nombre="va-tiendas" titulo="Tiendas" valor={tiendas} onChange={setTiendas} buscador="tienda" />
          <GrupoTiendaNumero nombre="va-tnum" titulo="Tienda y Número de Venta" valor={tNum} onChange={setTNum} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <LstGrupo titulo="Estado de la venta">
            <div className="grid grid-cols-[1fr_0.85fr_0.85fr] gap-x-2 gap-y-1 pt-1">
              <BotonOpcion label="No Facturadas" on={facturadas.no} set={(v) => setFacturadas({ ...facturadas, no: v })} />
              <BotonOpcion label="Facturadas" on={facturadas.si} set={(v) => setFacturadas({ ...facturadas, si: v })} />
              <div className="flex gap-1" title="Dígito de control de facturación de GeminisWin: no se usa en el ERP">
                <BotonOpcion label="D.C." on={false} disabled className="flex-1" />
                <select className={`${LST_INPUT} h-[32px]! w-[80px]! flex-none`} disabled defaultValue="" />
              </div>
              <BotonOpcion label="No Pagadas" on={pagadas.no} set={(v) => setPagadas({ ...pagadas, no: v })} />
              <BotonOpcion label="Pagadas" on={pagadas.si} set={(v) => setPagadas({ ...pagadas, si: v })} />
              <BotonOpcion label="Aplazadas" on={aplazadas} set={setAplazadas} title="Solo ventas aplazadas" />
            </div>
          </LstGrupo>
          <LstGrupo
            titulo={<LstCheck label="Filtrar los Artículos más / menos Vendidos según..." on={ranking.activo} set={(v) => setRanking({ ...ranking, activo: v })} />}
            disabled={!ranking.activo}
          >
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex">
                {[
                  ['valor', 'Valor'],
                  ['cantidad', 'Cantidad'],
                  ['beneficio', 'Beneficio'],
                  ['pct', '% Benef.'],
                ].map(([k, l]) => (
                  <BotonOpcionSel key={k} label={l} on={ranking.por === k} disabled={!ranking.activo} onClick={() => setRanking({ ...ranking, por: k })} />
                ))}
              </div>
              <div className="flex gap-1">
                <select className={LST_INPUT} disabled={!ranking.activo} value={ranking.modo} onChange={(e) => setRanking({ ...ranking, modo: e.target.value })}>
                  <option value="mas">Nº máximo de solo artículos vendidos a mostrar</option>
                  <option value="menos">Nº máximo de artículos menos vendidos a mostrar</option>
                </select>
                <input
                  type="number"
                  min={1}
                  className={`${LST_INPUT} w-[160px]! flex-none text-right`}
                  disabled={!ranking.activo}
                  value={ranking.n}
                  onChange={(e) => setRanking({ ...ranking, n: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
            </div>
          </LstGrupo>
        </div>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}

/** Opción de una barra de botones excluyentes (la elegida lleva ✓ verde, como en la captura). */
function BotonOpcionSel({ label, on, disabled, onClick }: { label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-[30px] flex-1 items-center justify-center gap-1 border text-[17px] disabled:text-[#8a8a8a] ${
        on ? 'border-[#8a8a8a] border-b-white border-r-white bg-[#f7f7f7] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.3)]' : 'border-[var(--gw-border)] bg-[#ececec]'
      }`}
    >
      {on && <span className="text-[#2a9d2a]">✓</span>}
      {label}
    </button>
  )
}
