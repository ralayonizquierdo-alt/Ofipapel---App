// Utilidades → Configurar Utilidades (con «Añadir o modificar utilidad») y Utilidades → Informes →
// Ejecutar («Ejecutar Informe»), calcados de GeminisWin (capturas ZIP 7, 30-35 y 40, 04/11/2026).
//
// · Configurar Utilidades: en GeminisWin cada utilidad es un programa de Windows (.prg, .exe…)
//   que sale al final del menú Utilidades. En el ERP web no se ejecutan programas del ordenador:
//   las utilidades de ese apartado son pantallas del propio ERP. La ventana enseña las que hay
//   (salen del propio menú, src/components/shell/menus.ts) con su pantalla en «Programa»; añadir,
//   modificar o eliminar se hace en el programa, por eso esos botones salen apagados.
// · Ejecutar Informe: los «informes» del ERP son los listados guardados del Generador de
//   listados. «Examinar» elige uno y «Ejecutar» lo abre.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { MENUS, type MenuItem } from '../../components/shell/menus'
import { supabase } from '../../lib/supabase'
import { Dialogo, Mensaje, OperativaDialogo } from './comun'

/* ------------------------------------------------------------------ Configurar Utilidades */

interface UtilidadConfig {
  titulo: string
  programa: string
  deshabilitada: boolean
}

const NO_EDITA = 'En el ERP web las utilidades de este apartado son pantallas del programa: para añadir, cambiar o quitar una, pídelo en Archivo → Registro de incidencias.'

/** Utilidades configuradas = opciones del menú Utilidades que van tras «Configurar Utilidades». */
function utilidadesDelMenu(): UtilidadConfig[] {
  const items = MENUS.find((m) => m.label === 'Utilidades')?.items ?? []
  const i = items.findIndex((e) => e !== 'sep' && e.label === 'Configurar Utilidades')
  if (i < 0) return []
  const resto = items.slice(i + 1)
  // Se salta el separador que va justo detrás y se coge el bloque hasta el siguiente separador.
  const desde = resto[0] === 'sep' ? 1 : 0
  const fin = resto.indexOf('sep', desde)
  return (resto.slice(desde, fin < 0 ? undefined : fin) as MenuItem[]).map((e) => ({
    titulo: e.label,
    programa: e.to ?? e.description ?? '(no aplica en el ERP web)',
    deshabilitada: !e.to && !e.action,
  }))
}

const BTN_GRANDE = 'flex h-[34px] items-center justify-center gap-1 border border-[var(--gw-border)] bg-[#f3f3f3] text-[15px] hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-[#f3f3f3]'

export function ConfigurarUtilidadesDialog({ onClose }: { onClose: () => void }) {
  const lista = useMemo(utilidadesDelMenu, [])
  const [sel, setSel] = useState(0)
  const [ficha, setFicha] = useState<UtilidadConfig | null>(null)

  return (
    <>
      <Dialogo titulo="Configuración de utilidades" onClose={onClose} ancho={700}>
        <div className="flex gap-2">
          <div className="h-[260px] min-w-0 flex-1 overflow-y-auto border border-[var(--gw-border)] bg-white py-1" role="listbox" aria-label="Utilidades">
            {lista.map((u, i) => (
              <div
                key={u.titulo}
                role="option"
                aria-selected={i === sel}
                className={`cursor-default px-1 text-[15px] leading-[19px] ${i === sel ? 'bg-[var(--gw-select)] text-white' : ''} ${u.deshabilitada && i !== sel ? 'text-[#8a8a8a]' : ''}`}
                onClick={() => setSel(i)}
                onDoubleClick={() => setFicha(u)}
              >
                {u.titulo}
              </div>
            ))}
          </div>
          <div className="flex w-[130px] flex-none flex-col gap-2">
            <button type="button" className={BTN_GRANDE} disabled title={NO_EDITA}>
              Añadir
            </button>
            <button type="button" className={BTN_GRANDE} disabled={!lista[sel]} onClick={() => lista[sel] && setFicha(lista[sel])} title="Ver los datos de la utilidad elegida">
              Modificar
            </button>
            <button type="button" className={BTN_GRANDE} disabled title={NO_EDITA}>
              Eliminar
            </button>
          </div>
        </div>
        <OperativaDialogo
          bloques={[
            {
              titulo: 'Configurar Utilidades',
              pasos: ['Elige una utilidad de la lista.', 'Pulsa «Modificar» (o doble clic) para ver su título y la pantalla del ERP que abre.', 'Aceptar o Cancelar cierran la ventana.'],
              notas: [
                'Son las opciones que salen al final del menú Utilidades.',
                'En GeminisWin cada una era un programa de Windows; en el ERP web son pantallas del programa, por eso Añadir y Eliminar están apagados. Para pedir una nueva, Archivo → Registro de incidencias.',
                'Las que salen en gris no aplican en el ERP web (p. ej. Conectar David, que era una conexión remota).',
              ],
            },
          ]}
        />
        <div className="flex justify-end gap-1.5 border-t border-[var(--gw-border-light)] pt-2">
          <button type="button" className={`${BTN_GRANDE} w-[140px]`} onClick={onClose}>
            <Check size={14} strokeWidth={3} className="text-[#2a9d2a]" />
            Aceptar
          </button>
          <button type="button" className={`${BTN_GRANDE} w-[140px]`} onClick={onClose}>
            <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
            Cancelar
          </button>
        </div>
      </Dialogo>
      {ficha && <FichaUtilidadDialog u={ficha} onClose={() => setFicha(null)} />}
    </>
  )
}

function FichaUtilidadDialog({ u, onClose }: { u: UtilidadConfig; onClose: () => void }) {
  const campo = 'gw-input !h-[24px] !text-[14px]'
  const etiqueta = 'text-[15px] leading-[18px]'
  return (
    <Dialogo titulo="Añadir o modificar utilidad" onClose={onClose} ancho={600}>
      <span className={etiqueta}>Titulo:</span>
      <input className={`${campo} w-[440px] max-w-full`} value={u.titulo} readOnly title={NO_EDITA} />
      <span className={etiqueta}>Programa:</span>
      <input className={campo} value={u.programa} readOnly title="Pantalla del ERP que abre esta utilidad" />
      <span className={etiqueta}>Parámetros:</span>
      <input className={campo} value="" readOnly disabled title="No aplica en el ERP web: las pantallas no reciben parámetros" />
      <span className={etiqueta}>Directorio de inicio:</span>
      <input className={campo} value="" readOnly disabled title="No aplica en el ERP web: no se ejecutan programas del ordenador" />
      <div className="flex flex-col gap-1 pt-1 text-[14px]">
        <label className="flex items-center gap-1.5 text-[#8a8a8a]" title="No aplica en el ERP web: las pantallas se abren dentro del programa">
          <input type="checkbox" className="h-[11px] w-[11px]" checked={false} disabled readOnly />
          No Esperar a que termine la ejecución del programa
        </label>
        <label className="flex items-center gap-1.5 text-[#8a8a8a]" title="No aplica en el ERP web: al entrar se abre el Panel de Control">
          <input type="checkbox" className="h-[11px] w-[11px]" checked={false} disabled readOnly />
          Ejecutar automáticamente al iniciar la Aplicación
        </label>
        <label className="flex items-center gap-1.5 text-[#8a8a8a]" title={NO_EDITA}>
          <input type="checkbox" className="h-[11px] w-[11px]" checked={u.deshabilitada} disabled readOnly />
          Deshabilitar ésta utilidad
        </label>
      </div>
      <div className="flex justify-end gap-1.5 border-t border-[var(--gw-border-light)] pt-2">
        <button type="button" className={`${BTN_GRANDE} w-[140px]`} onClick={onClose} title="Cierra (los datos no se cambian desde aquí)">
          <Check size={14} strokeWidth={3} className="text-[#2a9d2a]" />
          Aceptar
        </button>
        <button type="button" className={`${BTN_GRANDE} w-[140px]`} onClick={onClose}>
          <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
          Cancelar
        </button>
      </div>
    </Dialogo>
  )
}

/* ------------------------------------------------------------------ Informes → Ejecutar */

interface ListadoGuardado {
  id: number
  nombre: string
  codigo: string | null
  fuente: string
}

export function EjecutarInformeDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [listados, setListados] = useState<ListadoGuardado[] | null>(null)
  const [elegido, setElegido] = useState<ListadoGuardado | null>(null)
  const [examinando, setExaminando] = useState(false)
  const [marcado, setMarcado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!examinando || listados) return
    supabase
      .from('listado_guardado')
      .select('id, nombre, codigo, fuente, archivado')
      .order('nombre')
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        setListados(((data ?? []) as (ListadoGuardado & { archivado: boolean | null })[]).filter((l) => !l.archivado))
      })
  }, [examinando, listados])

  function ejecutar() {
    if (!elegido) return setError('Pulsa «Examinar» y elige el informe que quieres ejecutar.')
    onClose()
    navigate(`/listados?id=${elegido.id}`)
  }

  const btn = 'gw-btn !h-[22px] !px-3 !text-[12px] font-bold underline'
  return (
    <Dialogo titulo="Ejecutar Informe" onClose={onClose} ancho={examinando ? 460 : 300}>
      <span className="text-[11px] font-bold underline">Nombre del Informe.</span>
      <div className="flex gap-1">
        <input className="gw-input min-w-0 flex-1" readOnly value={elegido ? `${elegido.codigo ? elegido.codigo + ' · ' : ''}${elegido.nombre}` : ''} title="Pulsa «Examinar» para elegir un listado guardado" />
        <button type="button" className={btn} onClick={() => setExaminando(true)}>
          Examinar
        </button>
      </div>
      {examinando && (
        <div className="h-[180px] overflow-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[84px]">Código</th>
                <th>Listado guardado</th>
              </tr>
            </thead>
            <tbody>
              {listados?.map((l) => (
                <tr
                  key={l.id}
                  className={marcado === l.id ? 'gw-selected' : ''}
                  onClick={() => setMarcado(l.id)}
                  onDoubleClick={() => {
                    setElegido(l)
                    setExaminando(false)
                  }}
                >
                  <td className="whitespace-nowrap">{l.codigo}</td>
                  <td className="truncate">{l.nombre}</td>
                </tr>
              ))}
              {listados == null && (
                <tr>
                  <td colSpan={2}>Cargando…</td>
                </tr>
              )}
              {listados?.length === 0 && (
                <tr>
                  <td colSpan={2}>No hay listados guardados: créalos en Utilidades → Generador de listados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {examinando && (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className="gw-btn"
            disabled={marcado == null}
            onClick={() => {
              setElegido(listados?.find((l) => l.id === marcado) ?? null)
              setExaminando(false)
            }}
          >
            Elegir
          </button>
          <button type="button" className="gw-btn" onClick={() => setExaminando(false)}>
            Cancelar
          </button>
        </div>
      )}
      <span className="text-[11px] font-bold underline">Introduzca Condicion Para Imprimir Registros</span>
      <textarea
        className="gw-input !h-[46px] resize-none"
        disabled
        title="No aplica en el ERP web: la condición (filtros) se pone y se guarda en el propio listado del Generador de listados"
      />
      <fieldset className="border-0 p-0">
        <legend className="text-[11px] font-bold underline">Imprimir Por...</legend>
        <div className="flex gap-4 text-[12px]">
          <label className="flex items-center gap-1">
            <input type="radio" name="ejecutar-informe-destino" checked readOnly />
            Pantalla
          </label>
          <label className="flex items-center gap-1 text-[#8a8a8a]" title="El listado se abre en pantalla; desde allí se imprime con su botón Imprimir">
            <input type="radio" name="ejecutar-informe-destino" checked={false} disabled readOnly />
            Impresora
          </label>
        </div>
      </fieldset>
      {error && <Mensaje texto={error} error />}
      <OperativaDialogo
        bloques={[
          {
            titulo: 'Ejecutar Informe',
            pasos: ['Pulsa «Examinar» y elige un listado guardado (doble clic o «Elegir»).', 'Pulsa «Ejecutar»: se abre en el Generador de listados, listo para Procesar.', '«Salir» cierra sin hacer nada.'],
            notas: [
              'Los informes del ERP son los listados guardados del Generador de listados (Utilidades → Generador de listados): allí se crean, se cambian sus filtros y se imprimen.',
              'La condición y la impresora salen apagadas por eso: se ponen en el propio listado.',
            ],
          },
        ]}
      />
      <div className="flex justify-center gap-2 pt-1">
        <button type="button" className={btn} onClick={ejecutar}>
          Ejecutar
        </button>
        <button type="button" className={btn} onClick={onClose}>
          Salir
        </button>
      </div>
    </Dialogo>
  )
}
