import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
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

export function TabBancos({ cliente, editing }: ClienteTabProps) {
  const clienteCodigo = cliente.codigo
  const [rows, setRows] = useState<Cuenta[]>([])
  const [bancos, setBancos] = useState<{ codigo: string; nombre: string }[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [draft, setDraft] = useState<Borrador | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const nombreBanco = (c: string | null) => (c ? (bancos.find((b) => b.codigo === c)?.nombre ?? c) : '')

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
      <td>
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
      <td>
        <GwInput value={draft.digito_control ?? ''} maxLength={2} onChange={(e) => setDraft({ ...draft, digito_control: e.target.value })} />
      </td>
      <td>
        <GwInput value={draft.numero_cuenta ?? ''} onChange={(e) => setDraft({ ...draft, numero_cuenta: e.target.value })} />
      </td>
      <td>
        <div className="flex items-center gap-1">
          <GwCheck label="" checked={draft.es_principal} onChange={(v) => setDraft({ ...draft, es_principal: v })} />
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

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        <button
          type="button"
          className="gw-btn"
          disabled={!editing || enEdicion || !clienteCodigo}
          onClick={() => {
            setError(null)
            setDraft({ ...vacio })
          }}
        >
          <Plus size={14} /> Añadir línea
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!editing || enEdicion || sel == null}
          onClick={() => {
            const r = rows.find((x) => x.id === sel)
            if (r) {
              setError(null)
              setDraft({ ...r })
            }
          }}
        >
          <Pencil size={14} /> Modificar línea
        </button>
        <button type="button" className="gw-btn" disabled={!editing || enEdicion || sel == null} onClick={borrar}>
          <Trash2 size={14} /> Borrar línea
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!editing || enEdicion || sel == null || !!rows.find((x) => x.id === sel)?.es_principal}
          onClick={marcarPrincipal}
        >
          <Star size={14} /> Cuenta principal
        </button>
      </div>
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <table className="gw-grid" title="CTABKCLI">
        <thead>
          <tr>
            <th style={{ width: 260 }}>IBAN</th>
            <th>Banco</th>
            <th style={{ width: 90 }}>Sucursal</th>
            <th style={{ width: 60 }}>D.C.</th>
            <th style={{ width: 150 }}>Nº de cuenta</th>
            <th style={{ width: 120 }}>Principal</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !enEdicion && (
            <tr>
              <td colSpan={6} className="text-center text-[#6d6d6d]">
                Sin cuentas bancarias.
              </td>
            </tr>
          )}
          {rows.map((r) =>
            draft?.id === r.id ? (
              filaEdicion
            ) : (
              <tr key={r.id} className={sel === r.id ? 'gw-selected' : ''} onClick={() => !enEdicion && setSel(r.id)}>
                <td className="font-mono">{formatoIban(r.iban)}</td>
                <td>{nombreBanco(r.banco_codigo)}</td>
                <td>{r.sucursal_codigo ?? ''}</td>
                <td>{r.digito_control ?? ''}</td>
                <td>{r.numero_cuenta ?? ''}</td>
                <td>{r.es_principal ? 'Sí' : ''}</td>
              </tr>
            ),
          )}
          {draft && draft.id == null && filaEdicion}
        </tbody>
      </table>
    </div>
  )
}
