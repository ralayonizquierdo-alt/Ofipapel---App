import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwDate, GwField, GwGroup, GwInput, GwNumber, GwRadio, GwSelect, GwTabs, formatGw, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { useFichaMaestro } from '../almacen/useFichaMaestro'
import { PieEstado } from '../almacen/piezas'
import { CampoEnlace, GwSpin, ObservacionesImagen, PestanaPendiente, hoy } from './comun'
import { AJUSTES, generarVencimientos, type GeneradorPagos } from './vencimientos'

interface FormaPago extends GeneradorPagos {
  codigo: string
  descripcion: string
  descripcion_corta: string | null
  codigo_externo: string | null
  cuenta_contable: string | null
  tipo: number
  tipo_contado: number | null
  domiciliacion_bancaria: boolean
  efectos_pendientes_a_caja: boolean
  no_ver_en_ventas: boolean
  no_ver_en_compras: boolean
  desglosa_comision_bancaria: boolean
  comision_bancaria_pct: number | null
  cuenta_contable_comision: string | null
  forma_pago_comision_codigo: string | null
  forma_pago_vencimientos_codigo: string | null
  ajuste_dias_minimo: number | null
  ajuste_dias_maximo: number | null
  imagen_url: string | null
  imagen_modo: number
  actualizado_en?: string
}

const VACIA: FormaPago = {
  codigo: '',
  descripcion: '',
  descripcion_corta: null,
  codigo_externo: null,
  cuenta_contable: null,
  tipo: 4,
  tipo_contado: 1,
  domiciliacion_bancaria: false,
  efectos_pendientes_a_caja: false,
  no_ver_en_ventas: false,
  no_ver_en_compras: false,
  desglosa_comision_bancaria: false,
  comision_bancaria_pct: null,
  cuenta_contable_comision: null,
  forma_pago_comision_codigo: null,
  forma_pago_vencimientos_codigo: null,
  generar_pagos_automaticos: false,
  generador_num_pagos: null,
  generador_pct_entrada: null,
  cadencia_nivel0: null,
  cadencia_nivel1: null,
  cadencia_nivel2: null,
  cadencia_nivel3: null,
  cadencia_nivel4: null,
  cadencia_nivel5: null,
  cadencia_nivel6: null,
  ajuste_vencimiento_tipo0: 1,
  dia_mes_ajuste0: 1,
  ajuste_vencimiento_tipo1: 1,
  dia_mes_ajuste1: 1,
  ajuste_dias_minimo: null,
  ajuste_dias_maximo: null,
  vencimientos_como_pagados: false,
  imagen_url: null,
  imagen_modo: 1,
}

const TABS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'generador', label: 'Generador de Pagos' },
    { key: 'imagen', label: 'Imagen' },
  ],
]

/** FORMAPAG.TIPO de GeminisWin: 1 Crédito, 2 Efecto, 3 Banco, 4 Contado. */
const TIPOS = [
  { valor: 1, label: 'Crédito' },
  { valor: 2, label: 'Efecto' },
  { valor: 3, label: 'Banco' },
  { valor: 4, label: 'Contado' },
]
/** Tipo de contado: 1 Efectivo, 2 Tarjeta, 3 Cheque. */
const CONTADOS = [
  { valor: 1, label: 'Efectivo' },
  { valor: 2, label: 'Tarjeta' },
  { valor: 3, label: 'Cheque' },
]

const ALTO = 382
type Patch = (p: Partial<FormaPago>) => void

/** Archivo → Formas de Pago, calcada de GeminisWin (capturas 05-09 y 05-10). */
export function FormaPagoFichaPage() {
  const f = useFichaMaestro<FormaPago>({
    tabla: 'forma_pago',
    base: '/formas-pago',
    vacio: VACIA,
    campoNombre: 'descripcion',
    que: 'la forma de pago',
    titulo: 'Formas de pago',
    rpc: 'gw_lista_ordenada_maestros',
  })
  const { draft: d, patch, editing, mode } = f
  const [tab, setTab] = useState('generales')
  const [buscar, setBuscar] = useState(false)

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing
  const txt = (k: keyof FormaPago, title: string) => (
    <GwInput value={(d[k] as string | null) ?? ''} disabled={ro} title={title} onChange={(e) => patch({ [k]: e.target.value || null } as Partial<FormaPago>)} />
  )

  async function enUso() {
    const usos: [string, string][] = [
      ['cliente', 'forma_pago_codigo'],
      ['proveedor', 'forma_pago_codigo'],
    ]
    for (const [tabla, col] of usos) {
      const { count } = await supabase.from(tabla).select('codigo', { count: 'exact', head: true }).eq(col, f.registro.codigo)
      if (count) return `No se puede eliminar la forma de pago ${f.registro.codigo}: la tienen ${count} ficha(s) de ${tabla}.`
    }
    return null
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[90px_485px_180px_180px_180px] gap-x-6 pl-5">
        <GwField label="Codigo">
          <GwCampoBusqueda value={d.codigo} editable={mode === 'alta'} disabled={mode === 'edicion'} title="CODIGO" maxLength={4} onChange={(v) => patch({ codigo: v.toUpperCase() })} {...f.busqueda('codigo')} />
        </GwField>
        <GwField label="Descripción">
          <GwCampoBusqueda value={d.descripcion} editable={editing} title="DESCRIP" onChange={(v) => patch({ descripcion: v })} {...f.busqueda('nombre')} />
        </GwField>
        <GwField label="Descr. Corta">{txt('descripcion_corta', 'DESCORTA')}</GwField>
        <GwField label="Cod. Externo">{txt('codigo_externo', 'CODEXTERNO')}</GwField>
        <GwField label="Cta. Contable">{txt('cuenta_contable', 'CTACONTA')}</GwField>
      </div>
      {f.error && <div className="text-[13px] text-[#c42b1c]">{f.error}</div>}

      <GwTabs rows={TABS} active={tab} onChange={setTab}>
        {f.sinRegistros ? (
          <PestanaPendiente texto="No hay ninguna forma de pago. Pulsa Nuevo para dar de alta la primera." alto={ALTO} />
        ) : (
          <div style={{ height: ALTO }} className="overflow-hidden">
            {tab === 'generales' && <DatosGenerales d={d} ro={ro} onChange={patch} />}
            {tab === 'generador' && <Generador d={d} ro={ro} onChange={patch} />}
            {tab === 'imagen' && (
              <ObservacionesImagenSoloImagen d={d} ro={ro} onChange={patch} />
            )}
          </div>
        )}
      </GwTabs>

      <GwRecordBar
        mode={mode}
        canNavigate={f.canNavigate}
        saving={f.saving}
        onFirst={() => f.irA('primero')}
        onPrev={() => f.irA('anterior')}
        onNext={() => f.irA('siguiente')}
        onLast={() => f.irA('ultimo')}
        onSort={() => f.setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={() => f.navigate('/formas-pago/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={() => f.eliminar(`la forma de pago ${f.registro.codigo} ${f.registro.descripcion}`, enUso)}
        onSave={() =>
          f.guardar(() => {
            if (!d.codigo.trim() || !d.descripcion.trim()) return 'El código y la descripción son obligatorios.'
            if (d.tipo === 4 && !d.tipo_contado) return 'Una forma de pago de contado necesita el tipo de contado (efectivo, tarjeta o cheque).'
            return null
          })
        }
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.total} mode={mode} que="forma de pago" />

      {buscar && (
        <GwLookupDialog<{ codigo: string; descripcion: string; descripcion_corta: string | null }>
          title="Buscar Forma de Pago"
          table="forma_pago"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'descripcion_corta', label: 'Descr. Corta', width: 140 },
          ]}
          searchColumns={['codigo', 'descripcion', 'descripcion_corta']}
          orderBy={f.orden === 'codigo' ? 'codigo' : 'descripcion'}
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(false)
            f.goTo(r.codigo)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
      {f.dialogoLista}
    </div>
  )
}

function DatosGenerales({ d, ro, onChange }: { d: FormaPago; ro: boolean; onChange: Patch }) {
  const contado = d.tipo === 4
  return (
    <div className="grid grid-cols-[392px_750px] gap-x-8 px-2 pt-3 text-[17px]">
      <div className="flex flex-col gap-6">
        <GwGroup title={<span className="text-[17px]">Tipo Forma De Pago</span>} className="flex flex-col gap-1.5">
          <div className="flex items-start gap-6">
            <div className="flex w-[170px] flex-col gap-1 border border-[var(--gw-border-light)] px-2 py-1" title="TIPO">
              {TIPOS.map((t) => (
                <GwRadio
                  key={t.valor}
                  name="fp-tipo"
                  label={<span className="text-[17px]">{t.label}</span>}
                  checked={d.tipo === t.valor}
                  disabled={ro}
                  onChange={() => onChange({ tipo: t.valor, tipo_contado: t.valor === 4 ? (d.tipo_contado ?? 1) : null })}
                />
              ))}
            </div>
            <div className="flex flex-col">
              <span className="text-[17px]">Tipo Contado</span>
              <div className="flex w-[140px] flex-col gap-1 border border-[var(--gw-border-light)] px-2 py-1" title="TIPOCONT">
                {CONTADOS.map((t) => (
                  <GwRadio
                    key={t.valor}
                    name="fp-contado"
                    label={<span className="text-[17px]">{t.label}</span>}
                    checked={contado && d.tipo_contado === t.valor}
                    disabled={ro || !contado}
                    onChange={() => onChange({ tipo_contado: t.valor })}
                  />
                ))}
              </div>
            </div>
          </div>
          <GwCheck className="text-[17px]" label="Domiciliación Bancaria" checked={d.domiciliacion_bancaria} disabled={ro} onChange={(v) => onChange({ domiciliacion_bancaria: v })} />
          <GwCheck className="text-[17px]" label="Pasar Efectos Pend. a Caja" checked={d.efectos_pendientes_a_caja} disabled={ro} onChange={(v) => onChange({ efectos_pendientes_a_caja: v })} />
        </GwGroup>
        <GwGroup title={<span className="text-[17px]">Restringir Uso</span>} className="flex flex-col gap-1.5">
          <GwCheck className="text-[17px]" label="No utilizable en ventas" checked={d.no_ver_en_ventas} disabled={ro} onChange={(v) => onChange({ no_ver_en_ventas: v })} />
          <GwCheck className="text-[17px]" label="No utilizable en compras" checked={d.no_ver_en_compras} disabled={ro} onChange={(v) => onChange({ no_ver_en_compras: v })} />
        </GwGroup>
      </div>
      <fieldset className="gw-group flex h-fit flex-col gap-2">
        <legend>
          <GwCheck className="text-[17px]" label="Desglosar comisiones bancarias en el enlace contable" checked={d.desglosa_comision_bancaria} disabled={ro} onChange={(v) => onChange({ desglosa_comision_bancaria: v })} />
        </legend>
        <div className="flex items-center gap-4">
          <span className="w-[280px]">% Comisión Bancaria:</span>
          <GwNumber className="!w-[108px]" value={d.comision_bancaria_pct} decimals={2} emptyAsZero disabled={ro} onChange={ro ? undefined : (v) => onChange({ comision_bancaria_pct: v })} />
        </div>
        <div className="flex items-center gap-4">
          <span className="flex-1">Cuenta Contable de la Comisión Bancaria:</span>
          <GwInput className="!w-[178px]" value={d.cuenta_contable_comision ?? ''} disabled={ro} title="CTACOMISION" onChange={(e) => onChange({ cuenta_contable_comision: e.target.value || null })} />
        </div>
        <GwGroup title={<span className="text-[17px]">Forma de pago (Banco), donde se hace el Abono</span>}>
          <CampoEnlace tabla="forma_pago" campoNombre="descripcion" titulo="Formas de Pago" desplegable title="FPABONO" value={d.forma_pago_comision_codigo} disabled={ro} onChange={(v) => onChange({ forma_pago_comision_codigo: v })} />
        </GwGroup>
      </fieldset>
    </div>
  )
}

const CADENCIAS: { k: keyof FormaPago; label: string }[] = [
  { k: 'cadencia_nivel1', label: 'Primera' },
  { k: 'cadencia_nivel2', label: 'Segunda' },
  { k: 'cadencia_nivel3', label: 'Tercera' },
  { k: 'cadencia_nivel4', label: 'Cuarta' },
  { k: 'cadencia_nivel5', label: 'Quinta' },
  { k: 'cadencia_nivel6', label: 'Sexta' },
  { k: 'cadencia_nivel0', label: 'Resto' },
]

function Generador({ d, ro, onChange }: { d: FormaPago; ro: boolean; onChange: Patch }) {
  const [fecha, setFecha] = useState<string | null>(hoy())
  const [importe, setImporte] = useState<number | null>(1000)
  const vtos = generarVencimientos(d, fecha ?? hoy(), importe ?? 0)
  const off = ro || !d.generar_pagos_automaticos
  const spin = (k: keyof FormaPago, extra: Partial<Parameters<typeof GwSpin>[0]> = {}) => (
    <GwSpin value={(d[k] as number | null) ?? 0} disabled={off} onChange={(v) => onChange({ [k]: v } as Partial<FormaPago>)} {...extra} />
  )
  return (
    <div className="grid grid-cols-[925px_minmax(0,1fr)] gap-x-4 px-2 pt-2 text-[17px]">
      <fieldset className="gw-group flex flex-col gap-1.5">
        <legend>
          <GwCheck className="text-[17px]" label="Generar Pagos" checked={d.generar_pagos_automaticos} disabled={ro} onChange={(v) => onChange({ generar_pagos_automaticos: v })} />
        </legend>
        <div className="grid grid-cols-[145px_140px_minmax(0,1fr)] items-end gap-x-4">
          <GwField label={<span className="text-[17px]">Nº Pagos</span>}>{spin('generador_num_pagos', { max: 99, title: 'NUMPAGOS' })}</GwField>
          <GwField label={<span className="text-[17px]">% Entrada</span>}>{spin('generador_pct_entrada', { max: 100, decimales: 2, title: 'PORENTRADA' })}</GwField>
          <GwGroup title={<span className="text-[17px]">Forma de pago de los Vencimientos</span>} className="!py-1">
            <CampoEnlace tabla="forma_pago" campoNombre="descripcion" titulo="Formas de Pago" desplegable title="FPVENCIM" value={d.forma_pago_vencimientos_codigo} disabled={off} onChange={(v) => onChange({ forma_pago_vencimientos_codigo: v })} />
          </GwGroup>
        </div>
        <GwGroup title={<span className="text-[17px]">Cadencias</span>} className="grid grid-cols-7 gap-x-2 !pt-0">
          {CADENCIAS.map((c) => (
            <GwField key={c.k} label={<span className="block text-center text-[17px]">{c.label}</span>}>
              {spin(c.k, { max: 999, title: `${c.label} cadencia (días)` })}
            </GwField>
          ))}
        </GwGroup>
        <GwGroup title={<span className="text-[17px]">Ajuste de Vencimientos a Días de Pago</span>} className="!pt-0">
          <div className="grid grid-cols-[160px_minmax(0,1fr)_92px_60px_118px] items-center gap-x-2 gap-y-1">
            <span />
            <span />
            <span className="text-center">Día</span>
            <span />
            <span className="text-center">Cadencia</span>
            <span>Primer Pago:</span>
            <GwSelect value={d.ajuste_vencimiento_tipo0 ?? 1} disabled={off} title="AJUSTE1" onChange={(e) => onChange({ ajuste_vencimiento_tipo0: Number(e.target.value) })}>
              {AJUSTES.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.label}
                </option>
              ))}
            </GwSelect>
            {spin('dia_mes_ajuste0', { min: 1, max: 31, title: 'DIA1' })}
            <span className="text-right">Mín.:</span>
            {spin('ajuste_dias_minimo', { max: 999, title: 'CADMIN' })}
            <span>Resto Pagos:</span>
            <GwSelect value={d.ajuste_vencimiento_tipo1 ?? 1} disabled={off} title="AJUSTE2" onChange={(e) => onChange({ ajuste_vencimiento_tipo1: Number(e.target.value) })}>
              {AJUSTES.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.label}
                </option>
              ))}
            </GwSelect>
            {spin('dia_mes_ajuste1', { min: 1, max: 31, title: 'DIA2' })}
            <span className="text-right">Máx.:</span>
            {spin('ajuste_dias_maximo', { max: 999, title: 'CADMAX' })}
          </div>
        </GwGroup>
        <GwCheck className="text-[17px]" label="Al Generar los Vencimientos, ponerlos como Pagados" checked={d.vencimientos_como_pagados} disabled={off} onChange={(v) => onChange({ vencimientos_como_pagados: v })} />
      </fieldset>

      <GwGroup title="Vencimientos que genera (simulación)" className="flex h-fit flex-col gap-1 text-[13px]">
        <div className="grid grid-cols-2 gap-x-2">
          <GwField label="Fecha documento">
            <GwDate value={fecha} onChange={setFecha} />
          </GwField>
          <GwField label="Importe">
            <GwNumber value={importe} decimals={2} onChange={setImporte} />
          </GwField>
        </div>
        <div className="max-h-[250px] overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th style={{ width: 30 }}>Nº</th>
                <th>Vencimiento</th>
                <th style={{ width: 50 }} className="text-right!">
                  Días
                </th>
                <th className="text-right!">Importe</th>
              </tr>
            </thead>
            <tbody>
              {vtos.map((v) => (
                <tr key={v.n} title={v.pagado ? 'Se generaría como pagado' : undefined}>
                  <td>{v.n}</td>
                  <td>
                    {v.fecha.split('-').reverse().join('/')}
                    {v.pagado ? ' ✓' : ''}
                  </td>
                  <td className="text-right">{v.dias}</td>
                  <td className="text-right">{formatGw(v.importe, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GwGroup>
    </div>
  )
}

function ObservacionesImagenSoloImagen({ d, ro, onChange }: { d: FormaPago; ro: boolean; onChange: Patch }) {
  return (
    <div className="h-full px-1 pt-1">
      <ObservacionesImagen
        nombre="forma-pago"
        sinObservaciones
        observaciones={null}
        imagenUrl={d.imagen_url}
        imagenModo={d.imagen_modo ?? 1}
        ro={ro}
        alto={ALTO - 10}
        onChange={(p) =>
          onChange({
            ...('imagen_url' in p ? { imagen_url: p.imagen_url ?? null } : {}),
            ...('imagen_modo' in p ? { imagen_modo: p.imagen_modo ?? 1 } : {}),
          })
        }
      />
    </div>
  )
}
