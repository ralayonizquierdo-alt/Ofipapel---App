// Abre los diálogos del menú Utilidades (y Archivo → Seleccionar Periodo) encima de la ventana
// actual: el menú lanza el evento «gw:utilidad» con la acción (Layout.runMenu). Al entrar carga
// también el ejercicio activo y la tienda por defecto de la sesión de trabajo.

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { elegirTienda, fijarEjercicioActivo, sesionTrabajo } from '../../lib/sesionTrabajo'
import { CambioFechaDialog, CambioTiendaDialog, SeleccionarPeriodoDialog } from './SesionDialogs'
import { EliminarTemporalesDialog, HacerCopiaDialog, TestearCopiaDialog } from './CopiaDialogs'

const EVENTO_UTILIDAD = 'gw:utilidad'

export function UtilidadesHost() {
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    const abrir = (e: Event) => setAbierto((e as CustomEvent<string>).detail)
    window.addEventListener(EVENTO_UTILIDAD, abrir)
    return () => window.removeEventListener(EVENTO_UTILIDAD, abrir)
  }, [])

  useEffect(() => {
    supabase
      .from('ejercicio')
      .select('anio, fecha_inicio, fecha_fin')
      .eq('activo', true)
      .maybeSingle()
      .then(({ data }) => fijarEjercicioActivo(data ? { anio: data.anio as number, desde: data.fecha_inicio as string, hasta: data.fecha_fin as string } : null))
    // Sin tienda elegida (o una que ya no existe): la primera, como hacían TPV y caja.
    supabase
      .from('tienda_terminal')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => {
        const lista = (data ?? []) as { codigo: string }[]
        const t = sesionTrabajo().tienda
        if (lista.length && !lista.some((x) => x.codigo === t)) elegirTienda(lista[0].codigo)
      })
  }, [])

  const cerrar = () => setAbierto(null)
  switch (abierto) {
    case 'cambio-tienda':
      return <CambioTiendaDialog onClose={cerrar} />
    case 'cambio-fecha':
      return <CambioFechaDialog conHora={false} onClose={cerrar} />
    case 'cambio-fecha-hora':
      return <CambioFechaDialog conHora onClose={cerrar} />
    case 'seleccionar-periodo':
      return <SeleccionarPeriodoDialog onClose={cerrar} />
    case 'hacer-copia':
      return <HacerCopiaDialog onClose={cerrar} />
    case 'testear-copia':
      return <TestearCopiaDialog onClose={cerrar} />
    case 'eliminar-temporales':
      return <EliminarTemporalesDialog onClose={cerrar} />
    default:
      return null
  }
}
