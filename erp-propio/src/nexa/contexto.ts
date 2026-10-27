// Contexto de pantalla para NEXA: dónde está el usuario, para que «¿cuánto nos ha comprado
// este año?» se entienda del cliente que tiene abierto.
//
// Por ahora basta con la ruta (no hay que tocar las pantallas). Una pantalla que quiera dar
// más detalle (p. ej. el nombre del cliente o el total del pedido en edición) puede llamar a
// `useNexaContexto({ cliente: '00123', nombre: 'Papelería X' })`; se manda con cada pregunta
// mientras la pantalla esté montada.

import { useEffect } from 'react'
import { windowTitle } from '../components/shell/menus'

export interface ContextoNexa {
  ruta: string
  descripcion: string
  datos?: Record<string, unknown>
}

// ---------------------------------------------------------------- Ruta → descripción

type Patron = { re: RegExp; describir: (m: RegExpMatchArray) => string }

const d = (s: string) => decodeURIComponent(s)

// Rutas con identificador (las de documento llevan /tienda/numero).
const PATRONES: Patron[] = [
  { re: /^\/clientes\/(?!lista$)([^/]+)$/, describir: (m) => `ficha del cliente ${d(m[1])}` },
  { re: /^\/articulos\/(?!lista$)([^/]+)$/, describir: (m) => `ficha del artículo ${d(m[1])}` },
  { re: /^\/proveedores\/(?!lista$)([^/]+)$/, describir: (m) => `ficha del proveedor ${d(m[1])}` },
  { re: /^\/pedidos\/([^/]+)\/(\d+)/, describir: (m) => `pedido de cliente ${d(m[1])}-${m[2]} (tienda ${d(m[1])}, número ${m[2]})` },
  { re: /^\/presupuestos\/([^/]+)\/(\d+)/, describir: (m) => `presupuesto ${d(m[1])}-${m[2]} (tabla pedido_cliente, tienda ${d(m[1])}, número ${m[2]})` },
  { re: /^\/reparaciones\/([^/]+)\/(\d+)/, describir: (m) => `reparación ${d(m[1])}-${m[2]} (tabla pedido_cliente, tienda ${d(m[1])}, número ${m[2]})` },
  { re: /^\/ventas\/([^/]+)\/(\d+)/, describir: (m) => `venta ${d(m[1])}-${m[2]} (tabla venta, tienda ${d(m[1])}, número ${m[2]})` },
  { re: /^\/tpv\/([^/]+)\/(\d+)/, describir: (m) => `venta del TPV ${d(m[1])}-${m[2]} (tabla venta, tienda ${d(m[1])}, número ${m[2]})` },
  { re: /^\/repartos\/([^/]+)\/(\d+)/, describir: (m) => `reparto ${d(m[1])}-${m[2]}` },
  { re: /^\/pedidos-proveedor\/([^/]+)\/(\d+)/, describir: (m) => `pedido a proveedor ${d(m[1])}-${m[2]} (tabla pedido_proveedor, tienda ${d(m[1])}, número ${m[2]})` },
  { re: /^\/facturas-proveedor\/([^/]+)\/(\d+)/, describir: (m) => `factura de proveedor ${d(m[1])}-${m[2]} (tabla factura_proveedor, tienda ${d(m[1])}, id ${m[2]})` },
  { re: /^\/pagos-proveedor\/([^/]+)\/(\d+)/, describir: (m) => `pago a proveedor ${d(m[1])}-${m[2]}` },
  { re: /^\/traspasos\/([^/]+)\/(\d+)/, describir: (m) => `traspaso de almacén ${d(m[1])}-${m[2]}` },
  { re: /^\/inventario\/([^/]+)\/(\d+)/, describir: (m) => `inventario ${d(m[1])}-${m[2]}` },
  { re: /^\/numeros-serie\/(\d+)/, describir: (m) => `número de serie (id ${m[1]})` },
  { re: /^\/familias\/([^/]+)$/, describir: (m) => `familia ${d(m[1])}` },
  { re: /^\/marcas\/([^/]+)$/, describir: (m) => `marca ${d(m[1])}` },
  { re: /^\/(vendedores|tecnicos|repartidores|transportistas)\/([^/]+)$/, describir: (m) => `${m[1].replace(/es$/, '').replace(/s$/, '')} ${d(m[2])}` },
]

/** Describe la pantalla a partir de la ruta: «ficha del cliente 00123», «Ventas»… */
export function describirRuta(pathname: string, search = ''): string {
  const ventana = windowTitle(pathname)
  for (const p of PATRONES) {
    const m = pathname.match(p.re)
    if (m) return ventana ? `${p.describir(m)}, en la ventana «${ventana}»` : p.describir(m)
  }
  if (pathname === '/' || pathname === '') return 'escritorio vacío (ninguna ventana abierta)'
  if (pathname === '/resumen') return 'Panel de Control (resumen del negocio)'
  const extra = search ? ` (parámetros ${search})` : ''
  return ventana ? `ventana «${ventana}»${extra}` : `pantalla ${pathname}${extra}`
}

// ---------------------------------------------------------------- Registro desde las pantallas

const registros = new Map<symbol, Record<string, unknown>>()

/**
 * Una pantalla añade datos al contexto de NEXA mientras está montada.
 * Pasa un objeto pequeño y serializable (códigos, nombres, totales…), nunca contraseñas.
 */
export function useNexaContexto(datos: Record<string, unknown> | null | undefined) {
  const clave = JSON.stringify(datos ?? null)
  useEffect(() => {
    if (!datos) return
    const id = Symbol('nexa-contexto')
    registros.set(id, datos)
    return () => {
      registros.delete(id)
    }
    // Se vuelve a registrar solo cuando cambia el contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
}

/** Contexto completo para mandar con la pregunta. */
export function contextoActual(pathname: string, search = ''): ContextoNexa {
  const datos: Record<string, unknown> = {}
  for (const r of registros.values()) Object.assign(datos, r)
  return {
    ruta: pathname + search,
    descripcion: describirRuta(pathname, search),
    ...(Object.keys(datos).length ? { datos } : {}),
  }
}
