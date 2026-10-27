import { FolderOpen } from 'lucide-react'
import { GwCheck, GwDate, GwField, GwInput, GwRadio, GwSelect, GwTextArea } from '../../../components/gw'
import type { Articulo } from '../types'

interface TabProps {
  articulo: Articulo
  editing: boolean
  onChange: (patch: Partial<Articulo>) => void
}

const text = (v: string) => (v === '' ? null : v)

const MODOS_IMAGEN = [
  { value: 0, label: 'Tamaño real' },
  { value: 1, label: 'Tamaño ajustado' },
  { value: 2, label: 'Rellenar marco' },
]

const ENERGY = ['', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']

export function TabImagen({ articulo, editing, onChange }: TabProps) {
  const fit = articulo.imagen_modo === 0 ? 'object-none' : articulo.imagen_modo === 2 ? 'object-fill' : 'object-contain'
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-1">
        <div className="relative h-[230px] overflow-hidden border border-[var(--gw-border)] bg-[var(--gw-face)]" title="IMAGEN">
          {articulo.imagen_url ? (
            <img src={articulo.imagen_url} alt={articulo.descripcion} className={`h-full w-full ${fit}`} />
          ) : (
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              <line x1="0" y1="0" x2="100" y2="100" stroke="#8a8a8a" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
              <line x1="100" y1="0" x2="0" y2="100" stroke="#8a8a8a" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
        <div className="flex flex-col">
          <span className="gw-label">Ver Imagen a ...</span>
          <div className="flex flex-col gap-0.5 border border-[var(--gw-border-light)] p-1">
            {MODOS_IMAGEN.map((m) => (
              <GwRadio
                key={m.value}
                name="articulo-imagen-modo"
                label={m.label}
                checked={articulo.imagen_modo === m.value}
                disabled={!editing}
                onChange={() => onChange({ imagen_modo: m.value })}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex">
        <GwInput title="IMAGEN" value={articulo.imagen_url ?? ''} onChange={(e) => onChange({ imagen_url: text(e.target.value) })} disabled={!editing} />
        <button
          type="button"
          className="gw-btn flex-none px-1.5"
          title="Elegir imagen (dirección URL)"
          disabled={!editing}
          onClick={() => {
            const url = window.prompt('Dirección (URL) de la imagen:', articulo.imagen_url ?? '')
            if (url != null) onChange({ imagen_url: text(url.trim()) })
          }}
        >
          <FolderOpen size={14} className="text-[#b8860b]" />
        </button>
      </div>
    </div>
  )
}

export function TabWeb({ articulo, editing, onChange }: TabProps) {
  const dis = !editing
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[236px_minmax(0,1fr)] items-start gap-3">
        <fieldset className="gw-group">
          <legend>
            <GwCheck
              label="Artículo publicado en la Web"
              checked={articulo.web_publicado}
              onChange={(v) => onChange({ web_publicado: v })}
              disabled={dis}
            />
          </legend>
          <fieldset className="gw-group">
            <legend>Opciones de envío</legend>
            <div className="flex flex-col gap-0.5">
              <GwCheck label="No Enviar Imagen" checked={articulo.web_sin_imagen} onChange={(v) => onChange({ web_sin_imagen: v })} disabled={dis} />
              <GwCheck
                label="No Enviar Observaciones"
                checked={articulo.web_sin_observaciones}
                onChange={(v) => onChange({ web_sin_observaciones: v })}
                disabled={dis}
              />
              <GwCheck
                label="Enviar la Descripción Corta"
                checked={articulo.web_descripcion_corta_envio}
                onChange={(v) => onChange({ web_descripcion_corta_envio: v })}
                disabled={dis}
              />
              <GwCheck
                label="No Enviar Inform. de Ofertas"
                checked={articulo.web_sin_oferta}
                onChange={(v) => onChange({ web_sin_oferta: v })}
                disabled={dis}
              />
            </div>
          </fieldset>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="gw-label">Fecha de baja:</span>
            <GwDate title="WEB_F_BAJA" className="min-w-0 flex-1" value={articulo.web_fecha_baja} onChange={(v) => onChange({ web_fecha_baja: v })} disabled={dis} />
          </div>
        </fieldset>
        <div className="flex min-w-0 flex-col gap-1 pt-1">
          <GwField label="Descripción para la Web">
            <GwTextArea
              title="WEBDESCRIP"
              rows={3}
              value={articulo.web_descripcion ?? ''}
              onChange={(e) => onChange({ web_descripcion: text(e.target.value) })}
              disabled={dis}
            />
          </GwField>
          <div className="grid grid-cols-[64px_minmax(0,1fr)_70px_110px] items-end gap-1.5">
            <GwField label="WebId:">
              <GwInput
                title="WEBIDLINK"
                className="gw-num"
                value={articulo.web_id_link ?? 0}
                onChange={(e) => onChange({ web_id_link: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })}
                disabled={dis}
              />
            </GwField>
            <GwField label="Fabricante:">
              <GwInput title="WEBFABRICA" value={articulo.web_fabricante ?? ''} onChange={(e) => onChange({ web_fabricante: text(e.target.value) })} disabled={dis} />
            </GwField>
            <GwField label="Energy">
              <GwSelect
                title="ENERGY"
                value={articulo.etiqueta_energetica ?? ''}
                onChange={(e) => onChange({ etiqueta_energetica: text(e.target.value) })}
                disabled={dis}
              >
                {[...ENERGY, ...(articulo.etiqueta_energetica && !ENERGY.includes(articulo.etiqueta_energetica) ? [articulo.etiqueta_energetica] : [])].map(
                  (e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ),
                )}
              </GwSelect>
            </GwField>
            <button
              type="button"
              title="WEBDESTACA"
              disabled={dis}
              onClick={() => onChange({ web_destacado: !articulo.web_destacado })}
              className="gw-btn h-[34px] justify-start gap-1 px-1.5 text-left leading-tight disabled:!opacity-100 disabled:!text-[var(--gw-text)]"
            >
              <span className={`font-bold ${articulo.web_destacado ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>{articulo.web_destacado ? '✓' : '×'}</span>
              <span>
                Artículo
                <br />
                Destacado
              </span>
            </button>
          </div>
        </div>
      </div>
      <GwField label="Categoria">
        <GwTextArea title="WEBCATEGOR" rows={1} value={articulo.web_categoria ?? ''} onChange={(e) => onChange({ web_categoria: text(e.target.value) })} disabled={dis} />
      </GwField>
      <GwField label="Dirección Web (URL)">
        <GwTextArea title="WEBURL" rows={2} value={articulo.web_url ?? ''} onChange={(e) => onChange({ web_url: text(e.target.value) })} disabled={dis} />
      </GwField>
      <GwField label="Observaciones para la Web">
        <GwTextArea
          title="WEBOBSERV"
          rows={3}
          value={articulo.web_observaciones ?? ''}
          onChange={(e) => onChange({ web_observaciones: text(e.target.value) })}
          disabled={dis}
        />
      </GwField>
    </div>
  )
}
