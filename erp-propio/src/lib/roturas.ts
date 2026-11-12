// Gestor de Roturas (tarea 32, docs/ROTURAS.md): tipos y acceso a datos comunes a las pantallas de
// Almacén y Compras. Nadie escribe en las tablas rotura_*: todo pasa por las funciones fn_rotura_*.
// Los ficheros (fotos, facturas…) van al almacenamiento PRIVADO «roturas» y se ven con enlaces
// firmados de pocos minutos.

import { supabase } from './supabase'

export type EstadoRotura =
  | 'PENDIENTE_COMPRAS'
  | 'ABONO_PROVEEDOR'
  | 'SEPARADO_PROVEEDOR'
  | 'PENDIENTE'
  | 'RECHAZADO'
  | 'OBSOLETO_DESTRUIR'
  | 'ABONADO_DESTRUIR'
  | 'COMPENSADO_DESTRUIR'
  | 'ABONADO'
  | 'DESTRUIDO'

export type OrigenRotura = 'REPARTO' | 'PROVEEDOR' | 'TIENDA' | 'ALMACEN'
export type TipoDocumentoRotura = 'FOTO' | 'PDF' | 'EMAIL' | 'FACTURA' | 'ALBARAN' | 'EXCEL' | 'ABONO' | 'OTRO'

export const ORIGENES_ROTURA: { codigo: OrigenRotura; nombre: string }[] = [
  { codigo: 'REPARTO', nombre: 'Reparto' },
  { codigo: 'PROVEEDOR', nombre: 'Proveedor (llegó roto)' },
  { codigo: 'TIENDA', nombre: 'Tienda' },
  { codigo: 'ALMACEN', nombre: 'Almacén' },
]

export interface EstadoRoturaInfo {
  codigo: EstadoRotura
  nombre: string
  orden: number
  final: boolean
  color: string
}

export interface ExpedienteRotura {
  id: number
  numero: string
  fecha: string
  estado: EstadoRotura
  articulo_codigo: string
  articulo_referencia: string | null
  articulo_descripcion: string
  proveedor_codigo: string
  almacen_codigo: string
  cantidad: number
  motivo: string
  descripcion: string | null
  origen_rotura: OrigenRotura
  procedencia: string | null
  empleado_solicitante_codigo: string | null
  empleado_entrega: string | null
  fecha_compra: string | null
  importe_estimado: number | null
  observaciones: string | null
  reclamacion_enviada_en: string | null
  tipo_cuadre: 'ABONO' | 'COMPENSACION_GENERO' | null
  pendiente_contabilizar: boolean
  creado_offline: boolean
  anulado_en: string | null
  anulado_motivo: string | null
  creado_por: string | null
  creado_en: string
  actualizado_en: string
}

export interface DocumentoRotura {
  id: number
  expediente_id: number
  tipo: TipoDocumentoRotura
  nombre: string
  ruta: string
  creado_por: string | null
  creado_en: string
}

/** Datos que rellena Almacén al registrar una rotura. */
export interface NuevaRotura {
  articulo_codigo: string
  proveedor_codigo?: string | null
  almacen_codigo: string
  cantidad: number
  motivo: string
  descripcion?: string | null
  origen_rotura: OrigenRotura
  procedencia?: string | null
  empleado_entrega?: string | null
  fecha_compra?: string | null
  importe_estimado?: number | null
  observaciones?: string | null
  /** Identificador que pone el móvil: si reenvía la misma rotura al recuperar cobertura, no se duplica. */
  clave_cliente?: string
  creado_offline?: boolean
}

const mensaje = (e: { message?: string } | null) => e?.message ?? 'No se ha podido completar la operación.'

export async function estadosRotura(): Promise<EstadoRoturaInfo[]> {
  const { data, error } = await supabase.from('rotura_estado').select('codigo, nombre, orden, final, color').order('orden')
  if (error) throw new Error(mensaje(error))
  return (data ?? []) as EstadoRoturaInfo[]
}

export async function crearRotura(r: NuevaRotura): Promise<{ id: number; numero: string; repetido: boolean }> {
  const { data, error } = await supabase.rpc('fn_rotura_crear', { p: r })
  if (error) throw new Error(mensaje(error))
  return data as { id: number; numero: string; repetido: boolean }
}

/** Estados a los que este usuario puede mover el expediente (para pintar los botones). */
export async function destinosRotura(id: number): Promise<{ estado: EstadoRotura; nombre: string; solo_proceso: boolean }[]> {
  const { data, error } = await supabase.rpc('fn_rotura_destinos', { p_id: id })
  if (error) throw new Error(mensaje(error))
  return (data ?? []) as { estado: EstadoRotura; nombre: string; solo_proceso: boolean }[]
}

export async function cambiarEstadoRotura(id: number, destino: EstadoRotura, observaciones?: string) {
  const { error } = await supabase.rpc('fn_rotura_cambiar_estado', { p_id: id, p_destino: destino, p_observaciones: observaciones ?? null })
  if (error) throw new Error(mensaje(error))
}

export async function anularRotura(id: number, motivo: string) {
  const { error } = await supabase.rpc('fn_rotura_anular', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(mensaje(error))
}

// ---------------------------------------------------------------- Ficheros

const BUCKET = 'roturas'
const LADO_MAXIMO = 1600 // px: una foto de móvil pesa 3-8 MB; así queda en unos 300 KB sin perder detalle útil

/** Reduce una foto en el navegador antes de subirla (los móviles hacen fotos enormes). */
export async function reducirFoto(archivo: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return archivo
  try {
    const imagen = await createImageBitmap(archivo)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height))
    if (escala === 1 && archivo.size < 600_000) return archivo
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(imagen.width * escala)
    lienzo.height = Math.round(imagen.height * escala)
    lienzo.getContext('2d')?.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.82))
    if (!blob || blob.size >= archivo.size) return archivo
    return new File([blob], archivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return archivo // si el navegador no sabe leerla, se sube tal cual
  }
}

const nombreSeguro = (n: string) =>
  n
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(-80) || 'fichero'

/** Sube un fichero al expediente y lo apunta en él. Las fotos se reducen antes. */
export async function subirDocumentoRotura(expedienteId: number, archivo: File, tipo: TipoDocumentoRotura): Promise<DocumentoRotura['ruta']> {
  const fichero = tipo === 'FOTO' ? await reducirFoto(archivo) : archivo
  const ruta = `${expedienteId}/${crypto.randomUUID()}-${nombreSeguro(fichero.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, fichero, { contentType: fichero.type || undefined, upsert: false })
  if (error) throw new Error(`No se ha podido subir «${archivo.name}»: ${error.message}`)
  const { error: errReg } = await supabase.rpc('fn_rotura_documento_registrar', { p_expediente: expedienteId, p_tipo: tipo, p_nombre: archivo.name, p_ruta: ruta })
  if (errReg) throw new Error(mensaje(errReg))
  return ruta
}

export async function documentosRotura(expedienteId: number): Promise<DocumentoRotura[]> {
  const { data, error } = await supabase.from('rotura_documento').select('id, expediente_id, tipo, nombre, ruta, creado_por, creado_en').eq('expediente_id', expedienteId).order('id')
  if (error) throw new Error(mensaje(error))
  return (data ?? []) as DocumentoRotura[]
}

/** Enlace temporal (10 minutos) para ver o descargar un fichero del expediente. */
export async function enlaceDocumentoRotura(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 600)
  if (error || !data?.signedUrl) throw new Error('No se ha podido abrir el fichero.')
  return data.signedUrl
}
