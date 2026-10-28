import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Binoculars, Check, ChevronFirst, ChevronLast, DoorOpen, Play, Printer } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { avisoTope, todasLasFilas } from '../../../lib/todasLasFilas'
import { formatGw } from '../../../components/gw'
import {
  BarButton,
  BigTabs,
  BIG_INPUT,
  borrarOpciones,
  conFiltro,
  fechaEs,
  FiltroBar,
  filtroInicial,
  guardarOpciones,
  leerOpciones,
  LocalizarDialog,
  nombreCliente,
  OptionButton,
  pitido,
  procesosIniciales,
  ProcesosGroup,
  useRefresco,
  type Filtro,
  type Procesos,
} from './comun'
import { ordenar, Rejilla, type Col, type Orden } from './rejilla'

const CLAVE_OPCIONES = 'gw.gestorPresupuestos.opciones'

interface Opciones {
  modal: boolean
  pactoTarifas: boolean
  refrescarAlGuardar: boolean
  refrescoAuto: boolean
  segundos: number
  diasAvisoCaducidad: number
  diasAvisoCaducados: number
  procesos: Procesos
}

const OPCIONES_DEFECTO: Opciones = {
  modal: false,
  pactoTarifas: true,
  refrescarAlGuardar: true,
  refrescoAuto: false,
  segundos: 0,
  diasAvisoCaducidad: 0,
  diasAvisoCaducados: 0,
  procesos: procesosIniciales,
}

interface PresupuestoRow {
  key: string
  tienda: string
  numero: number
  fecha: string | null
  hora: string | null
  caducidad: string | null
  dias: number | null
  aceptado: boolean
  vendido: boolean
  anulado: boolean
  cliente: string | null
  nombre: string
}

const CAMPOS_FECHA = [
  { value: 'fecha', label: 'Fecha' },
  { value: 'fecha_fin', label: 'Caducidad' },
  { value: 'actualizado_en', label: 'Última Modificación' },
]

function diasHasta(fecha: string | null) {
  if (!fecha) return null
  const hoy = new Date()
  const h = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - h) / 86_400_000)
}

const siNo = (v: boolean) => (v ? 'Si' : 'No')

/** Máximo de presupuestos que trae el gestor; si hay más, avisa de que se afine el filtro. */
const TOPE_PRESUPUESTOS = 5000

export function GestorPresupuestosPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('seguimiento')
  const [filtro, setFiltro] = useState<Filtro>(() => filtroInicial('fecha', 'El Mes pasado'))
  const aplicado = useRef<Filtro>(filtro)
  const [opciones, setOpciones] = useState<Opciones>(() => leerOpciones(CLAVE_OPCIONES, OPCIONES_DEFECTO))
  const [msgOpciones, setMsgOpciones] = useState('')
  const [rows, setRows] = useState<PresupuestoRow[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [nuevos, setNuevos] = useState<string[]>([])
  const conocidos = useRef<Set<string> | null>(null)
  const [sel, setSel] = useState(0)
  const [orden, setOrden] = useState<Orden | null>(null)
  const [localizar, setLocalizar] = useState(false)

  const cargar = useCallback(async (f: Filtro) => {
    setCargando(true)
    setError(null)
    const base = () =>
      supabase
        .from('pedido_cliente')
        .select('tienda_terminal_codigo, numero, fecha, hora, fecha_fin, aceptado, anulado, venta_numero, cliente_codigo, nombre_cliente, cliente:cliente_codigo(nombre)')
        .eq('es_presupuesto', true)
        .eq('es_reparacion', false)
    // Supabase corta cada respuesta en 1000 filas: se pide por bloques, con tope y aviso.
    const { data, error: e, cortado } = await todasLasFilas(
      () => conFiltro(base(), f, f.campo, f.campo === 'actualizado_en').order('fecha').order('hora').order('tienda_terminal_codigo').order('numero'),
      { tope: TOPE_PRESUPUESTOS },
    )
    if (e) {
      setError(e)
      setCargando(false)
      return
    }
    setAviso(cortado ? avisoTope(TOPE_PRESUPUESTOS) : null)
    const filas: PresupuestoRow[] = (data ?? []).map((p) => ({
      key: `${p.tienda_terminal_codigo}/${p.numero}`,
      tienda: p.tienda_terminal_codigo,
      numero: p.numero,
      fecha: p.fecha,
      hora: p.hora,
      caducidad: p.fecha_fin,
      dias: diasHasta(p.fecha_fin),
      aceptado: !!p.aceptado,
      vendido: p.venta_numero != null,
      anulado: !!p.anulado,
      cliente: p.cliente_codigo,
      nombre: nombreCliente(p),
    }))
    const ahora = new Set(filas.map((r) => r.key))
    if (conocidos.current) {
      const llegados = [...ahora].filter((k) => !conocidos.current!.has(k))
      if (llegados.length) {
        setNuevos((n) => [...n, ...llegados.filter((k) => !n.includes(k))])
        pitido()
      }
      llegados.forEach((k) => conocidos.current!.add(k))
    } else conocidos.current = ahora
    setRows(filas)
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar(aplicado.current)
  }, [cargar])

  useRefresco(opciones.refrescoAuto, opciones.segundos, () => cargar(aplicado.current))

  function aplicar() {
    aplicado.current = filtro
    conocidos.current = null
    setNuevos([])
    setSel(0)
    cargar(filtro)
  }

  const cols: Col<PresupuestoRow>[] = useMemo(
    () => [
      { key: 'tienda', label: 'Ti.', width: 62, value: (r) => r.tienda },
      { key: 'numero', label: 'Id Ped.', width: 115, align: 'right', value: (r) => r.numero, render: (r) => formatGw(r.numero, 0) },
      { key: 'fecha', label: 'Fecha', width: 148, value: (r) => r.fecha, render: (r) => fechaEs(r.fecha) },
      { key: 'hora', label: 'Hora', width: 78, value: (r) => r.hora },
      { key: 'caducidad', label: 'Caducidad', width: 148, value: (r) => r.caducidad, render: (r) => fechaEs(r.caducidad), title: 'Fin del periodo de validez del presupuesto' },
      { key: 'dias', label: 'Días', width: 70, align: 'right', value: (r) => r.dias, title: 'Días que faltan para la caducidad (negativo: ya caducado)' },
      { key: 'ac', label: 'Ac.', width: 41, value: (r) => siNo(r.aceptado), title: 'Aceptado' },
      { key: 'va', label: 'Va.', width: 41, value: (r) => siNo(r.vendido), title: 'Convertido en venta (deducido; confirmar con Luis)' },
      { key: 'az', label: 'Az', width: 39, value: () => '', title: 'Columna «Az» de GeminisWin: significado por confirmar con Luis' },
      { key: 'an', label: 'An.', width: 41, value: (r) => siNo(r.anulado), title: 'Anulado' },
      { key: 'cliente', label: 'Id Client.', width: 115, value: (r) => r.cliente },
      { key: 'nombre', label: 'Nombre Cliente', width: 445, value: (r) => r.nombre },
    ],
    [],
  )
  const filas = useMemo(() => ordenar(rows, cols, orden), [rows, cols, orden])

  function editar(r?: PresupuestoRow) {
    const p = r ?? filas[sel]
    if (!p) return
    setNuevos((v) => v.filter((x) => x !== p.key))
    navigate(`/presupuestos/${encodeURIComponent(p.tienda)}/${p.numero}`)
  }

  function buscarEnRejilla(texto: string) {
    const t = texto.trim().toLowerCase()
    if (!t || !filas.length) return false
    for (let k = 1; k <= filas.length; k++) {
      const i = (sel + k) % filas.length
      if (cols.some((c) => String(c.value(filas[i]) ?? '').toLowerCase().includes(t))) {
        setSel(i)
        return true
      }
    }
    return false
  }

  const setOp = (p: Partial<Opciones>) => setOpciones((o) => ({ ...o, ...p }))
  const n = filas.length
  const num = (v: number, on: (v: number) => void) => (
    <input type="number" min={0} className={`${BIG_INPUT} h-[34px]! w-[165px]! text-right`} value={v} onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))} />
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BigTabs
        tabs={[
          { key: 'seguimiento', label: 'Seguimiento de Presupuestos' },
          { key: 'opciones', label: 'Opciones del Seguimiento' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 border border-[var(--gw-border)] bg-[var(--gw-face)] p-1.5">
        {tab === 'seguimiento' && (
          <>
            {nuevos.length > 0 && (
              <div className="flex flex-none items-center gap-2 border border-[#c9a400] bg-[#fff3a0] px-2 py-1 text-[16px] font-bold">
                <span className="flex-1 truncate">
                  Han entrado {nuevos.length} presupuesto{nuevos.length === 1 ? '' : 's'} nuevo{nuevos.length === 1 ? '' : 's'}: {nuevos.slice(0, 8).join(', ')}
                  {nuevos.length > 8 ? '…' : ''}
                </span>
                <button type="button" className="gw-btn" onClick={() => setNuevos([])}>
                  Visto
                </button>
              </div>
            )}
            {error && <div className="flex-none text-[14px] text-[#c42b1c]">{error}</div>}
            {aviso && !error && <div className="flex-none text-[14px] font-bold text-[#c42b1c]">{aviso}</div>}
            <FiltroBar filtro={filtro} onChange={setFiltro} campos={CAMPOS_FECHA}>
              <button type="button" className="gw-btn h-[62px]! w-full text-[20px]!" onClick={aplicar} disabled={cargando}>
                <Check size={16} strokeWidth={3} className="text-[#2a9d2a]" />
                {cargando ? 'Buscando…' : 'Aplicar'}
              </button>
              <button type="button" className="gw-btn h-[62px]! w-full text-[20px]! leading-[22px]" disabled={!filas[sel]} onClick={() => editar()}>
                Editar
                <br />
                Presup.
              </button>
            </FiltroBar>
            <Rejilla
              rows={filas}
              cols={cols}
              rowKey={(r) => r.key}
              sel={sel}
              onSel={setSel}
              onOpen={editar}
              orden={orden}
              onOrden={setOrden}
              vacias={12}
              rowStyle={(r) => {
                if (nuevos.includes(r.key)) return { background: '#fff3a0', fontWeight: 700 }
                if (r.dias == null || r.vendido || r.anulado) return undefined
                if (r.dias < 0 && opciones.diasAvisoCaducados > 0 && -r.dias <= opciones.diasAvisoCaducados) return { background: '#f6b3b3' }
                if (r.dias >= 0 && opciones.diasAvisoCaducidad > 0 && r.dias <= opciones.diasAvisoCaducidad) return { background: '#fde9a6' }
                return undefined
              }}
            />
            <div className="flex flex-none">
              <BarButton title="Primero" className="w-[106px]" disabled={!n} onClick={() => setSel(0)}>
                <ChevronFirst size={18} strokeWidth={3} />
              </BarButton>
              <BarButton title="Anterior" className="w-[106px]" disabled={!n} onClick={() => setSel(Math.max(sel - 1, 0))}>
                <Play size={12} className="rotate-180" fill="currentColor" />
              </BarButton>
              <BarButton title="Siguiente" className="w-[106px]" disabled={!n} onClick={() => setSel(Math.min(sel + 1, n - 1))}>
                <Play size={12} fill="currentColor" />
              </BarButton>
              <BarButton title="Último" className="w-[106px]" disabled={!n} onClick={() => setSel(n - 1)}>
                <ChevronLast size={18} strokeWidth={3} />
              </BarButton>
              <BarButton title="Buscar (Localizar registros)" className="w-[106px]" disabled={!n} onClick={() => setLocalizar(true)}>
                <Binoculars size={17} />
              </BarButton>
              <BarButton title="Imprimir" className="w-[106px]" onClick={() => window.print()}>
                <Printer size={17} />
              </BarButton>
              <BarButton title="Salir" className="ml-auto w-[106px]" onClick={() => navigate('/')}>
                <DoorOpen size={18} />
              </BarButton>
            </div>
          </>
        )}

        {tab === 'opciones' && (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-x-1.5">
              <OptionButton
                label="Mostrar el Formulario de Presupuestos de forma Modal"
                value={opciones.modal}
                onChange={(v) => setOp({ modal: v })}
                title="Se guarda la opción; en el ERP propio la ficha se abre siempre en la misma ventana"
              />
              <OptionButton
                label="Por defecto, usarlo para Pacto de Tarifas"
                value={opciones.pactoTarifas}
                onChange={(v) => setOp({ pactoTarifas: v })}
                title="Se guarda la opción; el pacto de tarifas aún no está disponible en el ERP propio"
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)] gap-x-1.5">
              <OptionButton label="Refrescar Consulta al Cerrar el Formulario de Presupuestos" value={false} disabled title="No disponible en GeminisWin para este grupo de acceso" />
              <OptionButton
                label="Refrescar al Guardar Modificaciones"
                value={opciones.refrescarAlGuardar}
                onChange={(v) => setOp({ refrescarAlGuardar: v })}
                title="Al volver de la ficha, el gestor vuelve a consultar"
              />
            </div>
            <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] items-center gap-x-1.5">
              <OptionButton label="Refrescar la Consulta Automáticamente" value={opciones.refrescoAuto} onChange={(v) => setOp({ refrescoAuto: v })} />
              <div className="flex items-center gap-3 pl-2">
                <span className="text-[18px]">Segundos del intervalo del refresco:</span>
                {num(opciones.segundos, (v) => setOp({ segundos: v }))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-0.5">
              <div className="flex items-center gap-3">
                <span className="text-[18px]">Días de margen para Avisar la Caducidad:</span>
                {num(opciones.diasAvisoCaducidad, (v) => setOp({ diasAvisoCaducidad: v }))}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[18px]">Días de margen para Avisar los Caducados:</span>
                {num(opciones.diasAvisoCaducados, (v) => setOp({ diasAvisoCaducados: v }))}
              </div>
            </div>
            <ProcesosGroup
              value={opciones.procesos}
              onChange={(p) => setOp({ procesos: p })}
              nombre="Pedidos"
              textoCompleto="Imprimir Informe del Presupesto de todos los presupuestos nuevos Por"
            />
            <div className="flex flex-none items-center gap-[70px]">
              <button
                type="button"
                className="gw-btn h-[42px]! px-4! text-[19px]!"
                onClick={() => setMsgOpciones(guardarOpciones(CLAVE_OPCIONES, opciones) ? 'Valores guardados en este puesto.' : 'No se han podido guardar en este navegador.')}
              >
                💾 Guardar Valores
              </button>
              <button
                type="button"
                className="gw-btn h-[42px]! px-4! text-[19px]!"
                onClick={() => {
                  setOpciones(leerOpciones(CLAVE_OPCIONES, OPCIONES_DEFECTO))
                  setMsgOpciones('Valores cargados.')
                }}
              >
                ↶ Cargar Valores
              </button>
              <button
                type="button"
                className="gw-btn h-[42px]! px-4! text-[19px]!"
                onClick={() => {
                  borrarOpciones(CLAVE_OPCIONES)
                  setOpciones(OPCIONES_DEFECTO)
                  setMsgOpciones('Valores eliminados: se usan los predeterminados.')
                }}
              >
                ✖ Eliminar Valores
              </button>
              {msgOpciones && <span className="gw-label text-[15px]!">{msgOpciones}</span>}
            </div>
          </div>
        )}
      </div>
      {localizar && <LocalizarDialog onBuscar={buscarEnRejilla} onClose={() => setLocalizar(false)} />}
    </div>
  )
}
