import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, Printer, Save, Undo2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwField, GwInput, GwTabs, type GwTabDef } from '../../components/gw'
import { BloqueDireccion, GrupoSmtp, ObservacionesImagen, PestanaPendiente, useEsAdministrador } from './comun'

interface Empresa {
  codigo: string
  nombre: string
  cif: string
  nombre_comercial: string | null
  comentario: string | null
  codigo_postal: string | null
  direccion: string | null
  poblacion: string | null
  provincia_codigo: string | null
  pais_codigo: string | null
  telefono_fijo: string | null
  telefono_movil: string | null
  fax: string | null
  email: string | null
  web: string | null
  sinli_id: string | null
  smtp_servidor: string | null
  smtp_usuario: string | null
  smtp_puerto: number | null
  smtp_ssl: boolean
  observaciones: string | null
  logotipo_url: string | null
  logotipo_modo: number
  actualizado_en?: string
}

const TABS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'bancos', label: 'Bancos' },
    { key: 'obs', label: 'Observaciones y Logotipo' },
  ],
]

const ALTO = 378
const LOGO_DEFECTO = `${import.meta.env.BASE_URL}marca/logo-ofipapel.png`

/**
 * Archivo → Datos de Empresa (capturas 05-07 y 05-08). Como en GeminisWin, se abre ya en
 * edición, con la barra corta: Imprimir · Guardar · Cancelar · Deshacer · Salir. Son los datos
 * legales de las facturas (NIF, VeriFactu): solo el grupo administrador puede guardarlos.
 */
export function EmpresaPage() {
  const navigate = useNavigate()
  const admin = useEsAdministrador()
  const [guardada, setGuardada] = useState<Empresa | null>(null)
  const [draft, setDraft] = useState<Empresa | null>(null)
  const [tab, setTab] = useState('generales')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('empresa')
      .select('*')
      .order('codigo')
      .limit(1)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        setGuardada(data as Empresa | null)
        setDraft(data as Empresa | null)
      })
  }, [])

  if (!draft) return <div className="p-4 text-[13px]">{error ?? 'Cargando…'}</div>
  const ro = admin !== true
  const d = draft
  const patch = (p: Partial<Empresa>) => {
    setAviso(null)
    setDraft((x) => (x ? { ...x, ...p } : x))
  }
  const cambiado = JSON.stringify(guardada) !== JSON.stringify(draft)

  async function guardar() {
    if (!draft || ro) return
    setError(null)
    if (!draft.nombre.trim() || !draft.cif.trim()) return setError('El nombre y el C.I.F. son obligatorios.')
    setSaving(true)
    const { actualizado_en: _a, codigo, ...resto } = draft
    const { data, error: err } = await supabase.from('empresa').update(resto).eq('codigo', codigo).select('*').maybeSingle()
    setSaving(false)
    if (err) return setError(err.message)
    setGuardada(data as Empresa)
    setDraft(data as Empresa)
    setAviso('Datos de empresa guardados.')
  }

  const txt = (k: keyof Empresa, title: string) => (
    <GwInput value={(d[k] as string | null) ?? ''} disabled={ro} title={title} onChange={(e) => patch({ [k]: e.target.value || null } as Partial<Empresa>)} />
  )

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-x-4">
        <GwField label="Nombre">
          <GwInput value={d.nombre} disabled={ro} title="NOMBRE" onChange={(e) => patch({ nombre: e.target.value })} />
        </GwField>
        <GwField label="C.I.F.">
          <GwInput value={d.cif} disabled={ro} title="CIF" onChange={(e) => patch({ cif: e.target.value.toUpperCase() })} />
        </GwField>
      </div>
      <div className="grid grid-cols-[minmax(0,580fr)_minmax(0,770fr)] gap-x-3">
        <GwField label="Nombre Comercial">{txt('nombre_comercial', 'NOMBCOMER')}</GwField>
        <GwField label="Comentario">{txt('comentario', 'COMENTARIO')}</GwField>
      </div>
      {(error || aviso || ro) && (
        <div className={`text-[13px] ${error ? 'text-[#c42b1c]' : 'text-[#1d5a1d]'}`}>
          {error ?? aviso ?? (admin === false ? 'Solo lectura: los datos de la empresa los cambia el grupo administrador.' : '')}
        </div>
      )}

      <GwTabs rows={TABS} active={tab} onChange={setTab}>
        <div style={{ height: ALTO }} className="overflow-hidden">
          {tab === 'generales' && (
            <div className="flex flex-col gap-1.5 px-2 pt-1">
              <BloqueDireccion r={d} ro={ro} onChange={patch} />
              <div className="grid grid-cols-[minmax(0,570fr)_minmax(0,560fr)_170px] gap-x-2">
                <GwField label="Dirección E-mail (Correo Electrónico)">{txt('email', 'DIREMAIL')}</GwField>
                <GwField label="Dirección Web (URL)">{txt('web', 'DIRWEB')}</GwField>
                <GwField label="Sinli Id Fande">{txt('sinli_id', 'SINLI')}</GwField>
              </div>
              <GrupoSmtp r={d} ro={ro} onChange={patch} />
            </div>
          )}
          {tab === 'bancos' && <PestanaPendiente texto="Bancos de la empresa: pendiente. Las cuentas bancarias no se cargan ni se muestran en el ERP." alto={ALTO} />}
          {tab === 'obs' && (
            <ObservacionesImagen
              nombre="empresa"
              tituloImagen="Logotipo"
              observaciones={d.observaciones}
              imagenUrl={d.logotipo_url}
              imagenModo={d.logotipo_modo ?? 1}
              porDefecto={LOGO_DEFECTO}
              ro={ro}
              alto={ALTO - 6}
              onChange={(p) =>
                patch({
                  ...('observaciones' in p ? { observaciones: p.observaciones ?? null } : {}),
                  ...('imagen_url' in p ? { logotipo_url: p.imagen_url ?? null } : {}),
                  ...('imagen_modo' in p ? { logotipo_modo: p.imagen_modo ?? 1 } : {}),
                })
              }
            />
          )}
        </div>
      </GwTabs>

      <div className="mt-1.5 flex w-fit border border-[var(--gw-border)] bg-[var(--gw-face)] p-[2px]">
        <Btn title="Imprimir" onClick={() => window.print()}>
          <Printer size={15} />
        </Btn>
        <Btn title="Guardar" onClick={guardar} disabled={ro || saving || !cambiado}>
          <Save size={15} />
        </Btn>
        <Btn
          title="Cancelar (deshace los cambios y cierra)"
          onClick={() => {
            setDraft(guardada)
            navigate('/')
          }}
        >
          <X size={16} />
        </Btn>
        <Btn title="Deshacer los cambios" onClick={() => setDraft(guardada)} disabled={!cambiado}>
          <Undo2 size={15} />
        </Btn>
        <Btn
          title="Salir"
          onClick={() => {
            if (cambiado && !confirm('Hay cambios sin guardar. ¿Salir sin guardarlos?')) return
            navigate('/')
          }}
        >
          <DoorOpen size={15} />
        </Btn>
      </div>
    </div>
  )
}

function Btn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[36px] w-[122px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
