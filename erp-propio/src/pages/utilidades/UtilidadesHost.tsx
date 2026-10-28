// Abre los diálogos del menú Utilidades (y Archivo → Seleccionar Periodo) encima de la ventana
// actual: el menú lanza el evento «gw:utilidad» con la acción (Layout.runMenu). Al entrar carga
// también el ejercicio activo y la tienda por defecto de la sesión de trabajo.

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { elegirTienda, fijarEjercicioActivo, sesionTrabajo } from '../../lib/sesionTrabajo'
import { CambioFechaDialog, CambioTiendaDialog, SeleccionarPeriodoDialog } from './SesionDialogs'
import { EliminarTemporalesDialog, HacerCopiaDialog, TestearCopiaDialog } from './CopiaDialogs'
import { ElegirImpresoraDialog, PrepararPaginaDialog } from './ImpresionDialogs'
import { cargarParametros } from '../../lib/parametros'
import { abrirPresentacionPreliminar, cssPagina, usePrefsImpresion } from '../../lib/impresion'

const EVENTO_UTILIDAD = 'gw:utilidad'

export function UtilidadesHost() {
  const [abierto, setAbierto] = useState<string | null>(null)
  const prefs = usePrefsImpresion()

  // Archivo → Preparar página: papel y márgenes de lo que se imprime desde este puesto. Va al
  // PRINCIPIO de <head> para que las reglas @page propias de cada documento (listados con su
  // orientación, etiquetas de 50 x 30 mm…) sigan mandando.
  useEffect(() => {
    let el = document.getElementById('gw-pagina') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'gw-pagina'
      document.head.prepend(el)
    }
    el.textContent = cssPagina(undefined, prefs)
  }, [prefs])

  useEffect(() => {
    const abrir = (e: Event) => {
      const accion = (e as CustomEvent<string>).detail
      // Archivo → Presentación preliminar: la de la ventana activa (src/lib/impresion.ts).
      if (accion === 'presentacion-preliminar') {
        if (!abrirPresentacionPreliminar()) alert('La ventana activa no tiene presentación preliminar. Abra un listado o una ficha con botón Imprimir.')
        return
      }
      setAbierto(accion)
    }
    window.addEventListener(EVENTO_UTILIDAD, abrir)
    return () => window.removeEventListener(EVENTO_UTILIDAD, abrir)
  }, [])

  useEffect(() => {
    // Parámetros generales (IGIC por defecto, decimales de precio…): Archivo → Parámetros.
    cargarParametros()
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
    case 'preparar-pagina':
      return <PrepararPaginaDialog onClose={cerrar} />
    case 'elegir-impresora':
      return <ElegirImpresoraDialog onClose={cerrar} />
    default:
      return null
  }
}
