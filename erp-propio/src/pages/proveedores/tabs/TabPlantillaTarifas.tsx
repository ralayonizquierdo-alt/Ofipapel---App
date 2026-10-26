import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwGroup, GwInline, GwLookupButton, GwNumber, GwSelect } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { ProveedorTabProps } from '../types'

const NOMBRES_PVP = ['General:', 'MAYOR  M-1:', 'MAYOR  M-2:', 'MAYOR  M-3:', 'Tarifa Dcto -4:', 'Tarifa Dcto -5:', 'Tarifa Dcto -6:']

interface Plantilla {
  codigo: string
  descripcion: string
  descuento_maximo_cliente_pct: number | null
}

interface Nivel {
  nivel_tarifa: number
  incremento_pct: number | null
  modo_calculo: string | null
  permite_descuento_linea: boolean
}

/** Cómo se calculan los 7 PVP de los artículos de este proveedor (PLANTTAR en GeminisWin). Solo lectura. */
export function TabPlantillaTarifas({ proveedor, editing, onChange }: ProveedorTabProps) {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [niveles, setNiveles] = useState<Nivel[]>([])
  const [buscar, setBuscar] = useState(false)
  const ro = !editing
  const codigo = proveedor.plantilla_tarifa_codigo

  useEffect(() => {
    supabase
      .from('plantilla_tarifa')
      .select('codigo, descripcion, descuento_maximo_cliente_pct')
      .order('codigo')
      .then(({ data }) => setPlantillas((data ?? []) as Plantilla[]))
  }, [])

  useEffect(() => {
    if (!codigo) {
      setNiveles([])
      return
    }
    supabase
      .from('plantilla_tarifa_nivel')
      .select('nivel_tarifa, incremento_pct, modo_calculo, permite_descuento_linea')
      .eq('plantilla_tarifa_codigo', codigo)
      .order('nivel_tarifa')
      .then(({ data }) => setNiveles((data ?? []) as Nivel[]))
  }, [codigo])

  const plantilla = plantillas.find((p) => p.codigo === codigo)

  return (
    <div className="flex min-h-[250px] flex-col gap-1.5">
      <div className="flex items-end gap-2">
        <GwField label="Plantilla de Tarifas" className="w-[420px]">
          <span className="flex">
            <GwSelect value={codigo ?? ''} disabled={ro} title="CODTAR" onChange={(e) => onChange({ plantilla_tarifa_codigo: e.target.value || null })}>
              <option value="" />
              {plantillas.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.codigo} — {p.descripcion}
                </option>
              ))}
              {codigo && !plantilla && <option value={codigo}>{codigo}</option>}
            </GwSelect>
            <GwLookupButton disabled={ro} onClick={() => setBuscar(true)} title="Buscar plantilla de tarifas" />
          </span>
        </GwField>
      </div>

      <div className="flex items-start gap-3">
        <GwGroup title="Pvps" className="w-[420px]">
          <div className="flex flex-col gap-[3px]">
            {NOMBRES_PVP.map((nombre, i) => {
              const n = niveles.find((x) => x.nivel_tarifa === i)
              return (
                <div key={i} className="grid grid-cols-[110px_52px_52px_92px] items-center gap-1">
                  <span className="gw-label" title={`PVP_${i}`}>
                    {nombre}
                  </span>
                  <GwSelect value={n?.modo_calculo ?? ''} disabled title={`POD${i}: P = % sobre coste, D = % de descuento sobre la General`}>
                    <option value="" />
                    <option value="P">P</option>
                    <option value="D">D</option>
                  </GwSelect>
                  <GwSelect value={n ? (n.permite_descuento_linea ? 'S' : 'N') : ''} disabled title={`VERDTO_${i}`}>
                    <option value="" />
                    <option value="N">N</option>
                    <option value="S">S</option>
                  </GwSelect>
                  <GwNumber value={n?.incremento_pct ?? null} decimals={2} />
                </div>
              )
            })}
          </div>
        </GwGroup>
        <GwInline label="Dto. Max.:" className="mt-3">
          <span className="w-[80px]" title="DTOMAXCLI">
            <GwNumber value={plantilla?.descuento_maximo_cliente_pct ?? null} decimals={2} />
          </span>
        </GwInline>
      </div>

      {buscar && (
        <GwLookupDialog<{ codigo: string; descripcion: string }>
          title="Plantillas de Tarifas"
          table="plantilla_tarifa"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            onChange({ plantilla_tarifa_codigo: r.codigo })
            setBuscar(false)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
    </div>
  )
}
