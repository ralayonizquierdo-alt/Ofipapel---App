import { useState } from 'react'
import { BotonOpcion, GrupoRango, LstGrupo, describirPar, describirRango, par, rango, rangoSql, type Par, type Rango } from '../../../components/gw/GwListado'

// Filtros de cliente comunes a los listados de Clientes y de Facturación (SIN CAPTURA de
// GeminisWin): Clientes, Zonas Territoriales, Vendedores, Tipos de Cliente, Rutas y Activos/Bajas.
// En SQL los aplica lst_cliente_filtro (migración 20261028_listados_clientes_facturacion.sql).

export interface FiltrosCliente {
  clientes: Rango
  zonas: Rango
  vendedores: Rango
  tiposCliente: Rango
  rutas: Rango
  activos: Par
}

export function useFiltrosCliente(soloActivos = true) {
  const [f, setF] = useState<FiltrosCliente>(() => ({
    clientes: rango(),
    zonas: rango(),
    vendedores: rango(),
    tiposCliente: rango(),
    rutas: rango(),
    activos: { ...par(), si: soloActivos },
  }))
  const set = (p: Partial<FiltrosCliente>) => setF((x) => ({ ...x, ...p }))
  const sql = () => ({
    clientes: rangoSql(f.clientes),
    zonas: rangoSql(f.zonas),
    vendedores: rangoSql(f.vendedores),
    tiposCliente: rangoSql(f.tiposCliente),
    rutas: rangoSql(f.rutas),
    activos: f.activos,
  })
  const describir = () => [
    describirRango('Clientes', f.clientes),
    describirRango('Zonas territoriales', f.zonas),
    describirRango('Vendedores', f.vendedores),
    describirRango('Tipos de cliente', f.tiposCliente),
    describirRango('Rutas', f.rutas),
    describirPar('Solo clientes activos', 'Solo clientes de baja', f.activos),
  ]
  return { f, set, sql, describir }
}

/** Rejilla de grupos de filtro de cliente. `sinClientes` cuando el listado pone el de clientes aparte. */
export function GruposCliente({
  fc,
  prefijo,
  sinRutas,
  sinTipos,
}: {
  fc: ReturnType<typeof useFiltrosCliente>
  prefijo: string
  sinRutas?: boolean
  sinTipos?: boolean
}) {
  const { f, set } = fc
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <GrupoRango nombre={`${prefijo}-cli`} titulo="Clientes" valor={f.clientes} onChange={(v) => set({ clientes: v })} buscador="cliente" />
        <GrupoRango nombre={`${prefijo}-zon`} titulo="Zonas Territoriales" valor={f.zonas} onChange={(v) => set({ zonas: v })} buscador="zona" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <GrupoRango nombre={`${prefijo}-ven`} titulo="Vendedores" valor={f.vendedores} onChange={(v) => set({ vendedores: v })} buscador="vendedor" />
        {!sinTipos ? (
          <GrupoRango nombre={`${prefijo}-tip`} titulo="Tipos de Cliente" valor={f.tiposCliente} onChange={(v) => set({ tiposCliente: v })} buscador="tipoCliente" />
        ) : (
          <span />
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2">
        {!sinRutas ? (
          <GrupoRango nombre={`${prefijo}-rut`} titulo="Rutas de Reparto" valor={f.rutas} onChange={(v) => set({ rutas: v })} buscador="ruta" />
        ) : (
          <span />
        )}
        <EstadoCliente fc={fc} />
      </div>
    </>
  )
}

/** «Estado del Cliente»: ×/✓ Activos · De Baja (ninguno o los dos = todos). */
export function EstadoCliente({ fc }: { fc: ReturnType<typeof useFiltrosCliente> }) {
  const { f, set } = fc
  return (
    <LstGrupo titulo="Estado del Cliente">
      <div className="grid grid-cols-2 gap-2 pt-1">
        <BotonOpcion label="Activos" on={f.activos.si} set={(v) => set({ activos: { ...f.activos, si: v } })} />
        <BotonOpcion label="De Baja" on={f.activos.no} set={(v) => set({ activos: { ...f.activos, no: v } })} />
      </div>
    </LstGrupo>
  )
}

/** Mensaje de error del listado (igual que los demás listados). */
export function ErrorListado({ error }: { error: string | null }) {
  if (!error) return null
  return <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[14px] text-[#c42b1c]">{error}</div>
}

/** Fecha 'AAAA-MM-DD' de un campo fecha-hora 'AAAA-MM-DDTHH:MM:SS' ('' si vacío). */
export const soloFecha = (v: string) => (v ? v.slice(0, 10) : '')
