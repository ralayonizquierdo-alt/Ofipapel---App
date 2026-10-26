import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwNumber, GwSelect } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { Proveedor, ProveedorTabProps } from '../types'

type Opcion = {
  codigo: string
  descripcion: string
}

export function TabDatosComerciales({ proveedor, editing, onChange }: ProveedorTabProps) {
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

  const num = (key: keyof Proveedor, title: string, decimals = 2) => (
    <span title={title}>
      <GwNumber value={proveedor[key] as number | null} decimals={decimals} disabled={ro} onChange={(v) => onChange({ [key]: v } as Partial<Proveedor>)} />
    </span>
  )

  const spin = (key: keyof Proveedor, title: string) => (
    <GwInput
      type="number"
      step={1}
      min={0}
      className="gw-num"
      title={title}
      disabled={ro}
      value={(proveedor[key] ?? 0) as number}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : Number(e.target.value) } as Partial<Proveedor>)}
    />
  )

  // Códigos numéricos de GeminisWin cuyo significado aún no está documentado.
  const codigoSelect = (key: keyof Proveedor, title: string, vacio: string) => {
    const actual = proveedor[key] as number | null
    const valores = [1, 2, 3, 4, 5]
    return (
      <GwSelect
        value={actual ?? ''}
        disabled={ro}
        title={title}
        onChange={(e) => onChange({ [key]: e.target.value === '' ? null : Number(e.target.value) } as Partial<Proveedor>)}
      >
        <option value="">{vacio}</option>
        {valores.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
        {actual != null && !valores.includes(actual) && <option value={actual}>{actual}</option>}
      </GwSelect>
    )
  }

  const soloLectura = (value: number | null, title: string, decimals = 3) => (
    <span title={title}>
      <GwNumber value={value} decimals={decimals} />
    </span>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[210px_minmax(0,480px)] gap-x-3">
        <GwField label="Tipo de Documento">
          {codigoSelect('tipo_documento_defecto', 'TIPODOCDEF (código GeminisWin; confirmar con Luis)', 'Predeterminado')}
        </GwField>
        <GwField label="Forma de pago">
          <span className="flex">
            <GwSelect
              value={proveedor.forma_pago_codigo ?? ''}
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
              {proveedor.forma_pago_codigo && !formas.some((o) => o.codigo === proveedor.forma_pago_codigo) && (
                <option value={proveedor.forma_pago_codigo}>{proveedor.forma_pago_codigo}</option>
              )}
            </GwSelect>
            <GwLookupButton disabled={ro} onClick={() => setBuscarForma(true)} title="Buscar forma de pago" />
          </span>
        </GwField>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_390px] gap-x-3">
        <GwGroup title="Días de Pago" className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)_72px] gap-x-1.5">
          {codigoSelect('dias_pago_1_tipo', 'TIPDIASPA1 (código GeminisWin; confirmar con Luis)', '')}
          {spin('dias_pago_1', 'DIASPAGO1')}
          {codigoSelect('dias_pago_2_tipo', 'TIPDIASPA2 (código GeminisWin; confirmar con Luis)', '')}
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

      <div className="mt-2 grid grid-cols-[300px_minmax(0,1fr)] gap-x-3">
        <GwCheck
          label="Proveedor de Importación"
          checked={proveedor.es_proveedor_dependiente}
          disabled={ro}
          onChange={(v) => onChange({ es_proveedor_dependiente: v })}
        />
        <span title="ESPRLOCAL">
          <GwCheck label="Proveedor Local" checked={proveedor.es_precio_local} disabled={ro} onChange={(v) => onChange({ es_precio_local: v })} />
        </span>
      </div>

      <div className="flex items-center gap-6">
        <GwInline label="Descuento en Pie factura:">
          <span className="w-[110px]">{num('descuento_pie_pct', 'DTOPIE')}</span>
        </GwInline>
        <GwInline label="Pedidos Pendientes:">
          <span className="w-[130px]">{soloLectura(proveedor.pendiente_pago, 'PENDIENTES (lo calcula el sistema)')}</span>
        </GwInline>
        <GwInline label="Días plazo de entrega:">
          <span className="w-[60px]">{spin('dias_entrega', 'DIAS_ENTR')}</span>
        </GwInline>
      </div>

      <span title="NOIMPU2_L">
        <GwCheck
          label="No Aplicar el Impuesto Canon al Comprar"
          checked={proveedor.no_aplica_impuesto2}
          disabled={ro}
          onChange={(v) => onChange({ no_aplica_impuesto2: v })}
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
