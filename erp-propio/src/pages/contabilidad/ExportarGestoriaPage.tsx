import { useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwGroup } from '../../components/gw'
import { cargarAsientosConApuntes, cargarDescripciones, cargarLibro, descargarCsv, fechaEs, finAnio, inicioAnio, leerTodo, numCsv } from './contabModel'
import { Aviso, Rango } from './ui'

/**
 * Contabilidad → Exportar a Gestoría. Formato genérico CSV («;», coma decimal, UTF-8 con BOM)
 * que abre Excel y que cualquier programa contable importa definiendo las columnas.
 * Formato Sage: pendiente de confirmar con la gestoría qué programa y qué plantilla usan.
 */
export function ExportarGestoriaPage() {
  const [desde, setDesde] = useState(inicioAnio())
  const [hasta, setHasta] = useState(finAnio())
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function ejecutar(nombre: string, fn: () => Promise<number>) {
    setTrabajando(true)
    setError(null)
    setOk(null)
    try {
      const n = await fn()
      setOk(`${nombre}: ${n} líneas exportadas.`)
    } catch (e) {
      setError((e as Error).message)
    }
    setTrabajando(false)
  }

  const diario = () =>
    ejecutar('Diario', async () => {
      const { asientos, porAsiento } = await cargarAsientosConApuntes(desde, hasta, ['correcto'])
      const errores = await supabase.from('asiento').select('id', { count: 'exact', head: true }).eq('estado', 'error').gte('fecha', desde).lte('fecha', hasta)
      if (errores.count) setError(`Atención: hay ${errores.count} asiento(s) con errores en el periodo que NO se exportan. Revísalos en Asientos Pendientes.`)
      const desc = await cargarDescripciones([...porAsiento.values()].flat().map((p) => p.cuenta ?? ''))
      const filas: unknown[][] = []
      for (const a of asientos)
        for (const p of porAsiento.get(a.id) ?? [])
          filas.push([
            fechaEs(a.fecha),
            a.numero,
            p.linea,
            p.cuenta,
            desc.get(p.cuenta ?? '')?.descripcion ?? '',
            numCsv(p.debe),
            numCsv(p.haber),
            p.concepto ?? a.concepto,
            p.documento ?? '',
            p.nif ?? desc.get(p.cuenta ?? '')?.nif ?? '',
            p.contrapartida ?? '',
            p.igic_tipo == null ? '' : numCsv(p.igic_tipo),
            p.igic_base == null ? '' : numCsv(p.igic_base),
          ])
      descargarCsv(
        `gestoria_diario_${desde}_${hasta}.csv`,
        ['Fecha', 'Asiento', 'Linea', 'Cuenta', 'Descripcion', 'Debe', 'Haber', 'Concepto', 'Documento', 'NIF', 'Contrapartida', 'TipoIGIC', 'BaseIGIC'],
        filas,
      )
      return filas.length
    })

  const libro = (l: 'emitidas' | 'recibidas') =>
    ejecutar(`Libro de IGIC ${l}`, async () => {
      const lineas = await cargarLibro(desde, hasta, l)
      descargarCsv(
        `gestoria_igic_${l}_${desde}_${hasta}.csv`,
        ['Fecha', 'Documento', 'Clase', 'NIF', 'Nombre', 'TipoIGIC', 'Base', 'Cuota', 'Total'],
        lineas.map((x) => [fechaEs(x.fecha), x.documento, x.clase, x.nif ?? '', x.nombre ?? '', x.tipo == null ? '' : numCsv(x.tipo), numCsv(x.base), numCsv(x.cuota), numCsv(x.total)]),
      )
      return lineas.length
    })

  const subcuentas = () =>
    ejecutar('Subcuentas', async () => {
      const cs = await leerTodo<{ codigo: string; descripcion: string; nif: string | null; tercero_tipo: string | null }>((a, b) =>
        supabase.from('cuenta_contable').select('codigo, descripcion, nif, tercero_tipo').not('tercero_tipo', 'is', null).order('codigo').range(a, b),
      )
      descargarCsv(
        'gestoria_subcuentas_terceros.csv',
        ['Cuenta', 'Nombre', 'NIF', 'Tipo'],
        cs.map((c) => [c.codigo, c.descripcion, c.nif ?? '', c.tercero_tipo]),
      )
      return cs.length
    })

  return (
    <div className="flex min-w-0 max-w-[1000px] flex-col gap-1.5 text-[13px]">
      <GwGroup title="Periodo">
        <div className="flex items-end gap-2">
          <Rango desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        </div>
      </GwGroup>
      <GwGroup title="Ficheros (CSV para Excel / programa contable)">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="gw-btn" onClick={diario} disabled={trabajando}>
            <Download size={14} /> Diario de asientos
          </button>
          <button type="button" className="gw-btn" onClick={() => libro('emitidas')} disabled={trabajando}>
            <Download size={14} /> Libro IGIC emitidas
          </button>
          <button type="button" className="gw-btn" onClick={() => libro('recibidas')} disabled={trabajando}>
            <Download size={14} /> Libro IGIC recibidas
          </button>
          <button type="button" className="gw-btn" onClick={subcuentas} disabled={trabajando}>
            <Download size={14} /> Subcuentas de clientes y proveedores
          </button>
          <button type="button" className="gw-btn" disabled title="Pendiente: falta confirmar con la gestoría su programa (¿Sage?) y la plantilla de importación">
            Formato Sage (pendiente)
          </button>
        </div>
        <Aviso error={error} ok={ok} />
      </GwGroup>
      <GwGroup title="Formato de los ficheros">
        <div className="text-[12px] leading-snug">
          <p>
            Texto UTF-8 con BOM, separador <b>punto y coma</b>, decimales con <b>coma</b> y sin separador de miles, fechas <b>dd/mm/aaaa</b>, una
            cabecera en la primera fila. Se abren con doble clic en Excel.
          </p>
          <table className="gw-grid mt-1">
            <thead>
              <tr>
                <th className="w-[110px]">Columna (Diario)</th>
                <th>Contenido</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Fecha', 'Fecha del asiento'],
                ['Asiento', 'Número de asiento (correlativo por ejercicio)'],
                ['Linea', 'Orden del apunte dentro del asiento'],
                ['Cuenta', 'Subcuenta contable (8 dígitos por defecto; 430+código cliente, 400+código proveedor)'],
                ['Descripcion', 'Nombre de la subcuenta en el Plan de Cuentas'],
                ['Debe / Haber', 'Importe del apunte (uno de los dos a cero)'],
                ['Concepto', 'Texto del apunte (p. ej. «Factura A123 Cliente S.L.»)'],
                ['Documento', 'Nº de factura, ticket(s) o documento de pago'],
                ['NIF', 'NIF del tercero cuando el apunte es de cliente/proveedor o IGIC'],
                ['Contrapartida', 'Cuenta principal del lado contrario del asiento'],
                ['TipoIGIC / BaseIGIC', 'Solo en apuntes de las cuentas 472/477: tipo aplicado y base imponible'],
              ].map(([a, b]) => (
                <tr key={a}>
                  <td className="font-bold">{a}</td>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1">
            Solo se exportan asientos <b>correctos</b> (cuadrados). Los libros de IGIC llevan una línea por documento y tipo: Fecha, Documento, Clase
            (Factura / Rectificativa / Tickets), NIF, Nombre, TipoIGIC, Base, Cuota y Total.
          </p>
        </div>
      </GwGroup>
    </div>
  )
}
