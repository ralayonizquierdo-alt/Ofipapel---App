// Datos comunes de las utilidades (tablas del ERP y formato de fecha).

import { supabase } from '../../lib/supabase'

export interface TablaErp {
  tabla: string
  columnas: { nombre: string; tipo: string }[]
  pk: string[]
  filas_estimadas: number | null
}

/** Tablas del ERP que puede leer el usuario, con columnas y clave primaria (fn_tablas_erp). */
export async function cargarTablasErp(): Promise<TablaErp[]> {
  const { data, error } = await supabase.rpc('fn_tablas_erp')
  if (error) throw new Error(error.message)
  return (data ?? []) as TablaErp[]
}

export const fechaEs = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
