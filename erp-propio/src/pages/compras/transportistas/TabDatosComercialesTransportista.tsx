import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwSelect } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { Transportista, TransportistaTabProps } from './types'

type Opcion = {
  codigo: string
  descripcion: string
}

export function TabDatosComercialesTransportista({ transportista, editing, onChange }: TransportistaTabProps) {
  const [formas, setFormas] = useState<Opcion[]>([])
  const [buscarForma, setBuscarForma] = useState(false)
  const ro = !editing

  useEffect(() => {
    supabase
      .from('forma_pago')
      .select('codigo, descripcion')
      .order('codigo')
      .then(({ data }) => setFormas((data ?? []) as Opcion[]))
  }, [])

  const spin = (key: keyof Transportista, title: string) => (
    <GwInput
      type="number"
      step={1}
      min={0}
      className="gw-num"
      title={title}
      disabled={ro}
      value={(transportista[key] ?? 0) as number}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : Number(e.target.value) } as Partial<Transportista>)}
    />
  )

  // Mismos códigos que en Proveedores (TIPDIASPA1/2); su significado aún no está documentado.
  const codigoSelect = (key: keyof Transportista, title: string) => {
    const actual = transportista[key] as number | null
    const valores = [1, 2, 3, 4, 5]
    return (
      <GwSelect
        value={actual ?? ''}
        disabled={ro}
        title={title}
        onChange={(e) => onChange({ [key]: e.target.value === '' ? null : Number(e.target.value) } as Partial<Transportista>)}
      >
        <option value="" />
        {valores.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
        {actual != null && !valores.includes(actual) && <option value={actual}>{actual}</option>}
      </GwSelect>
    )
  }

  return (
    <div className="flex min-h-[250px] flex-col gap-2">
      <GwField label="Forma de pago" className="w-[480px]">
        <span className="flex">
          <GwSelect
            value={transportista.forma_pago_codigo ?? ''}
            disabled={ro}
            title="FORMA_COD"
            onChange={(e) => onChange({ forma_pago_codigo: e.target.value || null })}
          >
            <option value="" />
            {formas.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.descripcion}
              </option>
            ))}
            {transportista.forma_pago_codigo && !formas.some((o) => o.codigo === transportista.forma_pago_codigo) && (
              <option value={transportista.forma_pago_codigo}>{transportista.forma_pago_codigo}</option>
            )}
          </GwSelect>
          <GwLookupButton disabled={ro} onClick={() => setBuscarForma(true)} title="Buscar forma de pago" />
        </span>
      </GwField>

      <div className="grid grid-cols-[minmax(0,1fr)_390px] gap-x-3">
        <GwGroup title="Días de Pago" className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)_72px] gap-x-1.5">
          {codigoSelect('dias_pago_1_tipo', 'TIPDIASPA1 (código GeminisWin; confirmar con Luis)')}
          {spin('dias_pago_1', 'DIASPAGO1')}
          {codigoSelect('dias_pago_2_tipo', 'TIPDIASPA2 (código GeminisWin; confirmar con Luis)')}
          {spin('dias_pago_2', 'DIASPAGO2')}
        </GwGroup>
        <GwGroup title="Demora Permitida en el Pago" className="flex items-center gap-2">
          <GwInline label="Días:" className="flex-1">
            {spin('dias_demora_pago', 'DIASDEMPAG')}
          </GwInline>
          <GwInline label="Nº de Pagos:" className="flex-1">
            {spin('num_pagos_demora', 'NUMPAGDEM')}
          </GwInline>
        </GwGroup>
      </div>

      <span title="NOCONTGAST" className="mt-3">
        <GwCheck
          label="No Contabilizar los Gastos Adicionales de las Compras en la Factura del Transportista"
          checked={transportista.no_contabiliza_gasto}
          disabled={ro}
          onChange={(v) => onChange({ no_contabiliza_gasto: v })}
        />
      </span>

      {buscarForma && (
        <GwLookupDialog<Opcion>
          title="Formas de Pago"
          table="forma_pago"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            onChange({ forma_pago_codigo: r.codigo })
            setBuscarForma(false)
          }}
          onClose={() => setBuscarForma(false)}
        />
      )}
    </div>
  )
}
