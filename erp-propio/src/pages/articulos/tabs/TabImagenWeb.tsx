import { GwCheck, GwField, GwGroup, GwInput, GwTextArea } from '../../../components/gw'
import type { Articulo } from '../types'

interface TabProps {
  articulo: Articulo
  editing: boolean
  onChange: (patch: Partial<Articulo>) => void
}

const text = (v: string) => (v === '' ? null : v)

export function TabImagen({ articulo, editing, onChange }: TabProps) {
  return (
    <div className="flex flex-col gap-2">
      <GwField label="Imagen">
        <GwInput
          title="IMAGEN"
          value={articulo.imagen_url ?? ''}
          onChange={(e) => onChange({ imagen_url: text(e.target.value) })}
          disabled={!editing}
        />
      </GwField>
      <div className="flex h-[340px] items-center justify-center border border-[var(--gw-border)] bg-white">
        {articulo.imagen_url ? (
          <img src={articulo.imagen_url} alt={articulo.descripcion} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[#6d6d6d]">Sin imagen</span>
        )}
      </div>
    </div>
  )
}

export function TabWeb({ articulo, editing, onChange }: TabProps) {
  const dis = !editing
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-6">
          <GwCheck label="Publicado en la Web" checked={articulo.web_publicado} onChange={(v) => onChange({ web_publicado: v })} disabled={dis} />
          <GwCheck label="Destacado" checked={articulo.web_destacado} onChange={(v) => onChange({ web_destacado: v })} disabled={dis} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <GwField label="Id Web">
            <GwInput
              title="WEBIDLINK"
              className="text-right"
              value={articulo.web_id_link ?? ''}
              onChange={(e) => onChange({ web_id_link: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })}
              disabled={dis}
            />
          </GwField>
          <GwField label="F. Baja Web">
            <GwInput
              type="date"
              title="WEB_F_BAJA"
              value={articulo.web_fecha_baja ?? ''}
              onChange={(e) => onChange({ web_fecha_baja: text(e.target.value) })}
              disabled={dis}
            />
          </GwField>
          <GwField label="Etiqueta Energética">
            <GwInput
              title="ENERGY"
              value={articulo.etiqueta_energetica ?? ''}
              onChange={(e) => onChange({ etiqueta_energetica: text(e.target.value) })}
              disabled={dis}
            />
          </GwField>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GwField label="Fabricante">
            <GwInput title="WEBFABRICA" value={articulo.web_fabricante ?? ''} onChange={(e) => onChange({ web_fabricante: text(e.target.value) })} disabled={dis} />
          </GwField>
          <GwField label="Categoría">
            <GwInput title="WEBCATEGOR" value={articulo.web_categoria ?? ''} onChange={(e) => onChange({ web_categoria: text(e.target.value) })} disabled={dis} />
          </GwField>
        </div>
        <GwField label="URL">
          <GwInput title="WEBURL" value={articulo.web_url ?? ''} onChange={(e) => onChange({ web_url: text(e.target.value) })} disabled={dis} />
        </GwField>
        <GwField label="Descripción Web">
          <GwTextArea
            title="WEBDESCRIP"
            rows={5}
            value={articulo.web_descripcion ?? ''}
            onChange={(e) => onChange({ web_descripcion: text(e.target.value) })}
            disabled={dis}
          />
        </GwField>
        <GwField label="Observaciones Web">
          <GwTextArea
            title="WEBOBSERV"
            rows={3}
            value={articulo.web_observaciones ?? ''}
            onChange={(e) => onChange({ web_observaciones: text(e.target.value) })}
            disabled={dis}
          />
        </GwField>
      </div>
      <GwGroup title="Opciones de envío" className="self-start">
        <div className="flex flex-col gap-1">
          <GwCheck label="No enviar la imagen" checked={articulo.web_sin_imagen} onChange={(v) => onChange({ web_sin_imagen: v })} disabled={dis} />
          <GwCheck
            label="No enviar las observaciones"
            checked={articulo.web_sin_observaciones}
            onChange={(v) => onChange({ web_sin_observaciones: v })}
            disabled={dis}
          />
          <GwCheck label="No enviar las ofertas" checked={articulo.web_sin_oferta} onChange={(v) => onChange({ web_sin_oferta: v })} disabled={dis} />
          <GwCheck
            label="Enviar la descripción corta"
            checked={articulo.web_descripcion_corta_envio}
            onChange={(v) => onChange({ web_descripcion_corta_envio: v })}
            disabled={dis}
          />
        </div>
      </GwGroup>
    </div>
  )
}
