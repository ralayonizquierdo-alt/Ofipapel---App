// Archivo → Preparar página… y Elegir Impresora… SIN CAPTURA de GeminisWin. Preferencias de
// impresión de este puesto (src/lib/impresion.ts): se guardan en el navegador.

import { useState } from 'react'
import { GwInput, GwRadio, GwSelect } from '../../components/gw'
import { GwSpin } from '../archivo/comun'
import { guardarPrefsImpresion, prefsImpresion, type PrefsImpresion, type TamanoPapel } from '../../lib/impresion'
import { Botones, Dialogo } from './comun'

const TAMANOS: { v: TamanoPapel; l: string }[] = [
  { v: 'A4', l: 'A4 (210 x 297 mm)' },
  { v: 'A5', l: 'A5 (148 x 210 mm)' },
  { v: 'letter', l: 'Carta (216 x 279 mm)' },
  { v: 'legal', l: 'Legal (216 x 356 mm)' },
]

export function PrepararPaginaDialog({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<PrefsImpresion>(prefsImpresion)
  const set = (c: Partial<PrefsImpresion>) => setP((x) => ({ ...x, ...c }))
  const margen = (k: 'margenSup' | 'margenInf' | 'margenIzq' | 'margenDer', l: string) => (
    <>
      <span className="gw-label">{l}:</span>
      <GwSpin value={p[k]} max={50} onChange={(v) => set({ [k]: v ?? 0 })} />
    </>
  )
  return (
    <Dialogo titulo="Preparar página" onClose={onClose} ancho={430}>
      <fieldset className="gw-group">
        <legend>Papel</legend>
        <div className="flex items-center gap-2">
          <span className="gw-label">Tamaño:</span>
          <GwSelect value={p.tamano} onChange={(e) => set({ tamano: e.target.value as TamanoPapel })}>
            {TAMANOS.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </GwSelect>
        </div>
      </fieldset>
      <div className="flex gap-2">
        <fieldset className="gw-group flex-1">
          <legend>Orientación</legend>
          <div className="flex flex-col gap-0.5">
            <GwRadio name="ori" label="Automática (según el documento)" checked={p.orientacion === 'auto'} onChange={() => set({ orientacion: 'auto' })} />
            <GwRadio name="ori" label="Vertical" checked={p.orientacion === 'portrait'} onChange={() => set({ orientacion: 'portrait' })} />
            <GwRadio name="ori" label="Horizontal" checked={p.orientacion === 'landscape'} onChange={() => set({ orientacion: 'landscape' })} />
          </div>
        </fieldset>
        <fieldset className="gw-group w-[170px]">
          <legend>Márgenes (mm)</legend>
          <div className="grid grid-cols-[70px_70px] items-center gap-1">
            {margen('margenSup', 'Superior')}
            {margen('margenInf', 'Inferior')}
            {margen('margenIzq', 'Izquierdo')}
            {margen('margenDer', 'Derecho')}
          </div>
        </fieldset>
      </div>
      <p className="text-[11px] text-[#555]">Se aplica a los listados y fichas que se imprimen desde este puesto. El diálogo de impresión del navegador puede cambiarlo para una impresión concreta.</p>
      <Botones>
        <button
          type="button"
          className="gw-btn w-[80px]"
          onClick={() => {
            guardarPrefsImpresion(p)
            onClose()
          }}
        >
          Aceptar
        </button>
        <button type="button" className="gw-btn w-[80px]" onClick={onClose}>
          Cancelar
        </button>
      </Botones>
    </Dialogo>
  )
}

export function ElegirImpresoraDialog({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<PrefsImpresion>(prefsImpresion)
  const set = (c: Partial<PrefsImpresion>) => setP((x) => ({ ...x, ...c }))
  return (
    <Dialogo titulo="Elegir Impresora" onClose={onClose} ancho={430}>
      <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
        <span className="gw-label">Impresora de A4:</span>
        <GwInput value={p.impresoraA4} maxLength={80} placeholder="Nombre de la impresora (p. ej. HP Oficina)" onChange={(e) => set({ impresoraA4: e.target.value })} />
        <span className="gw-label">Impresora de tickets:</span>
        <GwInput value={p.impresoraTickets} maxLength={80} placeholder="Nombre de la impresora de tickets" onChange={(e) => set({ impresoraTickets: e.target.value })} />
        <span className="gw-label">Ancho del ticket:</span>
        <GwSelect value={String(p.anchoTicket)} onChange={(e) => set({ anchoTicket: Number(e.target.value) })}>
          <option value="80">80 mm</option>
          <option value="58">58 mm</option>
        </GwSelect>
      </div>
      <p className="text-[11px] text-[#555]">
        El navegador no deja que una web elija la impresora: al imprimir se abre su diálogo y ahí se elige. Estos nombres se recuerdan en este puesto para saber cuál
        corresponde a cada documento (A4 para listados y facturas, tickets para el TPV).
      </p>
      <Botones>
        <button
          type="button"
          className="gw-btn w-[80px]"
          onClick={() => {
            guardarPrefsImpresion(p)
            onClose()
          }}
        >
          Aceptar
        </button>
        <button type="button" className="gw-btn w-[80px]" onClick={onClose}>
          Cancelar
        </button>
      </Botones>
    </Dialogo>
  )
}
