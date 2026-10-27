import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2, RefreshCw, Save, BookOpen, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInput, GwSelect, GwTextArea } from '../../components/gw'
import { descargarCsv, leerTodo, type CuentaContable } from './contabModel'
import { Aviso, Barra, Rejilla, Vacio } from './ui'

const TIPOS = ['Activo', 'Pasivo', 'Neto', 'Gasto', 'Ingreso', 'Mixta']
const vacia: CuentaContable = {
  codigo: '',
  descripcion: '',
  nivel: 0,
  grupo: '',
  tipo: null,
  nif: null,
  tercero_tipo: null,
  tercero_codigo: null,
  activa: true,
  observaciones: null,
}

/** Contabilidad → Plan de Cuentas: lista filtrable + ficha de la cuenta seleccionada. */
export function PlanCuentasPage() {
  const navigate = useNavigate()
  const [cuentas, setCuentas] = useState<CuentaContable[]>([])
  const [filtro, setFiltro] = useState('')
  const [grupo, setGrupo] = useState('')
  const [nivel, setNivel] = useState('')
  const [verBajas, setVerBajas] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [ficha, setFicha] = useState<CuentaContable>(vacia)
  const [nueva, setNueva] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [longitud, setLongitud] = useState(8)

  const cargar = useCallback(async () => {
    try {
      const data = await leerTodo<CuentaContable>((a, b) => supabase.from('cuenta_contable').select('*').order('codigo').range(a, b))
      setCuentas(data)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    cargar()
    supabase
      .from('configuracion_contable')
      .select('longitud_subcuenta')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => data && setLongitud(data.longitud_subcuenta))
  }, [cargar])

  const filas = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    return cuentas.filter(
      (c) =>
        (verBajas || c.activa) &&
        (!grupo || c.grupo === grupo) &&
        (!nivel || (nivel === 'sub' ? c.nivel >= longitud : c.nivel === Number(nivel))) &&
        (!f || c.codigo.startsWith(f) || c.descripcion.toLowerCase().includes(f) || (c.nif ?? '').toLowerCase().includes(f)),
    )
  }, [cuentas, filtro, grupo, nivel, verBajas, longitud])

  function elegir(c: CuentaContable) {
    setSel(c.codigo)
    setFicha(c)
    setNueva(false)
    setError(null)
    setOk(null)
  }

  async function guardar() {
    setError(null)
    setOk(null)
    const codigo = ficha.codigo.trim()
    if (!/^\d{1,10}$/.test(codigo)) return setError('El código debe tener de 1 a 10 dígitos.')
    if (!ficha.descripcion.trim()) return setError('Falta la descripción.')
    const datos = {
      descripcion: ficha.descripcion.trim(),
      tipo: ficha.tipo || null,
      nif: ficha.nif?.trim() || null,
      activa: ficha.activa,
      observaciones: ficha.observaciones || null,
      actualizado_en: new Date().toISOString(),
    }
    const { error: e } = nueva
      ? await supabase.from('cuenta_contable').insert({ codigo, ...datos })
      : await supabase.from('cuenta_contable').update(datos).eq('codigo', codigo)
    if (e) return setError(e.code === '23505' ? `La cuenta ${codigo} ya existe.` : e.message)
    setOk(nueva ? `Cuenta ${codigo} creada.` : `Cuenta ${codigo} guardada.`)
    setNueva(false)
    setSel(codigo)
    await cargar()
  }

  function exportar() {
    descargarCsv(
      'plan_de_cuentas.csv',
      ['Cuenta', 'Descripción', 'Nivel', 'Tipo', 'NIF', 'Tercero', 'Código tercero', 'Activa'],
      filas.map((c) => [c.codigo, c.descripcion, c.nivel, c.tipo ?? '', c.nif ?? '', c.tercero_tipo ?? '', c.tercero_codigo ?? '', c.activa ? 'S' : 'N']),
    )
  }

  const set = <K extends keyof CuentaContable>(k: K, v: CuentaContable[K]) => setFicha((f) => ({ ...f, [k]: v }))

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <GwField label="Buscar (código, descripción o NIF)">
          <GwInput value={filtro} onChange={(e) => setFiltro(e.target.value)} className="w-[240px]" autoFocus />
        </GwField>
        <GwField label="Grupo">
          <GwSelect value={grupo} onChange={(e) => setGrupo(e.target.value)} className="w-[170px]">
            <option value="">Todos</option>
            {cuentas
              .filter((c) => c.nivel === 1)
              .map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} {c.descripcion}
                </option>
              ))}
          </GwSelect>
        </GwField>
        <GwField label="Nivel">
          <GwSelect value={nivel} onChange={(e) => setNivel(e.target.value)} className="w-[150px]">
            <option value="">Todos</option>
            <option value="1">Grupos (1 dígito)</option>
            <option value="2">Subgrupos (2)</option>
            <option value="3">Cuentas (3)</option>
            <option value="4">Cuentas (4)</option>
            <option value="sub">Subcuentas ({longitud})</option>
          </GwSelect>
        </GwField>
        <GwCheck label="Ver bajas" checked={verBajas} onChange={setVerBajas} className="mb-1" />
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button type="button" className="gw-btn" onClick={exportar}>
          <Download size={14} /> Excel (CSV)
        </button>
        <span className="mb-1 ml-auto text-[12px] text-[#555]">
          {filas.length} de {cuentas.length} cuentas · solo las subcuentas de {longitud} dígitos admiten apuntes
        </span>
      </Barra>
      <Rejilla alto="calc(100vh - 470px)">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[110px]">Cuenta</th>
              <th>Descripción</th>
              <th className="w-[50px]">Nivel</th>
              <th className="w-[80px]">Tipo</th>
              <th className="w-[110px]">NIF</th>
              <th className="w-[120px]">Tercero</th>
              <th className="w-[50px]">Activa</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <Vacio cols={7} texto="Ninguna cuenta cumple el filtro." />}
            {filas.slice(0, 2000).map((c) => (
              <tr
                key={c.codigo}
                className={sel === c.codigo ? 'gw-selected' : ''}
                onClick={() => elegir(c)}
                onDoubleClick={() => navigate(`/contabilidad/mayor?cuenta=${c.codigo}`)}
                title="Doble clic: ver el Mayor de la cuenta"
              >
                <td className="font-mono" style={{ paddingLeft: 4 + Math.min(c.nivel - 1, 4) * 8 }}>
                  {c.codigo}
                </td>
                <td className={c.nivel <= 2 ? 'font-bold' : ''}>{c.descripcion}</td>
                <td className="text-right">{c.nivel}</td>
                <td>{c.tipo}</td>
                <td>{c.nif}</td>
                <td>{c.tercero_tipo ? `${c.tercero_tipo} ${c.tercero_codigo ?? ''}` : ''}</td>
                <td className="text-center">{c.activa ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rejilla>
      <GwGroup title={nueva ? 'Nueva cuenta' : sel ? `Ficha de la cuenta ${sel}` : 'Ficha de la cuenta'}>
        <div className="grid grid-cols-[130px_1fr_130px_150px] gap-x-2 gap-y-1">
          <GwField label="Código">
            <GwInput value={ficha.codigo} disabled={!nueva} maxLength={10} onChange={(e) => set('codigo', e.target.value.replace(/\D/g, ''))} className="font-mono" />
          </GwField>
          <GwField label="Descripción">
            <GwInput value={ficha.descripcion} disabled={!nueva && !sel} onChange={(e) => set('descripcion', e.target.value)} maxLength={120} />
          </GwField>
          <GwField label="Tipo">
            <GwSelect value={ficha.tipo ?? ''} disabled={!nueva && !sel} onChange={(e) => set('tipo', e.target.value || null)}>
              <option value="" />
              {TIPOS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </GwSelect>
          </GwField>
          <GwField label="NIF (para 347 y gestoría)">
            <GwInput value={ficha.nif ?? ''} disabled={!nueva && !sel} onChange={(e) => set('nif', e.target.value.toUpperCase())} maxLength={20} />
          </GwField>
          <GwField label="Observaciones" className="col-span-3">
            <GwTextArea rows={2} value={ficha.observaciones ?? ''} disabled={!nueva && !sel} onChange={(e) => set('observaciones', e.target.value)} />
          </GwField>
          <div className="flex flex-col justify-between">
            <GwCheck label="Cuenta activa" checked={ficha.activa} disabled={!nueva && !sel} onChange={(v) => set('activa', v)} />
            <span className="text-[11px] text-[#555]">{ficha.tercero_tipo ? `Creada desde la ficha de ${ficha.tercero_tipo} ${ficha.tercero_codigo}` : ''}</span>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            className="gw-btn"
            onClick={() => {
              setFicha({ ...vacia })
              setNueva(true)
              setSel(null)
              setOk(null)
              setError(null)
            }}
          >
            <FilePlus2 size={14} /> Nueva
          </button>
          <button type="button" className="gw-btn" onClick={guardar} disabled={!nueva && !sel}>
            <Save size={14} /> Guardar
          </button>
          <button type="button" className="gw-btn" disabled={!sel} onClick={() => sel && navigate(`/contabilidad/mayor?cuenta=${sel}`)}>
            <BookOpen size={14} /> Mayor
          </button>
          <Aviso error={error} ok={ok} />
        </div>
      </GwGroup>
    </div>
  )
}
