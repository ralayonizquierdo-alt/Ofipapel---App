import { FormField, TextInput, TextArea } from '../../../components/FormField'
import { Toggle } from '../../../components/Toggle'
import type { Articulo } from '../types'

export function TabImagenWeb({
  articulo,
  editing,
  onChange,
}: {
  articulo: Articulo
  editing: boolean
  onChange: (patch: Partial<Articulo>) => void
}) {
  const text = (v: string) => (v === '' ? null : v)

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Imagen</h3>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex-1">
            <FormField label="Imagen (URL)" hint="IMAGEN">
              <TextInput value={articulo.imagen_url ?? ''} onChange={(e) => onChange({ imagen_url: text(e.target.value) })} disabled={!editing} />
            </FormField>
          </div>
          <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {articulo.imagen_url ? (
              <img src={articulo.imagen_url} alt={articulo.descripcion} className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-slate-400">Sin imagen</span>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Web</h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Toggle label="Publicado en la web (WEBPUBLIC)" checked={articulo.web_publicado} onChange={(v) => onChange({ web_publicado: v })} disabled={!editing} />
          <Toggle label="Destacado (WEBDESTACA)" checked={articulo.web_destacado} onChange={(v) => onChange({ web_destacado: v })} disabled={!editing} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Fecha de baja en la web" hint="WEB_F_BAJA">
            <TextInput type="date" value={articulo.web_fecha_baja ?? ''} onChange={(e) => onChange({ web_fecha_baja: text(e.target.value) })} disabled={!editing} />
          </FormField>
          <FormField label="Id web" hint="WEBIDLINK">
            <TextInput
              type="number"
              value={articulo.web_id_link ?? ''}
              onChange={(e) => onChange({ web_id_link: e.target.value === '' ? null : Number(e.target.value) })}
              disabled={!editing}
            />
          </FormField>
          <FormField label="Etiqueta energética" hint="ENERGY">
            <TextInput value={articulo.etiqueta_energetica ?? ''} onChange={(e) => onChange({ etiqueta_energetica: text(e.target.value) })} disabled={!editing} />
          </FormField>
          <FormField label="Fabricante" hint="WEBFABRICA">
            <TextInput value={articulo.web_fabricante ?? ''} onChange={(e) => onChange({ web_fabricante: text(e.target.value) })} disabled={!editing} />
          </FormField>
          <FormField label="Categoría" hint="WEBCATEGOR">
            <TextInput value={articulo.web_categoria ?? ''} onChange={(e) => onChange({ web_categoria: text(e.target.value) })} disabled={!editing} />
          </FormField>
          <FormField label="URL" hint="WEBURL">
            <TextInput value={articulo.web_url ?? ''} onChange={(e) => onChange({ web_url: text(e.target.value) })} disabled={!editing} />
          </FormField>
        </div>
        <FormField label="Descripción web" hint="WEBDESCRIP">
          <TextArea rows={4} value={articulo.web_descripcion ?? ''} onChange={(e) => onChange({ web_descripcion: text(e.target.value) })} disabled={!editing} />
        </FormField>
        <FormField label="Observaciones web" hint="WEBOBSERV">
          <TextArea rows={3} value={articulo.web_observaciones ?? ''} onChange={(e) => onChange({ web_observaciones: text(e.target.value) })} disabled={!editing} />
        </FormField>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Opciones de envío a la web</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Toggle label="No enviar la imagen (WEBNOIMG)" checked={articulo.web_sin_imagen} onChange={(v) => onChange({ web_sin_imagen: v })} disabled={!editing} />
          <Toggle label="No enviar las observaciones (WEBNOOBS)" checked={articulo.web_sin_observaciones} onChange={(v) => onChange({ web_sin_observaciones: v })} disabled={!editing} />
          <Toggle label="No enviar las ofertas (WEBNOOFERT)" checked={articulo.web_sin_oferta} onChange={(v) => onChange({ web_sin_oferta: v })} disabled={!editing} />
          <Toggle
            label="Enviar la descripción corta (WEBDRCORTA)"
            checked={articulo.web_descripcion_corta_envio}
            onChange={(v) => onChange({ web_descripcion_corta_envio: v })}
            disabled={!editing}
          />
        </div>
      </section>
    </div>
  )
}
