import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea, formatGw } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { Cliente, ClienteTabProps } from '../types'

type Opcion = {
  codigo: string
  descripcion: string
}

const TIPOS_VENTA = ['Contado', 'Crédito']

// D.C. = serie de facturación por dígito de control (mapa funcional, Maestros generales → Tiendas).
const DIGITOS_CONTROL = [
  { value: 1, label: '04 — Variable' },
  { value: 2, label: '01 — Fijo 1' },
  { value: 3, label: '02 — Fijo 2' },
]

export function TabComercial({ cliente, editing, onChange }: ClienteTabProps) {
  const [tipos, setTipos] = useState<Opcion[]>([])
  const [formas, setFormas] = useState<Opcion[]>([])
  const [buscarTipo, setBuscarTipo] = useState(false)
  const [buscarForma, setBuscarForma] = useState(false)
  const ro = !editing

  useEffect(() => {
    Promise.all([
      supabase.from('tipo_cliente').select('codigo, descripcion').order('codigo'),
      supabase.from('forma_pago').select('codigo, descripcion').order('codigo'),
    ]).then(([t, f]) => {
      setTipos((t.data ?? []) as Opcion[])
      setFormas((f.data ?? []) as Opcion[])
    })
  }, [])

  const txt = (key: keyof Cliente, title: string) => (
    <GwInput
      value={(cliente[key] ?? '') as string}
      disabled={ro}
      title={title}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Cliente>)}
    />
  )
  const num = (key: keyof Cliente, title: string, decimals = 2) => (
    <span title={title}>
      <GwNumber
        value={cliente[key] as number | null}
        decimals={decimals}
        disabled={ro}
        onChange={(v) => onChange({ [key]: v } as Partial<Cliente>)}
      />
    </span>
  )

  const opciones = (lista: Opcion[], actual: string | null) => (
    <>
      <option value="">—</option>
      {lista.map((o) => (
        <option key={o.codigo} value={o.codigo}>
          {o.codigo} — {o.descripcion}
        </option>
      ))}
      {actual && !lista.some((o) => o.codigo === actual) && <option value={actual}>{actual}</option>}
    </>
  )

  const opcionesDescripcion = (lista: Opcion[], actual: string | null) => (
    <>
      <option value="" />
      {lista.map((o) => (
        <option key={o.codigo} value={o.codigo}>
          {o.descripcion}
        </option>
      ))}
      {actual && !lista.some((o) => o.codigo === actual) && <option value={actual}>{actual}</option>}
    </>
  )

  // Spinner numérico entero, como los de «Nº Copias» o los días en GeminisWin.
  const spin = (key: keyof Cliente, title: string) => (
    <GwInput
      type="number"
      step={1}
      min={0}
      className="gw-num"
      title={title}
      disabled={ro}
      value={(cliente[key] ?? 0) as number}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : Number(e.target.value) } as Partial<Cliente>)}
    />
  )

  // Códigos numéricos de GeminisWin cuyo significado aún no está documentado.
  const codigoSelect = (key: keyof Cliente, title: string, vacio: string) => {
    const actual = cliente[key] as number | null
    const valores = [1, 2, 3, 4, 5]
    return (
      <GwSelect
        value={actual ?? ''}
        disabled={ro}
        title={title}
        onChange={(e) => onChange({ [key]: e.target.value === '' ? null : Number(e.target.value) } as Partial<Cliente>)}
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

  const saldoActual = (Number(cliente.saldo_anterior ?? 0) || 0) + (Number(cliente.deuda_actual ?? 0) || 0)
  const tipoVentaActual = cliente.tipo_credito ?? ''

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)_125px_110px] gap-x-1.5">
        <GwField label="Tipo Cliente">
          <span className="flex">
            <GwSelect
              value={cliente.tipo_cliente_codigo ?? ''}
              disabled={ro}
              title="TIPOCLIENT"
              onChange={(e) => onChange({ tipo_cliente_codigo: e.target.value || null })}
            >
              {opciones(tipos, cliente.tipo_cliente_codigo)}
            </GwSelect>
            <GwLookupButton disabled={ro} onClick={() => setBuscarTipo(true)} title="Buscar tipo de cliente" />
          </span>
        </GwField>
        <GwField label="Actividad">{txt('actividad', 'ACTIVIDAD')}</GwField>
        <GwField label="Productos">{txt('productos', 'PRODUCTOS')}</GwField>
        <GwField label="Previsión Ventas">{num('previsto_ventas', 'PREVVENTAS', 3)}</GwField>
        <GwField label="Pedido Mínimo">{num('pedido_minimo', 'PEDIDOMIN')}</GwField>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_245px] gap-1.5">
        <GwGroup title="Configuración del pago y de documentos predeterminados" className="flex flex-col gap-1">
          <div className="grid grid-cols-[105px_minmax(0,1fr)_160px_80px] gap-x-1.5">
            <GwField label="Tipo De Venta">
              <GwSelect
                value={tipoVentaActual}
                disabled={ro}
                title="TIPOCREDIT"
                onChange={(e) => onChange({ tipo_credito: e.target.value || null })}
              >
                <option value="" />
                {TIPOS_VENTA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {tipoVentaActual && !TIPOS_VENTA.includes(tipoVentaActual) && <option value={tipoVentaActual}>{tipoVentaActual}</option>}
              </GwSelect>
            </GwField>
            <GwField label="Forma de pago">
              <span className="flex">
                <GwSelect
                  value={cliente.forma_pago_codigo ?? ''}
                  disabled={ro}
                  title="FORMAPAGO"
                  onChange={(e) => onChange({ forma_pago_codigo: e.target.value || null })}
                >
                  {opcionesDescripcion(formas, cliente.forma_pago_codigo)}
                </GwSelect>
                <GwLookupButton disabled={ro} onClick={() => setBuscarForma(true)} title="Buscar forma de pago" />
              </span>
            </GwField>
            <GwField label="Tipo Factura Global">
              {codigoSelect('tipo_factura_global', 'TIPOFACT (código GeminisWin; confirmar significado con Luis)', 'Predeterminada')}
            </GwField>
            <GwField label="D.C.">
              <GwSelect
                value={cliente.digito_control ?? ''}
                disabled={ro}
                title="DIG_CTRL — confirmar con Luis"
                onChange={(e) => onChange({ digito_control: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">Predeterminado</option>
                {DIGITOS_CONTROL.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </GwSelect>
            </GwField>
          </div>
          <div className="flex items-end gap-1.5">
            <GwGroup title="Documentos para Ventas" className="flex flex-1 items-center gap-2">
              <GwInline label="Contado:" className="flex-1">
                {codigoSelect('tipo_documento_contado', 'TIPODOCCTD (código GeminisWin; confirmar con Luis)', 'Predeterminado')}
              </GwInline>
              <GwInline label="Crédito:" className="flex-1">
                {codigoSelect('tipo_documento_credito', 'TIPODOCCRD (código GeminisWin; confirmar con Luis)', 'Predeterminado')}
              </GwInline>
            </GwGroup>
            <GwField label="Nº Copias" className="w-[80px]">
              {spin('nº_copias_factura', 'FACTNOCOP')}
            </GwField>
          </div>
        </GwGroup>

        <GwGroup title="Saldo y Riesgo" className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-x-1.5 gap-y-1">
          <span className="gw-label">Limite deuda:</span>
          {num('limite_deuda', 'LIMITDEUDA', 3)}
          <span className="gw-label">Saldo Inicial:</span>
          {num('saldo_anterior', 'SALDOANT', 3)}
          <span className="gw-label">Deuda actual:</span>
          <span title="DEUDA (la calcula el sistema)">
            <GwNumber value={cliente.deuda_actual} decimals={3} />
          </span>
          <span className="gw-label">Saldo actual:</span>
          <span className="gw-label text-right" title="Saldo inicial + deuda actual">
            {formatGw(saldoActual, 3)}
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

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col">
          <div className="flex items-center justify-between">
            <span className="gw-label">Autorizados para hacer compras</span>
            <GwCheck
              label="Mostrar al Vender"
              checked={cliente.avisar_jefe_compras}
              disabled={ro}
              onChange={(v) => onChange({ avisar_jefe_compras: v })}
              className="mr-[120px]"
            />
          </div>
          <GwTextArea
            rows={3}
            value={cliente.observ_jefe_compras ?? ''}
            disabled={ro}
            title="OBSJEFCOMP"
            onChange={(e) => onChange({ observ_jefe_compras: e.target.value === '' ? null : e.target.value })}
          />
        </div>
        <GwField label="Mensaje de aviso al Vender a éste cliente">
          <GwTextArea
            rows={3}
            value={cliente.mensaje_aviso_venta ?? ''}
            disabled={ro}
            title="MSGVENTAS"
            onChange={(e) => onChange({ mensaje_aviso_venta: e.target.value === '' ? null : e.target.value })}
          />
        </GwField>
      </div>

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
      {buscarTipo && (
        <GwLookupDialog<Opcion>
          title="Tipos de Cliente"
          table="tipo_cliente"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            onChange({ tipo_cliente_codigo: r.codigo })
            setBuscarTipo(false)
          }}
          onClose={() => setBuscarTipo(false)}
        />
      )}
    </div>
  )
}
