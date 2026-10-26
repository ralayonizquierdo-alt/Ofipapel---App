import { useEffect, useState, type ReactNode } from 'react'
import { Binoculars, Check, FilePen, FilePlus2, FileX2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwInput, GwSelect } from '../../../components/gw'
import type { ClienteTabProps } from '../types'

const TIPO_ENTIDAD = 'cliente'

interface Cuenta {
  id: number
  banco_codigo: string | null
  sucursal_codigo: string | null
  digito_control: string | null
  numero_cuenta: string | null
  iban: string | null
  es_principal: boolean
}

type Borrador = Omit<Cuenta, 'id'> & { id: number | null }

const vacio: Borrador = {
  id: null,
  banco_codigo: null,
  sucursal_codigo: null,
  digito_control: null,
  numero_cuenta: null,
  iban: null,
  es_principal: false,
}

function normalizarIban(v: string) {
  return v.replace(/\s+/g, '').toUpperCase()
}

/** Formato y dígitos de control (ISO 13616, módulo 97). Devuelve el error o null si es válido. */
function validarIban(v: string): string | null {
  const iban = normalizarIban(v)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return 'El IBAN no tiene un formato válido (dos letras de país, dos dígitos de control y la cuenta).'
  if (iban.startsWith('ES') && iban.length !== 24) return 'Un IBAN español tiene 24 caracteres.'
  const reordenado = iban.slice(4) + iban.slice(0, 4)
  let resto = 0
  for (const ch of reordenado) {
    const n = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of n) resto = (resto * 10 + Number(d)) % 97
  }
  return resto === 1 ? null : 'Los dígitos de control del IBAN no cuadran: revisa que esté bien copiado.'
}

function formatoIban(v: string | null) {
  if (!v) return ''
  return normalizarIban(v).replace(/(.{4})/g, '$1 ').trim()
}

/** Mini barra de iconos bajo las rejillas de GeminisWin: nuevo · modificar · borrar · buscar. */
export function GridMiniBar({
  onNuevo,
  onModificar,
  onBorrar,
  onBuscar,
  nuevo = true,
  modificar = true,
  borrar = true,
  buscar = true,
  children,
}: {
  onNuevo?: () => void
  onModificar?: () => void
  onBorrar?: () => void
  onBuscar?: () => void
  nuevo?: boolean
  modificar?: boolean
  borrar?: boolean
  buscar?: boolean
  children?: ReactNode
}) {
  const b = 'flex h-[22px] w-[58px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent'
  return (
    <div className="flex items-center gap-3">
      <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
        <button type="button" className={b} title="Nueva línea" disabled={!nuevo} onClick={onNuevo}>
          <FilePlus2 size={13} />
        </button>
        <button type="button" className={b} title="Modificar línea" disabled={!modificar} onClick={onModificar}>
          <FilePen size={13} />
        </button>
        <button type="button" className={b} title="Borrar línea" disabled={!borrar} onClick={onBorrar}>
          <FileX2 size={13} />
        </button>
        <button type="button" className={`${b} border-r-0`} title="Buscar" disabled={!buscar} onClick={onBuscar}>
          <Binoculars size={13} />
        </button>
      </div>
      {children}
    </div>
  )
}

/** Filas vacías para que la rejilla tenga la altura fija de GeminisWin aunque haya pocos registros. */
export function FilasVacias({ cols, ocupadas, total = 12 }: { cols: number; ocupadas: number; total?: number }) {
  const n = Math.max(0, total - ocupadas)
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <tr key={`__vacia${i}`}>
          {Array.from({ length: cols }, (_, j) => (
            <td key={j}>&nbsp;</td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function TabBancos({ cliente, editing }: ClienteTabProps) {
  const clienteCodigo = cliente.codigo
  const [rows, setRows] = useState<Cuenta[]>([])
  const [bancos, setBancos] = useState<{ codigo: string; nombre: string }[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [draft, setDraft] = useState<Borrador | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sucursales, setSucursales] = useState<Record<string, string>>({})

  async function load() {
    if (!clienteCodigo) return setRows([])
    const { data } = await supabase
      .from('cuenta_bancaria')
      .select('id, banco_codigo, sucursal_codigo, digito_control, numero_cuenta, iban, es_principal')
      .eq('tipo_entidad', TIPO_ENTIDAD)
      .eq('entidad_codigo', clienteCodigo)
      .order('es_principal', { ascending: false })
      .order('id')
    setRows((data ?? []) as Cuenta[])
  }

  useEffect(() => {
    load()
    setDraft(null)
    setSel(null)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteCodigo])

  useEffect(() => {
    supabase
      .from('banco')
      .select('codigo, nombre')
      .order('nombre')
      .then(({ data }) => setBancos((data ?? []) as { codigo: string; nombre: string }[]))
  }, [])

  const nombreBanco = (c: string | null) => (c ? (bancos.find((b) => b.codigo === c)?.nombre ?? '') : '')

  useEffect(() => {
    const codigos = [...new Set(rows.map((r) => r.banco_codigo).filter((c): c is string => !!c))]
    if (codigos.length === 0) return
    supabase
      .from('banco_sucursal')
      .select('banco_codigo, codigo, nombre')
      .in('banco_codigo', codigos)
      .then(({ data }) =>
        setSucursales(Object.fromEntries((data ?? []).map((r) => [`${r.banco_codigo}|${r.codigo}`, r.nombre as string]))),
      )
  }, [rows])

  const nombreSucursal = (b: string | null, c: string | null) => (b && c ? (sucursales[`${b}|${c}`] ?? '') : '')

  async function quitarOtrasPrincipales(excepto: number) {
    await supabase
      .from('cuenta_bancaria')
      .update({ es_principal: false })
      .eq('tipo_entidad', TIPO_ENTIDAD)
      .eq('entidad_codigo', clienteCodigo)
      .eq('es_principal', true)
      .neq('id', excepto)
  }

  async function guardar() {
    if (!draft) return
    setError(null)
    const iban = draft.iban ? normalizarIban(draft.iban) : ''
    if (!iban && !draft.numero_cuenta) return setError('Indica el IBAN o el número de cuenta.')
    if (iban) {
      const err = validarIban(iban)
      if (err) return setError(err)
    }
    const valores = {
      banco_codigo: draft.banco_codigo || null,
      sucursal_codigo: draft.sucursal_codigo || null,
      digito_control: draft.digito_control || null,
      numero_cuenta: draft.numero_cuenta || null,
      iban: iban || null,
      es_principal: draft.es_principal || rows.length === 0,
    }
    let id = draft.id
    if (id == null) {
      const { data, error: err } = await supabase
        .from('cuenta_bancaria')
        .insert({ tipo_entidad: TIPO_ENTIDAD, entidad_codigo: clienteCodigo, ...valores })
        .select('id')
        .single()
      if (err) return setError(err.message)
      id = data.id as number
    } else {
      const { error: err } = await supabase.from('cuenta_bancaria').update(valores).eq('id', id)
      if (err) return setError(err.message)
    }
    if (valores.es_principal) await quitarOtrasPrincipales(id)
    setDraft(null)
    setSel(id)
    load()
  }

  async function marcarPrincipal() {
    if (sel == null) return
    setError(null)
    const { error: err } = await supabase.from('cuenta_bancaria').update({ es_principal: true }).eq('id', sel)
    if (err) return setError(err.message)
    await quitarOtrasPrincipales(sel)
    load()
  }

  async function borrar() {
    const r = rows.find((x) => x.id === sel)
    if (!r || !confirm('¿Borrar esta cuenta bancaria?')) return
    const { error: err } = await supabase.from('cuenta_bancaria').delete().eq('id', r.id)
    if (err) return setError(err.message)
    setSel(null)
    load()
  }

  const enEdicion = draft != null

  const filaEdicion = draft && (
    <tr key="__edicion">
      <td>
        <GwInput
          autoFocus
          placeholder="ES00 0000 0000 0000 0000 0000"
          value={draft.iban ?? ''}
          onChange={(e) => setDraft({ ...draft, iban: e.target.value })}
        />
      </td>
      <td colSpan={2}>
        <GwSelect value={draft.banco_codigo ?? ''} onChange={(e) => setDraft({ ...draft, banco_codigo: e.target.value || null })}>
          <option value="" />
          {bancos.map((b) => (
            <option key={b.codigo} value={b.codigo}>
              {b.codigo} — {b.nombre}
            </option>
          ))}
        </GwSelect>
      </td>
      <td>
        <GwInput value={draft.sucursal_codigo ?? ''} onChange={(e) => setDraft({ ...draft, sucursal_codigo: e.target.value })} />
      </td>
      <td>{nombreSucursal(draft.banco_codigo, draft.sucursal_codigo)}</td>
      <td>
        <GwInput value={draft.digito_control ?? ''} maxLength={2} onChange={(e) => setDraft({ ...draft, digito_control: e.target.value })} />
      </td>
      <td>
        <div className="flex items-center gap-1">
          <GwInput value={draft.numero_cuenta ?? ''} onChange={(e) => setDraft({ ...draft, numero_cuenta: e.target.value })} />
          <button type="button" className="gw-btn px-1.5" title="Aceptar" onClick={guardar}>
            <Check size={14} className="text-[#127a12]" />
          </button>
          <button type="button" className="gw-btn px-1.5" title="Cancelar" onClick={() => setDraft(null)}>
            <X size={14} className="text-[#c42b1c]" />
          </button>
        </div>
      </td>
    </tr>
  )

  const seleccionada = rows.find((x) => x.id === sel)

  return (
    <div className="flex flex-col gap-1">
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="max-h-[300px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid" title="CTABKCLI">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 230 }}>Iban</th>
              <th style={{ width: 70 }}>Banco</th>
              <th>Banco Nombre</th>
              <th style={{ width: 80 }}>Sucursal</th>
              <th>Sucursal Descripción</th>
              <th style={{ width: 46 }}>D.C.</th>
              <th style={{ width: 150 }}>Nº de Cuenta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              draft?.id === r.id ? (
                filaEdicion
              ) : (
                <tr key={r.id} className={sel === r.id ? 'gw-selected' : ''} onClick={() => !enEdicion && setSel(r.id)}>
                  <td className="font-mono">{formatoIban(r.iban)}</td>
                  <td>{r.banco_codigo ?? ''}</td>
                  <td>{nombreBanco(r.banco_codigo)}</td>
                  <td>{r.sucursal_codigo ?? ''}</td>
                  <td>{nombreSucursal(r.banco_codigo, r.sucursal_codigo)}</td>
                  <td>{r.digito_control ?? ''}</td>
                  <td>{r.numero_cuenta ?? ''}</td>
                </tr>
              ),
            )}
            {draft && draft.id == null && filaEdicion}
            <FilasVacias cols={7} ocupadas={rows.length + (draft && draft.id == null ? 1 : 0)} />
          </tbody>
        </table>
      </div>
      <GridMiniBar
        nuevo={editing && !enEdicion && !!clienteCodigo}
        modificar={editing && !enEdicion && seleccionada != null}
        borrar={editing && !enEdicion && seleccionada != null}
        buscar={false}
        onNuevo={() => {
          setError(null)
          setDraft({ ...vacio })
        }}
        onModificar={() => {
          if (seleccionada) {
            setError(null)
            setDraft({ ...seleccionada })
          }
        }}
        onBorrar={borrar}
      >
        <span title="Cuenta principal del cliente">
          <GwCheck
            label="Cuenta Principal"
            checked={draft ? draft.es_principal : !!seleccionada?.es_principal}
            disabled={draft ? false : !editing || seleccionada == null || seleccionada.es_principal}
            onChange={(v) => (draft ? setDraft({ ...draft, es_principal: v }) : v && marcarPrincipal())}
          />
        </span>
      </GridMiniBar>
    </div>
  )
}
