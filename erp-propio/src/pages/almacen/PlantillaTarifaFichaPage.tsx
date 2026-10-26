import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwField, GwGroup, GwInput, GwNumber, GwSelect } from '../../components/gw'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { useFichaMaestro } from './useFichaMaestro'
import { BarraCompacta, PieEstado } from './piezas'

interface PlantillaTarifa {
  codigo: string
  descripcion: string
  descuento_maximo_cliente_pct: number | null
}

interface Nivel {
  nivel_tarifa: number
  modo_calculo: string
  permite_descuento_linea: boolean
  incremento_pct: number | null
}

const VACIA: PlantillaTarifa = { codigo: '', descripcion: '', descuento_maximo_cliente_pct: null }

const NOMBRES = ['General:', 'MAYOR  M-1:', 'MAYOR  M-2:', 'MAYOR  M-3:', 'Tarifa Dcto -4:', 'Tarifa Dcto -5:', 'Tarifa Dcto -6:']

const nivelesVacios = (): Nivel[] =>
  NOMBRES.map((_, i) => ({ nivel_tarifa: i, modo_calculo: i >= 4 ? 'D' : 'P', permite_descuento_linea: true, incremento_pct: null }))

/** Siguiente código numérico de 3 dígitos, como «075 MEDIA» o «125». */
function siguienteCodigo(codigos: string[]) {
  const max = codigos.reduce((m, c) => (/^\d+$/.test(c) ? Math.max(m, Number(c)) : m), 0)
  return String(max + 1).padStart(3, '0')
}

export function PlantillaTarifaFichaPage() {
  const f = useFichaMaestro<PlantillaTarifa>({ tabla: 'plantilla_tarifa', base: '/plantillas-tarifas', vacio: VACIA, campoNombre: 'descripcion' })
  const { draft, patch, editing, mode } = f
  const [niveles, setNiveles] = useState<Nivel[]>(nivelesVacios)
  const [nivelesGuardados, setNivelesGuardados] = useState<Nivel[]>(nivelesVacios)
  const [buscar, setBuscar] = useState(false)

  useEffect(() => {
    if (mode === 'alta') {
      setNiveles(nivelesVacios())
      setNivelesGuardados(nivelesVacios())
      return
    }
    if (!f.registro.codigo) return
    supabase
      .from('plantilla_tarifa_nivel')
      .select('nivel_tarifa, modo_calculo, permite_descuento_linea, incremento_pct')
      .eq('plantilla_tarifa_codigo', f.registro.codigo)
      .then(({ data }) => {
        const base = nivelesVacios()
        for (const r of (data ?? []) as Nivel[]) {
          if (base[r.nivel_tarifa]) base[r.nivel_tarifa] = { ...r, incremento_pct: r.incremento_pct == null ? null : Number(r.incremento_pct) }
        }
        setNiveles(base)
        setNivelesGuardados(base)
      })
  }, [f.registro.codigo, mode])

  useEffect(() => {
    if (mode === 'alta' && f.listaCargada && !draft.codigo) patch({ codigo: siguienteCodigo(f.lista.map((l) => l.codigo)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, f.listaCargada, draft.codigo])

  const setNivel = (n: number, p: Partial<Nivel>) => setNiveles((ns) => ns.map((x) => (x.nivel_tarifa === n ? { ...x, ...p } : x)))

  async function aceptar() {
    await f.guardar(
      () => (!draft.codigo.trim() || !draft.descripcion.trim() ? 'El código y la descripción son obligatorios.' : null),
      async (cod) => {
        const filas = niveles.map((n) => ({ ...n, plantilla_tarifa_codigo: cod }))
        const { error } = await supabase.from('plantilla_tarifa_nivel').upsert(filas, { onConflict: 'plantilla_tarifa_codigo,nivel_tarifa' })
        if (error) return `Plantilla guardada, pero sus tarifas no: ${error.message}`
        setNivelesGuardados(niveles)
        return null
      },
    )
  }

  async function enUso() {
    const cod = f.registro.codigo
    const [fam, art, prov] = await Promise.all([
      supabase.from('familia').select('codigo', { count: 'exact', head: true }).eq('plantilla_tarifa_codigo', cod),
      supabase.from('articulo').select('codigo_interno', { count: 'exact', head: true }).eq('plantilla_tarifa_codigo', cod),
      supabase.from('proveedor').select('codigo', { count: 'exact', head: true }).eq('plantilla_tarifa_codigo', cod),
    ])
    const usos = [
      fam.count ? `${fam.count} familia(s)` : '',
      art.count ? `${art.count} artículo(s)` : '',
      prov.count ? `${prov.count} proveedor(es)` : '',
    ].filter(Boolean)
    return usos.length ? `No se puede eliminar la plantilla ${cod}: la usan ${usos.join(', ')}.` : null
  }

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing

  return (
    <div className="flex max-w-[1000px] flex-col gap-1">
      <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-x-2.5">
        <GwField label="Código">
          <GwInput value={draft.codigo} disabled={mode !== 'alta'} title="CODTAR" maxLength={10} onChange={(e) => patch({ codigo: e.target.value })} />
        </GwField>
        <GwField label="Descripción">
          <GwInput value={draft.descripcion} disabled={ro} title="DESCRIPTAR" maxLength={30} onChange={(e) => patch({ descripcion: e.target.value })} />
        </GwField>
      </div>
      {f.sinRegistros ? (
        <div className="p-3 text-[13px]">No hay ninguna plantilla de tarifas. Pulsa Agregar para dar de alta la primera.</div>
      ) : (
        <div className="flex min-h-[280px] pl-[180px] pt-2">
          <div className="flex w-[500px] flex-col">
            <GwGroup title="Tarifas">
              <div className="grid grid-cols-[150px_86px_86px_minmax(0,1fr)] items-center gap-x-1 gap-y-[5px]">
                {niveles.map((n) => (
                  <div key={n.nivel_tarifa} className="contents">
                    <span className="gw-label" title={`PLANTTAR nivel ${n.nivel_tarifa}`}>
                      {NOMBRES[n.nivel_tarifa]}
                    </span>
                    <GwSelect
                      value={n.modo_calculo}
                      disabled={ro}
                      title={`POD${n.nivel_tarifa === 0 ? '_PVP' : n.nivel_tarifa}: P = % sobre coste, D = % de descuento sobre la General`}
                      onChange={(e) => setNivel(n.nivel_tarifa, { modo_calculo: e.target.value })}
                    >
                      <option value="P">P</option>
                      <option value="D">D</option>
                    </GwSelect>
                    <GwSelect
                      value={n.permite_descuento_linea ? 'S' : 'N'}
                      disabled={ro}
                      title={`VERDTO_${n.nivel_tarifa}`}
                      onChange={(e) => setNivel(n.nivel_tarifa, { permite_descuento_linea: e.target.value === 'S' })}
                    >
                      <option value="N">N</option>
                      <option value="S">S</option>
                    </GwSelect>
                    <GwNumber value={n.incremento_pct} decimals={2} disabled={ro} onChange={(v) => setNivel(n.nivel_tarifa, { incremento_pct: v })} />
                  </div>
                ))}
              </div>
            </GwGroup>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center border-x border-b border-[var(--gw-border-light)] px-1.5 py-1.5">
              <span className="gw-label text-center">Dto. Máximo del artículo:</span>
              <span title="DTOMAXCLI">
                <GwNumber
                  value={draft.descuento_maximo_cliente_pct}
                  decimals={2}
                  disabled={ro}
                  onChange={(v) => patch({ descuento_maximo_cliente_pct: v })}
                />
              </span>
            </div>
          </div>
        </div>
      )}
      {f.error && <div className="text-[13px] text-[#c42b1c]">{f.error}</div>}

      <BarraCompacta
        mode={mode}
        canNavigate={f.canNavigate}
        saving={f.saving}
        onFirst={() => f.goTo(f.ordenada[0]?.codigo)}
        onPrev={() => f.goTo(f.ordenada[f.idx - 1]?.codigo)}
        onNext={() => f.goTo(f.ordenada[f.idx + 1]?.codigo)}
        onLast={() => f.goTo(f.ordenada[f.ordenada.length - 1]?.codigo)}
        onSort={() => f.setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={() => f.navigate('/plantillas-tarifas/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={() =>
          f.eliminar(`la plantilla de tarifas ${f.registro.codigo} ${f.registro.descripcion}`, enUso, async () => {
            const { error } = await supabase.from('plantilla_tarifa_nivel').delete().eq('plantilla_tarifa_codigo', f.registro.codigo)
            return error ? error.message : null
          })
        }
        onSave={aceptar}
        onCancel={() => {
          setNiveles(nivelesGuardados)
          f.cancelar()
        }}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.ordenada.length} mode={mode} que="plantilla de tarifas" />

      {buscar && (
        <GwLookupDialog<{ codigo: string; descripcion: string }>
          title="Buscar Plantilla de Tarifas"
          table="plantilla_tarifa"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy={f.orden === 'codigo' ? 'codigo' : 'descripcion'}
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(false)
            f.goTo(r.codigo)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
    </div>
  )
}
