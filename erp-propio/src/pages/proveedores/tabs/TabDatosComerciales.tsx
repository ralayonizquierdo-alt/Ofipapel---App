import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwNumber, GwRadio, GwSelect, formatGw } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { Proveedor, ProveedorTabProps } from '../types'

type Opcion = {
  codigo: string
  descripcion: string
}

function fecha(v: string | null) {
  if (!v) return '  /  /'
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function TabDatosComerciales({ proveedor, editing, onChange }: ProveedorTabProps) {
  const [formas, setFormas] = useState<Opcion[]>([])
  const [buscarForma, setBuscarForma] = useState(false)
  const [pedidosPendientes, setPedidosPendientes] = useState<number | null>(null)
  const ro = !editing

  useEffect(() => {
    supabase
      .from('forma_pago')
      .select('codigo, descripcion')
      .order('codigo')
      .then(({ data }) => setFormas((data ?? []) as Opcion[]))
  }, [])

  useEffect(() => {
    if (!proveedor.codigo) {
      setPedidosPendientes(null)
      return
    }
    supabase
      .from('pedido_proveedor')
      .select('numero', { count: 'exact', head: true })
      .eq('proveedor_codigo', proveedor.codigo)
      .eq('recibido', false)
      .then(({ count }) => setPedidosPendientes(count ?? 0))
  }, [proveedor.codigo])

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
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_245px] gap-1.5">
        <GwGroup title="Configuración del pago y de documentos predeterminados" className="flex flex-col gap-1">
          <div className="grid grid-cols-[150px_minmax(0,1fr)_150px] gap-x-1.5">
            <GwField label="Tipo de Documento">
              {codigoSelect('tipo_documento_defecto', 'TIPODOC (código GeminisWin; confirmar con Luis)', 'Predeterminado')}
            </GwField>
            <GwField label="Forma de pago">
              <span className="flex">
                <GwSelect
                  value={proveedor.forma_pago_codigo ?? ''}
                  disabled={ro}
                  title="FORMAPAGO"
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
            <GwField label="Tipo de Factura">{codigoSelect('tipo_factura', 'TIPOFACT (código GeminisWin; confirmar con Luis)', 'Predeterminada')}</GwField>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_110px_120px] items-end gap-x-1.5">
            <GwGroup title="Tipo de Proveedor" className="flex items-center gap-4" >
              <GwRadio
                name="tipo-proveedor"
                label="Proveedor de Importación"
                checked={!proveedor.es_precio_local}
                disabled={ro}
                onChange={() => onChange({ es_precio_local: false })}
              />
              <GwRadio
                name="tipo-proveedor"
                label="Proveedor Local"
                checked={proveedor.es_precio_local}
                disabled={ro}
                onChange={() => onChange({ es_precio_local: true })}
              />
            </GwGroup>
            <GwField label="Días de Entrega">{spin('dias_entrega', 'DIASENTREG')}</GwField>
            <GwField label="Compra Mínima">{num('compra_minima', 'COMPRAMIN')}</GwField>
          </div>
          <div className="flex items-center gap-4">
            <GwInline label="Dto. en Pie de Factura %:">
              <span className="w-[80px]">{num('descuento_pie_pct', 'DTOPIE')}</span>
            </GwInline>
            <GwCheck
              label="No Aplicar el Canon"
              checked={proveedor.no_aplica_impuesto2}
              disabled={ro}
              onChange={(v) => onChange({ no_aplica_impuesto2: v })}
            />
          </div>
        </GwGroup>

        <GwGroup title="Saldo y Riesgo" className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-x-1.5 gap-y-1">
          <span className="gw-label">Limite deuda:</span>
          {num('limite_deuda', 'LIMITDEUDA', 3)}
          <span className="gw-label">Saldo Inicial:</span>
          {num('saldo_anterior', 'SALDOANT', 3)}
          <span className="gw-label">Deuda actual:</span>
          {soloLectura(proveedor.deuda_actual, 'DEUDA (la calcula el sistema)')}
          <span className="gw-label">Total Comprado:</span>
          {soloLectura(proveedor.total_comprado, 'TOTCOMPRA (lo calcula el sistema)')}
          <span className="gw-label">Pendiente de Pago:</span>
          {soloLectura(proveedor.pendiente_pago, 'PENDPAGO (lo calcula el sistema)')}
          <span className="gw-label">Pedidos Pendientes:</span>
          <span className="gw-label text-right" title="Pedidos a este proveedor aún no recibidos">
            {pedidosPendientes == null ? '' : formatGw(pedidosPendientes, 0)}
          </span>
        </GwGroup>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-1.5">
        <GwGroup title="Días de Pago" className="grid grid-cols-[minmax(0,1fr)_60px_minmax(0,1fr)_60px] gap-x-1.5">
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
            {spin('num_pagos_demora', 'NPAGDEMORA')}
          </GwInline>
        </GwGroup>
      </div>

      <GwGroup title="Fechas" className="flex items-center gap-6">
        <GwInline label="Último Pedido:">
          <GwInput readOnly disabled={ro} value={fecha(proveedor.fecha_ultimo_pedido)} title="F_ULTPED" className="!w-[110px]" />
        </GwInline>
        <GwInline label="Última Compra:">
          <GwInput readOnly disabled={ro} value={fecha(proveedor.fecha_ultima_compra)} title="F_ULTCOMP" className="!w-[110px]" />
        </GwInline>
      </GwGroup>

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
