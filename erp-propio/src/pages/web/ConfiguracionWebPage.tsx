import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, DoorOpen, PlugZap, RefreshCw, Save, ShieldCheck, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwField, GwGroup, GwInput, GwLookupButton } from '../../components/gw'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { SECRETOS_WOOCOMMERCE, wc, ESTADOS_PEDIDO_WEB, type WcEstado } from '../../lib/woocommerce'
import type { ConfigImportacion } from '../../lib/webMapeo'
import { cargarConfigWeb, WebError } from './comun'

/** Web → Configuración de la Conexión: estado de la conexión con WooCommerce y ajustes de importación. */
export function ConfiguracionWebPage() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<WcEstado | null>(null)
  const [errEstado, setErrEstado] = useState<unknown>(null)
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null)
  const [errPrueba, setErrPrueba] = useState<unknown>(null)
  const [probando, setProbando] = useState(false)
  const [cfg, setCfg] = useState<ConfigImportacion | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [buscar, setBuscar] = useState<null | 'cliente' | 'portes' | 'generico'>(null)

  async function cargarEstado() {
    setErrEstado(null)
    try {
      setEstado(await wc.estado())
    } catch (e) {
      setErrEstado(e)
    }
  }

  useEffect(() => {
    cargarEstado()
    cargarConfigWeb().then(setCfg)
  }, [])

  async function probar() {
    setProbando(true)
    setPrueba(null)
    setErrPrueba(null)
    try {
      const r = await wc.probar()
      const p = r.data?.[0]
      setPrueba({
        ok: true,
        texto: `Conexión correcta. ${Number.isFinite(r.total) ? `La tienda tiene ${r.total} productos.` : ''} ${p ? `Primero: «${p.name}» (SKU ${p.sku || 'vacío'}).` : ''}`,
      })
    } catch (e) {
      setErrPrueba(e)
    }
    setProbando(false)
  }

  async function guardar() {
    if (!cfg) return
    const { error } = await supabase
      .from('web_configuracion')
      .update({ ...cfg, actualizado_en: new Date().toISOString() })
      .eq('id', 1)
    setMsg(error ? `No se ha podido guardar: ${error.message}` : 'Configuración guardada.')
  }

  const set = (p: Partial<ConfigImportacion>) => setCfg((c) => (c ? { ...c, ...p } : c))

  return (
    <div className="flex min-w-0 flex-col gap-2 text-[13px]">
      <GwGroup title="Conexión con la tienda online (WooCommerce)">
        <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
          <span className="gw-label">Dirección de la web:</span>
          <GwInput readOnly value={estado?.url ?? ''} className="max-w-[420px]" />
          <span className="gw-label">Claves de la API:</span>
          <span className="flex items-center gap-1.5">
            {estado ? (
              estado.hayClaves ? (
                <>
                  <CheckCircle2 size={15} className="text-[#2a9d2a]" /> Configuradas (no se muestran)
                </>
              ) : (
                <>
                  <XCircle size={15} className="text-[#c42b1c]" /> <b>Faltan las claves de WooCommerce en Supabase</b>
                </>
              )
            ) : (
              '…'
            )}
          </span>
          <span className="gw-label">Paso anti-bots:</span>
          <span>{estado ? (estado.hayBypass ? 'Configurado (cabecera X-Ofipapel-Bot)' : 'Sin configurar (opcional)') : '…'}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="gw-btn" onClick={probar} disabled={probando}>
            <PlugZap size={14} /> {probando ? 'Probando…' : 'Probar conexión'}
          </button>
          <button type="button" className="gw-btn" onClick={cargarEstado}>
            <RefreshCw size={14} /> Actualizar estado
          </button>
          {prueba && <span className="font-bold text-[#127a12]">{prueba.texto}</span>}
        </div>
        <div className="mt-1.5 flex flex-col gap-1">
          <WebError error={errEstado} />
          <WebError error={errPrueba} />
        </div>
      </GwGroup>

      <GwGroup title="Regla de solo lectura">
        <div className="flex gap-2">
          <ShieldCheck size={20} className="flex-none text-[#1d3a8a]" />
          <div>
            La web (ofipapel.net) la gestiona una empresa externa y <b>Rober no ha autorizado escribir nada en ella</b>. El ERP solo <b>lee</b>{' '}
            productos, pedidos, clientes, cupones y reembolsos. Las opciones que cambiarían la web (publicar, enviar precios o stock, devolver el estado de
            un pedido) se muestran como <b>vista previa</b> con el botón desactivado: «Pendiente de autorización de Rober». Importar un pedido escribe solo
            en el ERP.
          </div>
        </div>
      </GwGroup>

      <GwGroup title="Dónde poner las claves (lo hace Rober)">
        <div className="mb-1">
          Supabase → proyecto del ERP → <b>Edge Functions → Secrets</b> (función <code>woocommerce-erp</code>). Las claves se crean en WordPress:
          WooCommerce → Ajustes → Avanzado → API REST → Añadir clave, con permiso <b>Lectura</b>.
        </div>
        <table className="gw-grid max-w-[900px]">
          <thead>
            <tr>
              <th className="w-[290px]">Secreto</th>
              <th className="w-[90px]">¿Obligatorio?</th>
              <th>Para qué</th>
            </tr>
          </thead>
          <tbody>
            {SECRETOS_WOOCOMMERCE.map((s) => (
              <tr key={s.nombre}>
                <td className="font-mono">{s.nombre}</td>
                <td>{s.obligatorio ? 'Sí' : 'No'}</td>
                <td>{s.nota}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GwGroup>

      <GwGroup title="Importación de pedidos web en el ERP">
        {cfg && (
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-x-3 gap-y-1.5">
            <GwField label="Cliente web genérico (si no se encuentra por email/NIF/teléfono)">
              <div className="flex gap-1">
                <GwInput value={cfg.cliente_generico_codigo ?? ''} onChange={(e) => set({ cliente_generico_codigo: e.target.value || null })} />
                <GwLookupButton onClick={() => setBuscar('cliente')} title="Buscar cliente" />
              </div>
            </GwField>
            <GwField label="Tienda de los pedidos">
              <GwInput value={cfg.tienda_terminal_codigo ?? ''} onChange={(e) => set({ tienda_terminal_codigo: e.target.value || null })} />
            </GwField>
            <GwField label="Almacén (pedidos y comparación de stock)">
              <GwInput value={cfg.almacen_codigo ?? ''} onChange={(e) => set({ almacen_codigo: e.target.value || null })} />
            </GwField>
            <GwField label="Artículo para los portes">
              <div className="flex gap-1">
                <GwInput value={cfg.articulo_portes_codigo ?? ''} onChange={(e) => set({ articulo_portes_codigo: e.target.value || null })} />
                <GwLookupButton onClick={() => setBuscar('portes')} title="Buscar artículo" />
              </div>
            </GwField>
            <GwField label="Artículo genérico para líneas sin artículo (opcional)">
              <div className="flex gap-1">
                <GwInput value={cfg.articulo_generico_codigo ?? ''} onChange={(e) => set({ articulo_generico_codigo: e.target.value || null })} />
                <GwLookupButton onClick={() => setBuscar('generico')} title="Buscar artículo" />
              </div>
            </GwField>
            <GwField label="Estados de la web que se pueden importar">
              <div className="flex flex-wrap gap-x-2">
                {ESTADOS_PEDIDO_WEB.slice(0, 4).map((s) => (
                  <label key={s.value} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={cfg.estados_importables.includes(s.value)}
                      onChange={(e) =>
                        set({
                          estados_importables: e.target.checked ? [...cfg.estados_importables, s.value] : cfg.estados_importables.filter((x) => x !== s.value),
                        })
                      }
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </GwField>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button type="button" className="gw-btn" onClick={guardar}>
            <Save size={14} /> Guardar configuración
          </button>
          {msg && <span className="font-bold">{msg}</span>}
          <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
            <DoorOpen size={14} /> Salir
          </button>
        </div>
      </GwGroup>

      {buscar === 'cliente' && (
        <GwLookupDialog<{ codigo: string; nombre: string }>
          title="Clientes"
          table="cliente"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="nombre"
          keyColumn="codigo"
          onClose={() => setBuscar(null)}
          onPick={(r) => {
            set({ cliente_generico_codigo: r.codigo })
            setBuscar(null)
          }}
        />
      )}
      {(buscar === 'portes' || buscar === 'generico') && (
        <GwLookupDialog<{ codigo_interno: string; descripcion: string }>
          title="Artículos"
          table="articulo"
          columns={[
            { key: 'codigo_interno', label: 'Código', width: 110 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo_interno', 'descripcion']}
          orderBy="descripcion"
          keyColumn="codigo_interno"
          onClose={() => setBuscar(null)}
          onPick={(r) => {
            set(buscar === 'portes' ? { articulo_portes_codigo: r.codigo_interno } : { articulo_generico_codigo: r.codigo_interno })
            setBuscar(null)
          }}
        />
      )}
    </div>
  )
}
