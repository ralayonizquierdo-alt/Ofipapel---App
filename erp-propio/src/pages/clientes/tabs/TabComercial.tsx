import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea } from '../../../components/gw'
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
  const entero = (key: keyof Cliente, title: string) => num(key, title, 0)

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

  const saldoActual = (Number(cliente.saldo_anterior ?? 0) || 0) + (Number(cliente.deuda_actual ?? 0) || 0)
  const tipoVentaActual = cliente.tipo_credito ?? ''

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)_130px_130px] gap-x-2">
        <GwField label="Tipo de Cliente">
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
        <GwField label="Previsión de Ventas">{num('previsto_ventas', 'PREVVENTAS')}</GwField>
        <GwField label="Pedido Mínimo">{num('pedido_minimo', 'PEDIDOMIN')}</GwField>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-2">
        <GwGroup title="Configuración de Pago y Documentos" className="grid grid-cols-3 gap-x-2 gap-y-1">
          <GwField label="Tipo de Venta">
            <GwSelect
              value={tipoVentaActual}
              disabled={ro}
              title="TIPOCREDIT"
              onChange={(e) => onChange({ tipo_credito: e.target.value || null })}
            >
              <option value="">—</option>
              {TIPOS_VENTA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              {tipoVentaActual && !TIPOS_VENTA.includes(tipoVentaActual) && <option value={tipoVentaActual}>{tipoVentaActual}</option>}
            </GwSelect>
          </GwField>
          <GwField label="Forma de Pago" className="col-span-2">
            <GwSelect
              value={cliente.forma_pago_codigo ?? ''}
              disabled={ro}
              title="FORMAPAGO"
              onChange={(e) => onChange({ forma_pago_codigo: e.target.value || null })}
            >
              {opciones(formas, cliente.forma_pago_codigo)}
            </GwSelect>
          </GwField>
          <GwField label="Tipo de Factura Global">{entero('tipo_factura_global', 'TIPOFACT (código GeminisWin)')}</GwField>
          <GwField label="D.C. (Serie)">
            <GwSelect
              value={cliente.digito_control ?? ''}
              disabled={ro}
              title="DIG_CTRL — confirmar con Luis"
              onChange={(e) => onChange({ digito_control: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">—</option>
              {DIGITOS_CONTROL.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </GwSelect>
          </GwField>
          <GwField label="Nº de Copias">{entero('nº_copias_factura', 'FACTNOCOP')}</GwField>
          <GwField label="Documento Predet. Contado">{entero('tipo_documento_contado', 'TIPODOCCTD (código GeminisWin)')}</GwField>
          <GwField label="Documento Predet. Crédito">{entero('tipo_documento_credito', 'TIPODOCCRD (código GeminisWin)')}</GwField>
        </GwGroup>

        <GwGroup title="Saldo y Riesgo" className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-x-2 gap-y-1">
          <span className="gw-label">Límite de Deuda:</span>
          {num('limite_deuda', 'LIMITDEUDA')}
          <span className="gw-label">Saldo Inicial:</span>
          {num('saldo_anterior', 'SALDOANT')}
          <span className="gw-label">Fecha Saldo Inicial:</span>
          <GwInput
            type="date"
            title="F_SALDOINI"
            value={cliente.fecha_saldo_inicial ? cliente.fecha_saldo_inicial.slice(0, 10) : ''}
            disabled={ro}
            onChange={(e) => onChange({ fecha_saldo_inicial: e.target.value || null })}
          />
          <span className="gw-label">Deuda Actual:</span>
          <span title="DEUDA (la calcula el sistema)">
            <GwNumber value={cliente.deuda_actual ?? 0} decimals={2} />
          </span>
          <span className="gw-label">Saldo Actual:</span>
          <span title="Saldo inicial + deuda actual">
            <GwNumber value={saldoActual} decimals={2} />
          </span>
        </GwGroup>
      </div>

      <div className="grid grid-cols-[330px_330px_minmax(0,1fr)] gap-2">
        <GwGroup title="Días de Pago" className="flex flex-col gap-1">
          <GwInline label="1º  Tipo:">
            <span className="w-[60px]">{entero('dias_pago_1_tipo', 'TIPDIASPA1')}</span>
            <span className="gw-label">Día:</span>
            <span className="w-[60px]">{entero('dias_pago_1', 'DIASPAGO1')}</span>
          </GwInline>
          <GwInline label="2º  Tipo:">
            <span className="w-[60px]">{entero('dias_pago_2_tipo', 'TIPDIASPA2')}</span>
            <span className="gw-label">Día:</span>
            <span className="w-[60px]">{entero('dias_pago_2', 'DIASPAGO2')}</span>
          </GwInline>
        </GwGroup>
        <GwGroup title="Demora Permitida" className="flex flex-col gap-1">
          <GwInline label="Días:">
            <span className="w-[80px]">{entero('dias_demora_pago', 'DIASDEMPAG')}</span>
          </GwInline>
          <GwInline label="Nº de Pagos:">
            <span className="w-[80px]">{entero('num_pagos_demora', 'NPAGDEMORA')}</span>
          </GwInline>
        </GwGroup>
        <GwGroup title="Autorizados para hacer Compras" className="flex flex-col gap-1">
          <GwTextArea
            rows={2}
            value={cliente.observ_jefe_compras ?? ''}
            disabled={ro}
            title="OBSJEFCOMP"
            onChange={(e) => onChange({ observ_jefe_compras: e.target.value === '' ? null : e.target.value })}
          />
          <GwCheck label="Avisar al vender" checked={cliente.avisar_jefe_compras} disabled={ro} onChange={(v) => onChange({ avisar_jefe_compras: v })} />
        </GwGroup>
      </div>

      <GwGroup title="Mensaje de Aviso al Vender">
        <GwTextArea
          rows={2}
          value={cliente.mensaje_aviso_venta ?? ''}
          disabled={ro}
          title="MSGVENTAS"
          className={cliente.mensaje_aviso_venta ? 'font-bold text-[#c42b1c] [-webkit-text-fill-color:#c42b1c]' : ''}
          onChange={(e) => onChange({ mensaje_aviso_venta: e.target.value === '' ? null : e.target.value })}
        />
      </GwGroup>

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
