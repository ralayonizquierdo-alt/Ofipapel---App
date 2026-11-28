// Gestor 2.0 → «Correo de proveedores» (Rober, 22/11/2026): lo que E-MILIO (el agente «correo-proveedores») ha cogido del buzón de
// compras (PDF de proveedores): propuestas, facturas y albaranes, con su proveedor y su pedido (del ERP o de GeminisWin).
// Aquí se revisa: ver el PDF, abrir el pedido y marcarlo como revisado o descartarlo. El agente solo prepara: no
// contesta a nadie ni cambia pedidos ni facturas. Ver la migración 20261122_correo_proveedores.sql.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  FileText,
  RefreshCw,
  RotateCcw,
  Tag,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";

type Tipo =
  | "propuesta"
  | "factura"
  | "albaran"
  | "tarifa"
  | "otro"
  | "sin_clasificar";
type Filtro =
  | "nuevos"
  | "diferencias"
  | "propuesta"
  | "factura"
  | "albaran"
  | "tarifa"
  | "otros"
  | "revisados"
  | "descartados";

interface LineaDif {
  n: number;
  articulo: string | null;
  referencia: string | null;
  descripcion: string;
  pedido: number;
  servido?: number;
  precio_pedido?: number;
  precio_documento?: number;
}
interface Comprobacion {
  faltan: LineaDif[];
  menos: LineaDif[];
  mas: LineaDif[];
  precio: LineaDif[];
  anadidos: {
    descripcion: string;
    cantidad: number | null;
    referencia: string | null;
  }[];
  lineas_pedido: number;
  lineas_documento: number;
}

interface Doc {
  id: number;
  recibido_en: string | null;
  remitente: string | null;
  remitente_nombre: string | null;
  asunto: string | null;
  adjunto_nombre: string;
  archivo: string | null;
  proveedor_codigo: string | null;
  proveedor_por: string | null;
  tipo: Tipo;
  documento_numero: string | null;
  documento_fecha: string | null;
  total: number | null;
  pedido_origen: "ERP" | "GW" | null;
  pedido_tienda: string | null;
  pedido_numero: number | null;
  pedido_por: string | null;
  lectura: { resumen?: string; proveedor_nombre?: string | null } | null;
  estado: "nuevo" | "revisado" | "descartado" | "error";
  error: string | null;
  comprobacion: Comprobacion | null;
  diferencias: number | null;
  nombre_ordenado: string | null;
  copiado_en: string | null;
  copia_ruta: string | null;
  proveedor: { nombre: string | null } | null;
}
interface Vigilancia {
  ultima_pasada: string | null;
  ultimo_error: string | null;
  documentos_total: number;
}

const TIPOS: Record<Tipo, { texto: string; color: string; fondo: string }> = {
  propuesta: { texto: "Propuesta", color: "#1d3a8a", fondo: "#e6ecfb" },
  factura: { texto: "Factura", color: "#1A5C1A", fondo: "#e3f3e3" },
  albaran: { texto: "Albarán", color: "#8a4b00", fondo: "#fdf0dc" },
  tarifa: { texto: "Tarifa", color: "#5b2a86", fondo: "#f0e7fa" },
  otro: { texto: "Otro", color: "#4b5563", fondo: "#eceef1" },
  sin_clasificar: {
    texto: "Sin clasificar",
    color: "#a3123f",
    fondo: "#fde6ee",
  },
};
const fechaHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-ES", {
        timeZone: "Atlantic/Canary",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const fecha = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "";
const eur = (n: number | null) =>
  n == null
    ? ""
    : n.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " €";

export function CorreoProveedores() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [vig, setVig] = useState<Vigilancia | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("nuevos");
  const [error, setError] = useState<string | null>(null);
  const [subir, setSubir] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    const [d, v] = await Promise.all([
      supabase
        .from("correo_proveedor_documento")
        .select(
          "id, recibido_en, remitente, remitente_nombre, asunto, adjunto_nombre, archivo, proveedor_codigo, proveedor_por, tipo, documento_numero, documento_fecha, total, pedido_origen, pedido_tienda, pedido_numero, pedido_por, lectura, estado, error, comprobacion, diferencias, nombre_ordenado, copiado_en, copia_ruta, proveedor:proveedor_codigo(nombre)",
        )
        .order("recibido_en", { ascending: false })
        .limit(500),
      supabase
        .from("correo_vigilancia")
        .select("ultima_pasada, ultimo_error, documentos_total")
        .order("ultima_pasada", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (d.error) return setError(d.error.message);
    setDocs(
      ((d.data ?? []) as unknown[]).map((x) => {
        const r = x as Doc & {
          proveedor:
            | { nombre: string | null }
            | { nombre: string | null }[]
            | null;
        };
        return {
          ...r,
          proveedor: Array.isArray(r.proveedor)
            ? (r.proveedor[0] ?? null)
            : r.proveedor,
        };
      }),
    );
    setVig((v.data ?? null) as Vigilancia | null);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cuenta = useMemo(() => {
    const c: Record<Filtro, number> = {
      nuevos: 0,
      diferencias: 0,
      propuesta: 0,
      factura: 0,
      albaran: 0,
      tarifa: 0,
      otros: 0,
      revisados: 0,
      descartados: 0,
    };
    for (const d of docs ?? []) {
      if (d.estado === "revisado") c.revisados++;
      else if (d.estado === "descartado") c.descartados++;
      else {
        c.nuevos++;
        if ((d.diferencias ?? 0) > 0) c.diferencias++;
        if (
          d.tipo === "propuesta" ||
          d.tipo === "factura" ||
          d.tipo === "albaran" ||
          d.tipo === "tarifa"
        )
          c[d.tipo]++;
        else c.otros++;
      }
    }
    return c;
  }, [docs]);

  const vista = useMemo(
    () =>
      (docs ?? []).filter((d) => {
        const abierto = d.estado === "nuevo" || d.estado === "error";
        if (filtro === "revisados") return d.estado === "revisado";
        if (filtro === "descartados") return d.estado === "descartado";
        if (!abierto) return false;
        if (filtro === "nuevos") return true;
        if (filtro === "diferencias") return (d.diferencias ?? 0) > 0;
        if (filtro === "otros")
          return d.tipo === "otro" || d.tipo === "sin_clasificar";
        return d.tipo === filtro;
      }),
    [docs, filtro],
  );

  async function verPdf(d: Doc) {
    if (!d.archivo) return;
    // Excel/CSV: se descarga con su nombre (el navegador no los abre).
    if (!/\.pdf$/i.test(d.archivo)) {
      const { data, error: e } = await supabase.storage
        .from("correo_proveedores")
        .createSignedUrl(d.archivo, 600, {
          download: d.nombre_ordenado ?? d.adjunto_nombre,
        });
      if (e || !data)
        return setError(e?.message ?? "No se ha podido descargar el fichero.");
      window.location.assign(data.signedUrl);
      return;
    }
    const { data, error: e } = await supabase.storage
      .from("correo_proveedores")
      .createSignedUrl(d.archivo, 600);
    if (e || !data)
      return setError(e?.message ?? "No se ha podido abrir el PDF.");
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function marcar(d: Doc, estado: "nuevo" | "revisado" | "descartado") {
    const { error: e } = await supabase.rpc("fn_correo_proveedor_marcar", {
      p_id: d.id,
      p_estado: estado,
    });
    if (e) return setError(e.message);
    setDocs((l) =>
      (l ?? []).map((x) => (x.id === d.id ? { ...x, estado } : x)),
    );
  }
  async function esTarifa(d: Doc) {
    const { error: e } = await supabase.rpc("fn_correo_proveedor_marcar", {
      p_id: d.id,
      p_estado: "nuevo",
      p_tipo: "tarifa",
    });
    if (e) return setError(e.message);
    await cargar();
  }
  const abrirPedido = (d: Doc) =>
    d.pedido_numero != null &&
    navigate(
      `/${d.pedido_origen === "GW" ? "pedidos-geminiswin" : "pedidos-proveedor"}/${encodeURIComponent(d.pedido_tienda ?? "")}/${d.pedido_numero}`,
    );

  const sinClaves = !vig || (vig.ultimo_error ?? "").startsWith("Sin claves");
  const boton = (k: Filtro, texto: string) => (
    <button
      key={k}
      type="button"
      onClick={() => setFiltro(k)}
      aria-pressed={filtro === k}
      className={`h-8 rounded-full px-3 text-[13px] font-semibold ${filtro === k ? "bg-[#1b2540] text-white" : "border border-[#d5dcec] bg-white text-[#1b2540] hover:bg-[#f1f5fd]"}`}
    >
      {texto} · {cuenta[k]}
    </button>
  );

  return (
    <section className="flex flex-col gap-3">
      {sinClaves ? (
        <p className="rounded-xl border border-[#f1d58a] bg-[#fff8e1] px-4 py-2 text-[14px] text-[#6b4a00]">
          <b>E-milio está esperando la conexión de Microsoft.</b> Vigilará el
          buzón de compras cada 10 minutos (solo lee: no borra, no mueve ni
          contesta) en cuanto estén puestas las claves de la app de solo lectura
          (secretos AZURE_LECTURA_CLIENT_ID y AZURE_LECTURA_CLIENT_SECRET).
        </p>
      ) : (
        <p
          className={`rounded-xl border px-4 py-2 text-[14px] ${vig?.ultimo_error ? "border-[#f3b4ad] bg-[#fdeceb] text-[#8a1c12]" : "border-[#cfe8cf] bg-[#f0f9f0] text-[#185a18]"}`}
        >
          {vig?.ultimo_error ? (
            <>
              <b>La última pasada dio un error:</b> {vig.ultimo_error}
            </>
          ) : (
            <>
              <b>E-milio está vigilando el buzón de compras.</b> Última pasada:{" "}
              {fechaHora(vig?.ultima_pasada ?? null)} ·{" "}
              {vig?.documentos_total ?? 0} documentos cogidos en total.
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {boton("nuevos", "Por revisar")}
        {boton("diferencias", "Con diferencias")}
        {boton("propuesta", "Propuestas")}
        {boton("factura", "Facturas")}
        {boton("albaran", "Albaranes")}
        {boton("tarifa", "Tarifas")}
        {boton("otros", "Otros / sin clasificar")}
        {boton("revisados", "Revisados")}
        {boton("descartados", "Descartados")}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setSubir(true)}
          className="flex h-8 items-center gap-1 rounded-full bg-[#5b2a86] px-3 text-[13px] font-semibold text-white hover:bg-[#4a2270]"
          title="Para las tarifas que no llegan por correo (descargadas de la web del proveedor…)"
        >
          <Upload size={14} /> Subir tarifa
        </button>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-8 items-center gap-1 rounded-full border border-[#d5dcec] bg-white px-3 text-[13px] font-semibold hover:bg-[#f1f5fd]"
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {error && <p className="font-bold text-[#c42b1c]">{error}</p>}
      {subir && (
        <SubirTarifa
          onClose={() => setSubir(false)}
          onSubida={() => {
            setSubir(false);
            setFiltro("tarifa");
            void cargar();
          }}
        />
      )}
      {docs === null && !error && (
        <p className="text-[15px] text-[#5b6680]">Cargando…</p>
      )}

      {docs !== null && (
        <div className="flex flex-col gap-2">
          {vista.map((d) => {
            const t = TIPOS[d.tipo] ?? TIPOS.sin_clasificar;
            const nombre =
              d.proveedor?.nombre ??
              d.lectura?.proveedor_nombre ??
              d.remitente_nombre ??
              d.remitente ??
              "";
            return (
              <article
                key={d.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#e1e7f3] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(20,40,90,0.08)]"
              >
                <div className="flex min-w-[260px] flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[12px] font-bold"
                      style={{ color: t.color, background: t.fondo }}
                    >
                      {t.texto}
                    </span>
                    <b className="text-[15px]">{nombre}</b>
                    {d.proveedor_codigo ? (
                      <span className="text-[12px] text-[#7a849c]">
                        {d.proveedor_codigo}
                      </span>
                    ) : (
                      <span className="text-[12px] font-semibold text-[#a3123f]">
                        proveedor sin reconocer
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-[#3b4660]">
                    {d.lectura?.resumen ?? d.asunto}
                  </div>
                  <div className="text-[12px] text-[#7a849c]">
                    Recibido {fechaHora(d.recibido_en)} · {d.remitente} ·{" "}
                    {d.adjunto_nombre}
                  </div>
                  {d.error && (
                    <div className="text-[12px] font-semibold text-[#c42b1c]">
                      {d.error}
                    </div>
                  )}
                  {d.comprobacion && (
                    <DetalleComprobacion
                      c={d.comprobacion}
                      diferencias={d.diferencias ?? 0}
                      tipo={d.tipo}
                    />
                  )}
                  {d.tipo === "tarifa" && d.nombre_ordenado && (
                    <div className="text-[12px] text-[#7a849c]">
                      Carpetas de tarifas:{" "}
                      {d.copiado_en ? (
                        <b
                          className="text-[#185a18]"
                          title={d.copia_ruta ?? ""}
                        >
                          copiada como «{d.nombre_ordenado}» (
                          {fechaHora(d.copiado_en)})
                        </b>
                      ) : (
                        <>
                          pendiente de copiar como «{d.nombre_ordenado}» (lo
                          hace el programa del PC)
                        </>
                      )}
                    </div>
                  )}
                  {d.tipo === "factura" && d.nombre_ordenado && (
                    <div className="text-[12px] text-[#7a849c]">
                      Carpeta de facturas:{" "}
                      {d.copiado_en ? (
                        <b className="text-[#185a18]">
                          copiada como «{d.nombre_ordenado}»
                        </b>
                      ) : (
                        <>pendiente de copiar como «{d.nombre_ordenado}»</>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex min-w-[150px] flex-col text-[13px]">
                  <span>
                    Doc. <b>{d.documento_numero ?? "—"}</b>{" "}
                    {d.documento_fecha && `· ${fecha(d.documento_fecha)}`}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {eur(d.total)}
                  </span>
                </div>
                <div className="flex min-w-[170px] flex-col text-[13px]">
                  {d.pedido_numero != null ? (
                    <>
                      <button
                        type="button"
                        onClick={() => abrirPedido(d)}
                        className="text-left font-bold text-[#1d3a8a] underline"
                      >
                        Pedido {d.pedido_tienda}-{d.pedido_numero}{" "}
                        {d.pedido_origen === "GW" ? "(GeminisWin)" : "(ERP)"}
                      </button>
                      <span className="text-[12px] text-[#7a849c]">
                        {d.pedido_por}
                      </span>
                    </>
                  ) : (
                    <span className="text-[#7a849c]">
                      Sin pedido emparejado
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={!d.archivo}
                    onClick={() => void verPdf(d)}
                    className="flex h-8 items-center gap-1 rounded-full border border-[#d5dcec] px-3 text-[13px] font-semibold hover:bg-[#f1f5fd] disabled:opacity-40"
                  >
                    <FileText size={14} />{" "}
                    {d.archivo && !/\.pdf$/i.test(d.archivo)
                      ? "Fichero"
                      : "PDF"}
                  </button>
                  {(d.tipo === "otro" || d.tipo === "sin_clasificar") &&
                    d.estado !== "descartado" && (
                      <button
                        type="button"
                        onClick={() => void esTarifa(d)}
                        className="flex h-8 items-center gap-1 rounded-full border border-[#d5dcec] px-3 text-[13px] font-semibold text-[#5b2a86] hover:bg-[#f0e7fa]"
                        title="Marcarlo como tarifa de precios: se guarda con su nombre ordenado y se copia a las carpetas de tarifas"
                      >
                        <Tag size={14} /> Es tarifa
                      </button>
                    )}
                  {d.estado === "nuevo" || d.estado === "error" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void marcar(d, "revisado")}
                        className="flex h-8 items-center gap-1 rounded-full bg-[#1d3a8a] px-3 text-[13px] font-semibold text-white hover:bg-[#16306f]"
                      >
                        <Check size={14} /> Revisado
                      </button>
                      <button
                        type="button"
                        onClick={() => void marcar(d, "descartado")}
                        className="flex h-8 items-center gap-1 rounded-full border border-[#d5dcec] px-3 text-[13px] font-semibold hover:bg-[#f1f5fd]"
                        title="No es de un proveedor o no interesa"
                      >
                        <X size={14} /> Descartar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void marcar(d, "nuevo")}
                      className="flex h-8 items-center gap-1 rounded-full border border-[#d5dcec] px-3 text-[13px] font-semibold hover:bg-[#f1f5fd]"
                    >
                      <RotateCcw size={14} /> Volver a «por revisar»
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!vista.length && (
            <p className="rounded-2xl border border-dashed border-[#c9d3e8] bg-white p-8 text-center text-[15px] text-[#5b6680]">
              {sinClaves
                ? "Todavía no ha llegado nada: E-milio empezará en cuanto tenga la conexión de Microsoft."
                : "No hay documentos con este filtro."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** La última comprobación de la factura o albarán contra su pedido: lo que falta, cambia o sobra. */
function DetalleComprobacion({
  c,
  diferencias,
  tipo,
}: {
  c: Comprobacion;
  diferencias: number;
  tipo: string;
}) {
  const doc =
    tipo === "albaran"
      ? "el albarán"
      : tipo === "propuesta"
        ? "la propuesta"
        : "la factura";
  if (!diferencias)
    return (
      <div className="mt-1 text-[13px] font-semibold text-[#185a18]">
        ✓ Cuadra con el pedido: las {c.lineas_pedido} líneas vienen completas en{" "}
        {doc}.
      </div>
    );
  const art = (l: LineaDif) =>
    `${l.descripcion}${l.referencia ? ` (ref. ${l.referencia})` : ""}`;
  const pr = (v: number | undefined) =>
    (v ?? 0).toLocaleString("de-DE", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
  const n = (v: number | undefined) =>
    (v ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
  return (
    <details
      className="mt-1 rounded-lg border border-[#f3b4ad] bg-[#fdeceb] px-3 py-1.5 text-[13px] text-[#8a1c12]"
      open={diferencias <= 4}
    >
      <summary className="cursor-pointer font-bold">
        ⚠ {diferencias} {diferencias === 1 ? "diferencia" : "diferencias"} con
        el pedido
        {c.faltan.length ? ` · faltan ${c.faltan.length}` : ""}
        {c.menos.length ? ` · ${c.menos.length} con menos cantidad` : ""}
        {c.precio.length ? ` · ${c.precio.length} de precio` : ""}
      </summary>
      <ul className="mt-1 list-disc pl-5">
        {c.faltan.map((l) => (
          <li key={`f${l.n}`}>
            <b>Falta:</b> {art(l)}, pedidas {n(l.pedido)}
          </li>
        ))}
        {c.menos.map((l) => (
          <li key={`m${l.n}`}>
            <b>Menos:</b> {art(l)}, pedidas {n(l.pedido)} y vienen{" "}
            {n(l.servido)}
          </li>
        ))}
        {c.mas.map((l) => (
          <li key={`x${l.n}`}>
            <b>Más:</b> {art(l)}, pedidas {n(l.pedido)} y vienen {n(l.servido)}
          </li>
        ))}
        {c.precio.map((l) => (
          <li key={`p${l.n}`}>
            <b>Precio:</b> {art(l)}, en el pedido {pr(l.precio_pedido)} € y en{" "}
            {doc} {pr(l.precio_documento)} €
          </li>
        ))}
        {c.anadidos.map((l, i) => (
          <li key={`a${i}`}>
            <b>No estaba en el pedido:</b> {l.descripcion}
            {l.cantidad != null ? `, ${n(l.cantidad)} uds.` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** «Subir tarifa» (28/11/2026): las tarifas que no llegan por correo. Queda igual que las de E-milio: en el ERP, con su
 *  nombre ordenado, y el programa del PC la copia a la carpeta de tarifas de Rober y a la de red. */
function SubirTarifa({
  onClose,
  onSubida,
}: {
  onClose: () => void;
  onSubida: () => void;
}) {
  const [proveedores, setProveedores] = useState<
    { codigo: string; nombre: string }[]
  >([]);
  const [texto, setTexto] = useState("");
  const [fichero, setFichero] = useState<File | null>(null);
  const [fechaTarifa, setFechaTarifa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from("proveedor")
      .select("codigo, nombre")
      .order("nombre")
      .limit(2000)
      .then(({ data }) =>
        setProveedores(
          ((data ?? []) as { codigo: string; nombre: string | null }[]).map(
            (p) => ({ codigo: p.codigo, nombre: p.nombre ?? "" }),
          ),
        ),
      );
  }, []);

  // «00123 · NOMBRE» de la lista, o el código tal cual.
  const proveedor = useMemo(() => {
    const t = texto.trim();
    if (!t) return null;
    const cod = t.split(" · ")[0].trim();
    return (
      proveedores.find((p) => p.codigo === cod) ??
      proveedores.find((p) => p.nombre.toLowerCase() === t.toLowerCase()) ??
      null
    );
  }, [texto, proveedores]);

  async function enviar() {
    setError(null);
    if (!proveedor) return setError("Elige el proveedor de la lista.");
    if (!fichero) return setError("Elige el fichero de la tarifa.");
    if (!/\.(pdf|xlsx|xlsm|xls|csv|ods)$/i.test(fichero.name))
      return setError("La tarifa tiene que ser PDF, Excel, CSV u ODS.");
    if (fichero.size > 15 * 1024 * 1024)
      return setError("El fichero pesa más de 15 MB.");
    setEnviando(true);
    const ext = (
      fichero.name.match(/\.([A-Za-z0-9]{2,5})$/)?.[1] ?? "bin"
    ).toLowerCase();
    const ruta = `tarifas/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const sube = await supabase.storage
      .from("correo_proveedores")
      .upload(ruta, fichero, {
        contentType: fichero.type || "application/octet-stream",
      });
    if (sube.error) {
      setEnviando(false);
      return setError(
        `No se ha podido subir el fichero: ${sube.error.message}`,
      );
    }
    const { error: e } = await supabase.rpc("fn_correo_tarifa_subir", {
      p_archivo: ruta,
      p_nombre: fichero.name,
      p_proveedor: proveedor.codigo,
      p_fecha: fechaTarifa || null,
      p_tamano: fichero.size,
    });
    setEnviando(false);
    if (e) return setError(e.message);
    onSubida();
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center bg-black/25 pt-24"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-label="Subir tarifa"
        className="flex w-[520px] max-w-[95vw] flex-col gap-3 rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-[17px] font-bold">Subir tarifa de proveedor</h2>
        <p className="text-[13px] text-[#5b6680]">
          Para las tarifas que no llegan por correo. Se guarda en el ERP y se
          copia a las carpetas de tarifas como las que coge E-milio.
        </p>
        <label className="flex flex-col gap-1 text-[14px] font-semibold">
          Proveedor
          <input
            list="tarifa-proveedores"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe el nombre o el código"
            className="h-9 rounded-lg border border-[#d5dcec] px-2 font-normal"
            autoFocus
          />
          <datalist id="tarifa-proveedores">
            {proveedores.map((p) => (
              <option key={p.codigo} value={`${p.codigo} · ${p.nombre}`} />
            ))}
          </datalist>
          {texto && !proveedor && (
            <span className="text-[12px] font-normal text-[#a3123f]">
              Elige uno de la lista.
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-[14px] font-semibold">
          Fichero (PDF, Excel o CSV)
          <input
            type="file"
            accept=".pdf,.xlsx,.xlsm,.xls,.csv,.ods"
            onChange={(e) => setFichero(e.target.files?.[0] ?? null)}
            className="font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-[14px] font-semibold">
          Fecha de la tarifa (si no, hoy)
          <input
            type="date"
            value={fechaTarifa}
            onChange={(e) => setFechaTarifa(e.target.value)}
            className="h-9 w-[180px] rounded-lg border border-[#d5dcec] px-2 font-normal"
          />
        </label>
        {error && (
          <p className="text-[13px] font-bold text-[#c42b1c]">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-full border border-[#d5dcec] px-4 text-[14px] font-semibold hover:bg-[#f1f5fd]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => void enviar()}
            className="flex h-9 items-center gap-1 rounded-full bg-[#5b2a86] px-4 text-[14px] font-semibold text-white hover:bg-[#4a2270] disabled:opacity-50"
          >
            <Upload size={15} /> {enviando ? "Subiendo…" : "Subir"}
          </button>
        </div>
      </div>
    </div>
  );
}
