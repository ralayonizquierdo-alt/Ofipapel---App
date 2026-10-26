import { useState, type ReactNode } from 'react'
import {
  GwCheck,
  GwField,
  GwGroup,
  GwInline,
  GwInput,
  GwLookupButton,
  GwNumber,
  GwRadio,
  GwSelect,
  formatGw,
} from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { Articulo, ArticuloPrecioNivel } from '../types'
import { costeBase, margenReal, type NivelPatch } from '../pricing'

type Patch = Partial<Articulo>

const NOMBRES_PVP = ['General:', 'MAYOR  M-1:', 'MAYOR  M-2:', 'MAYOR  M-3:', 'Tarifa Dcto -4:', 'Tarifa Dcto -5:', 'Tarifa Dcto -6:']
const UNIDADES = ['UNIDAD', 'CAJA', 'PAQUETE', 'KG', 'LITRO', 'METRO', 'HORA']

function fecha(v: string | null, conHora = false) {
  if (!v) return conHora ? '  /  /' : '  /  /'
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  if (Number.isNaN(d.getTime())) return v
  const f = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return conHora ? `${f} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : f
}

function Fecha({ label, value, conHora, labelWidth = 92 }: { label: string; value: string | null; conHora?: boolean; labelWidth?: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="gw-label" style={{ width: labelWidth }}>
        {label}
      </span>
      <GwInput readOnly value={fecha(value, conHora)} className={conHora ? '!w-[150px]' : '!w-[118px]'} />
    </div>
  )
}

function CosteRow({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col" title={title}>
      <span className="gw-label">{label}</span>
      {children}
    </div>
  )
}

export function TabCaracteristicas({
  articulo,
  editing,
  onChange,
  plantillas,
  niveles,
  onNivelChange,
  preciosCargados,
}: {
  articulo: Articulo
  editing: boolean
  onChange: (patch: Patch) => void
  plantillas: { codigo: string; nombre: string }[]
  niveles: ArticuloPrecioNivel[]
  onNivelChange: (nivel: number, patch: NivelPatch) => void
  preciosCargados: boolean
}) {
  const disabled = !editing
  const preciosDisabled = disabled || !preciosCargados
  const [buscarPlantilla, setBuscarPlantilla] = useState(false)
  const base = costeBase(articulo)

  const num = (key: keyof Articulo, decimals = 3) => (
    <GwNumber
      value={articulo[key] as number | null}
      decimals={decimals}
      disabled={disabled}
      emptyAsZero
      onChange={(v) => onChange({ [key]: v } as Patch)}
    />
  )
  const check = (key: keyof Articulo, label: string, extraDisabled = false, title?: string) => (
    <span title={title}>
      <GwCheck label={label} checked={Boolean(articulo[key])} disabled={disabled || extraDisabled} onChange={(v) => onChange({ [key]: v } as Patch)} />
    </span>
  )
  const unidadSelect = (key: 'unidad_medida' | 'unidad_medida_base') => {
    const actual = articulo[key]
    const opciones = actual && !UNIDADES.includes(actual) ? [actual, ...UNIDADES] : UNIDADES
    return (
      <GwSelect value={actual ?? ''} disabled={disabled} onChange={(e) => onChange({ [key]: e.target.value || null } as Patch)}>
        <option value="" />
        {opciones.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </GwSelect>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[170px_minmax(0,600px)_minmax(0,1fr)] gap-2">
        <GwGroup title="Precios de coste" className="flex flex-col gap-0.5">
          <CosteRow label="Coste Puro Prov." title="COSTE_PURO">
            {num('coste_puro')}
          </CosteRow>
          <CosteRow label="Coste Neto:" title="COSTE_NETO">
            {num('coste_neto')}
          </CosteRow>
          <CosteRow label="Coste Bruto:" title="COSTE_BRUT">
            {num('coste_bruto')}
          </CosteRow>
          <CosteRow label="Coste Líquido:" title="PRECIO_LIQ">
            {num('precio_liquidado')}
          </CosteRow>
          <CosteRow label="Precio Liq. Medio:" title="PM_COMPRA">
            {num('precio_medio_compra')}
          </CosteRow>
          <CosteRow label="Proveedor Local:" title="COST_LOCAL">
            {num('coste_local')}
          </CosteRow>
        </GwGroup>

        <div className="flex min-w-0 flex-col gap-1">
          <GwGroup title="Pvps">
            <div className="flex flex-col gap-[3px]">
              {niveles.map((n) => (
                <div
                  key={n.nivel_tarifa}
                  className="grid grid-cols-[110px_52px_52px_92px_132px_62px] items-center gap-1"
                >
                  <span className="gw-label" title={`PVP_${n.nivel_tarifa}`}>
                    {NOMBRES_PVP[n.nivel_tarifa]}
                  </span>
                  <GwSelect
                    title={`POD${n.nivel_tarifa}: P = % sobre coste, D = % de descuento sobre la General`}
                    value={n.modo_calculo ?? 'P'}
                    disabled={preciosDisabled}
                    onChange={(e) => onNivelChange(n.nivel_tarifa, { modo_calculo: e.target.value })}
                  >
                    <option value="P">P</option>
                    <option value="D">D</option>
                  </GwSelect>
                  <GwSelect
                    title={`VERDTO_${n.nivel_tarifa}`}
                    value={n.permite_descuento_linea ? 'S' : 'N'}
                    disabled={preciosDisabled}
                    onChange={(e) => onNivelChange(n.nivel_tarifa, { permite_descuento_linea: e.target.value === 'S' })}
                  >
                    <option value="N">N</option>
                    <option value="S">S</option>
                  </GwSelect>
                  <GwNumber
                    value={n.incremento_pct}
                    decimals={2}
                    disabled={preciosDisabled}
                    onChange={(v) => onNivelChange(n.nivel_tarifa, { incremento_pct: v })}
                  />
                  <GwNumber
                    value={n.pvp}
                    decimals={3}
                    disabled={preciosDisabled}
                    emptyAsZero
                    onChange={(v) => onNivelChange(n.nivel_tarifa, { pvp: v ?? 0 })}
                  />
                  <span className="gw-label">{margenReal(n.pvp, base)}</span>
                </div>
              ))}
            </div>
          </GwGroup>
          <div className="flex flex-wrap items-center gap-1.5">
            <GwInline label="Plantilla Tar.:">
              <span className="flex" title="CODARTTAR">
                <GwSelect
                  className="!w-[110px]"
                  value={articulo.plantilla_tarifa_codigo ?? ''}
                  disabled={disabled}
                  onChange={(e) => onChange({ plantilla_tarifa_codigo: e.target.value || null })}
                >
                  <option value="" />
                  {plantillas.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.codigo}
                    </option>
                  ))}
                </GwSelect>
                <GwLookupButton disabled={disabled} onClick={() => setBuscarPlantilla(true)} title="Buscar plantilla de tarifas" />
              </span>
            </GwInline>
            <span title="TIPPLANTAR: de dónde sale la plantilla (confirmar con Luis)">
              <GwSelect
                className="!w-[130px]"
                value={articulo.plantilla_tarifa_origen ?? ''}
                disabled={disabled}
                onChange={(e) => onChange({ plantilla_tarifa_origen: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="" />
                <option value="0">Artículo</option>
                <option value="1">Familia Niv.1</option>
                <option value="2">Familia Niv.2</option>
                <option value="3">Familia Niv.3</option>
              </GwSelect>
            </span>
            <GwInline label="Dto. Max.:" className="ml-auto">
              <span className="w-[80px]" title="DTOMAXCLI">
                {num('descuento_maximo_cliente_pct', 2)}
              </span>
            </GwInline>
          </div>
          <div className="gw-label" title="COSTEPVP_0">
            Ultimo Precio de Coste usado para el recalculo de Pvps: {formatGw(articulo.coste_usado_calculo_pvp ?? 0, 3)}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <GwField label="Control de Lotes">
            <span title="CTRLLOTES (confirmar valores con Luis)">
              <GwSelect
                value={articulo.control_lotes ?? 0}
                disabled={disabled}
                onChange={(e) => onChange({ control_lotes: Number(e.target.value) })}
              >
                <option value={0}>Predeterminado</option>
                <option value={1}>Sí</option>
                <option value={2}>No</option>
              </GwSelect>
            </span>
          </GwField>
          <div className="grid grid-cols-2 gap-2">
            <GwField label="Unidad de Medida">
              <span title="UNI_MEDIDA">{unidadSelect('unidad_medida')}</span>
            </GwField>
            <GwField label="Unidad Básica">
              <span title="UNI_MEDBAS">{unidadSelect('unidad_medida_base')}</span>
            </GwField>
          </div>
          <GwInline label="Valor Unidad de Medida:" className="justify-between">
            <span className="w-[170px]" title="UNI_MEDVAL">
              {num('unidad_medida_valor', 6)}
            </span>
          </GwInline>
          <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-2">
            <GwGroup title="Impuestos" className="flex flex-col gap-1">
              <div className="grid grid-cols-[70px_1fr] gap-2">
                <GwField label="% IGIC">
                  <span title="IGIC">{num('igic_pct', 2)}</span>
                </GwField>
                <div className="flex flex-col" title="TIPOIGIC (confirmar códigos con Luis)">
                  <span className="gw-label">Tipo IGIC</span>
                  <GwRadio
                    name="tipo-igic"
                    label="Soportado"
                    checked={articulo.tipo_igic_codigo === 1}
                    disabled={disabled}
                    onChange={() => onChange({ tipo_igic_codigo: 1 })}
                  />
                  <GwRadio
                    name="tipo-igic"
                    label="Repercutido"
                    checked={articulo.tipo_igic_codigo !== 1}
                    disabled={disabled}
                    onChange={() => onChange({ tipo_igic_codigo: 0 })}
                  />
                </div>
              </div>
              <GwField label="Canon">
                <span className="w-[110px]" title="IMPU2">
                  {num('impuesto2_pct', 2)}
                </span>
              </GwField>
            </GwGroup>
            <GwGroup title="Embalaje" className="flex flex-col gap-0.5">
              <GwField label="Cajas/Bulto">
                <span title="CAJ_BULTO">{num('cajas_por_bulto', 2)}</span>
              </GwField>
              <GwField label="Unids/Caja">
                <span title="UNI_CAJA">{num('unidades_por_caja', 2)}</span>
              </GwField>
              <div className="pt-1">{check('vende_por_caja', 'Vender Cajas', false, 'VENDPORCAJ')}</div>
            </GwGroup>
          </div>
          <GwInline label="Meses de Garantía:">
            <span className="w-[70px]" title="GARANTIA">
              {num('garantia_meses', 0)}
            </span>
          </GwInline>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,670px)] gap-2">
        <GwGroup title="Opciones" className="flex flex-col gap-0.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {check('generico', 'Genérico', false, 'Genérico (probablemente MODDES, confirmar con Luis)')}
            {check('no_ver_en_venta', 'No Mostrar en ventas', false, 'NOVERENVTA')}
            {check('vende_por_horario', 'Usar Formato de Horas y Minutos al Vender', false, 'VENDPORHOR')}
            {check('pesar_en_tpv', 'Pesar al Vender', false, 'PESARENTPV')}
          </div>
          {check('permite_modificar_pvp_al_vender', 'Permitir modificar el Pvp en ventas', false, 'MODITPV')}
          <div className="flex flex-wrap gap-x-6 pl-0">
            {check('permite_modificar_pvp_solo_si_es_cero', 'Sólo si el PVP=0', !articulo.permite_modificar_pvp_al_vender, 'MPVPSIPVP0')}
            {check('modificar_pvp_actualiza_articulo', 'Reemplaz. en artículos', !articulo.permite_modificar_pvp_al_vender, 'MPVPUPDART')}
            {check('modificar_pvp_pide_precio_coste', 'Pedir prec. Coste', !articulo.permite_modificar_pvp_al_vender, 'MPVPCOSTE')}
          </div>
        </GwGroup>
        <GwGroup title="Fechas" className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
          <Fecha label="Última compra" value={articulo.ultima_compra_fecha} />
          <Fecha label="Prev. Entrada Pedido" value={articulo.fecha_prevista_venta} labelWidth={140} />
          <Fecha label="Última venta" value={articulo.ultima_venta_fecha} />
          <Fecha label="Últ. Modif. de Pvps" value={articulo.fecha_ultima_modificacion_pvp} conHora labelWidth={140} />
          <div className="flex items-center gap-2">
            <Fecha label="F. Alta" value={articulo.fecha_alta} labelWidth={40} />
            <Fecha label="F. Baja" value={articulo.fecha_baja} labelWidth={44} />
          </div>
          <Fecha label="Modif." value={articulo.actualizado_en || null} conHora labelWidth={140} />
        </GwGroup>
      </div>

      {buscarPlantilla && (
        <GwLookupDialog<{ codigo: string; descripcion: string }>
          title="Plantillas de Tarifas"
          table="plantilla_tarifa"
          columns={[
            { key: 'codigo', label: 'Código', width: 110 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            onChange({ plantilla_tarifa_codigo: r.codigo })
            setBuscarPlantilla(false)
          }}
          onClose={() => setBuscarPlantilla(false)}
        />
      )}
    </div>
  )
}
