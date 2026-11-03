import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import {
  delDia,
  FRASES_ENTRADA,
  FRASES_SALIDA,
  horaCan,
  TIPOS_FICHAJE,
  type EstadoFichaje,
  type TipoFichaje,
} from "../lib/fichaje";

// Pantalla de fichar (/fichaje): pública, sin cuenta del ERP (Rober, 03/11/2026). Sustituye a fichaje.html.
// Mismo aspecto que Fichaje: verdes de Ofipapel, tréboles de fondo, tarjetas blancas con borde lima.
// Flujo: elige tu nombre (por grupo) → PIN → botones según el estado (entrada / pausa / fin de pausa / salida).
// La hora la pone el servidor. La ubicación se manda si el móvil la da; nunca bloquea.
// Repartidores: con la jornada abierta sale «🚚 Mi reparto», que abre la app de reparto ya identificada.
// Personas y PIN: Archivo → Fichaje → Personas. Datos: fn_fichaje_personas / fn_fichaje_entrar / fn_fichaje_fichar.

const V = {
  verde: "#1A5C1A",
  verdeMed: "#237523",
  lima: "#8DC41E",
  naranja: "#F5A623",
  rojo: "#C62828",
  gris: "#5f6b5f",
  texto: "#1b2a1b",
};
const base = import.meta.env.BASE_URL;

interface Grupo {
  grupo: string;
  personas: {
    codigo: string;
    nombre: string;
    corto: string;
    dep: string;
    dep_orden: number;
  }[];
}

// Orden de los desplegables, como en la pantalla de antes.
const ORDEN_GRUPOS = ["Ofipapel", "Aliz-1", "Aliz-2", "Comerciales", "Reparto"];

/** Reloj de agujas, como en la pantalla de antes. */
function RelojAgujas({ ahora }: { ahora: Date }) {
  const [h, m, s] = ahora
    .toLocaleTimeString("es-ES", { hour12: false, timeZone: "Atlantic/Canary" })
    .split(":")
    .map(Number);
  const aguja = (ang: number, largo: number, ancho: number, color: string) => {
    const r = ((ang - 90) * Math.PI) / 180;
    return (
      <line
        x1={50}
        y1={50}
        x2={50 + largo * Math.cos(r)}
        y2={50 + largo * Math.sin(r)}
        stroke={color}
        strokeWidth={ancho}
        strokeLinecap="round"
      />
    );
  };
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: 96, height: 96, flexShrink: 0 }}
      aria-hidden
    >
      <circle
        cx={50}
        cy={50}
        r={46}
        fill="#fff"
        stroke="#d6ead6"
        strokeWidth={3}
      />
      {Array.from({ length: 12 }, (_, i) => {
        const r = (i * 30 * Math.PI) / 180;
        const largo = i % 3 === 0 ? 8 : 4;
        return (
          <line
            key={i}
            x1={50 + 40 * Math.sin(r)}
            y1={50 - 40 * Math.cos(r)}
            x2={50 + (40 - largo) * Math.sin(r)}
            y2={50 - (40 - largo) * Math.cos(r)}
            stroke={i % 3 === 0 ? V.verde : V.verdeMed}
            strokeWidth={i % 3 === 0 ? 3 : 2}
            strokeLinecap="round"
          />
        );
      })}
      {aguja(((h % 12) + m / 60) * 30, 22, 4.5, V.verde)}
      {aguja((m + s / 60) * 6, 32, 3, V.verde)}
      {aguja(s * 6, 36, 1.3, "#d4a017")}
      <circle cx={50} cy={50} r={3.5} fill={V.verde} />
    </svg>
  );
}
interface Panel {
  ok: boolean;
  error?: string;
  cambiar_pin?: boolean;
  empleado: string;
  nombre: string;
  estado: EstadoFichaje;
  siguientes: TipoFichaje[];
  hoy: { tipo: TipoFichaje; en: string; origen: string }[];
  repartidor: string | null;
  reparto_token: string | null;
}

const BOTONES: Record<
  TipoFichaje,
  { texto: string; icono: string; color: string }
> = {
  entrada: { texto: "Fichar entrada", icono: "▶", color: V.verdeMed },
  pausa_inicio: { texto: "Empezar pausa", icono: "⏸", color: V.naranja },
  pausa_fin: { texto: "Terminar pausa", icono: "▶", color: V.verdeMed },
  salida: { texto: "Fichar salida", icono: "■", color: V.rojo },
};
const ESTADO: Record<EstadoFichaje, string> = {
  trabajando: "Estás trabajando",
  pausa: "Estás en pausa",
  salida: "Jornada terminada",
  sin_fichar: "Aún no has fichado hoy",
};

function Tarjeta({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.97)",
        borderRadius: 22,
        borderTop: `5px solid ${V.lima}`,
        padding: 16,
        boxShadow: "0 8px 24px rgba(0,0,0,.18)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
function Boton({
  children,
  onClick,
  color = V.verdeMed,
  claro,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  color?: string;
  claro?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: claro ? "#fff" : color,
        color: claro ? color : "#fff",
        border: claro ? `2px solid ${color}` : "none",
        borderRadius: 16,
        padding: "14px 12px",
        fontWeight: 700,
        fontSize: 16,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

async function ubicacion(): Promise<{
  lat: number;
  lng: number;
  precision: number;
} | null> {
  if (!navigator.geolocation) return null;
  return new Promise((ok) => {
    const t = setTimeout(() => ok(null), 5000);
    navigator.geolocation.getCurrentPosition(
      (p) => (
        clearTimeout(t),
        ok({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precision: p.coords.accuracy,
        })
      ),
      () => (clearTimeout(t), ok(null)),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
    );
  });
}

export function FichajeApp() {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [quien, setQuien] = useState<{ codigo: string; nombre: string } | null>(
    null,
  );
  const [pin, setPin] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [fraseHecho, setFraseHecho] = useState("");
  // Primera vez (PIN 1234): elige su PIN nuevo y lo repite.
  const [nuevo, setNuevo] = useState<{
    paso: 1 | 2;
    primero: string;
    actual: string;
  } | null>(null);
  const [ahora, setAhora] = useState(new Date());
  const reinicio = useRef<number | null>(null);

  useEffect(() => {
    const titulo = document.title;
    document.title = "Fichaje · Ofipapel";
    if (!document.getElementById("reparto-fuentes")) {
      const l = document.createElement("link");
      l.id = "reparto-fuentes";
      l.rel = "stylesheet";
      l.href =
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&family=Poppins:wght@700;800&display=swap";
      document.head.appendChild(l);
    }
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => {
      clearInterval(t);
      document.title = titulo;
    };
  }, []);

  const cargar = useCallback(() => {
    supabase
      .rpc("fn_fichaje_personas")
      .then(({ data, error: e }) =>
        e
          ? setError("Sin conexión. Prueba otra vez en un momento.")
          : setGrupos((data ?? []) as Grupo[]),
      );
  }, []);
  useEffect(cargar, [cargar]);

  const volver = useCallback(() => {
    if (reinicio.current) clearTimeout(reinicio.current);
    reinicio.current = null;
    setQuien(null);
    setPin("");
    setPanel(null);
    setNuevo(null);
    setHecho(null);
    setError(null);
  }, []);
  // Pantalla compartida: si nadie toca nada, vuelve sola al principio.
  const programarVuelta = useCallback(
    (ms: number) => {
      if (reinicio.current) clearTimeout(reinicio.current);
      reinicio.current = window.setTimeout(volver, ms);
    },
    [volver],
  );

  const pulsar = async (d: string) => {
    if (ocupado || !quien) return;
    const nuevo = (pin + d).slice(0, 4);
    setPin(nuevo);
    setError(null);
    if (nuevo.length < 4) return;
    setOcupado(true);
    const { data, error: e } = await supabase.rpc("fn_fichaje_entrar", {
      p_empleado: quien.codigo,
      p_pin: nuevo,
    });
    setOcupado(false);
    const r = data as Panel | null;
    if (r?.cambiar_pin) {
      setNuevo({ paso: 1, primero: "", actual: "" });
      programarVuelta(120_000);
      return;
    }
    if (e || !r?.ok) {
      setError(
        e
          ? /fetch|network/i.test(e.message)
            ? "Sin conexión. Prueba otra vez."
            : e.message
          : (r?.error ?? "PIN incorrecto."),
      );
      setPin("");
      return;
    }
    setPanel(r);
    programarVuelta(60_000);
  };

  const pulsarNuevo = async (d: string) => {
    if (!nuevo || ocupado || !quien) return;
    const actual = (nuevo.actual + d).slice(0, 4);
    setError(null);
    if (actual.length < 4) return setNuevo({ ...nuevo, actual });
    if (nuevo.paso === 1) {
      if (actual === "1234") {
        setNuevo({ ...nuevo, actual: "" });
        return setError("Elige un PIN distinto de 1234.");
      }
      return setNuevo({ paso: 2, primero: actual, actual: "" });
    }
    if (actual !== nuevo.primero) {
      setNuevo({ paso: 1, primero: "", actual: "" });
      return setError("No coinciden. Vuelve a empezar.");
    }
    setOcupado(true);
    const { data, error: e } = await supabase.rpc("fn_fichaje_pin_cambiar", {
      p_empleado: quien.codigo,
      p_pin_actual: pin,
      p_pin_nuevo: actual,
    });
    setOcupado(false);
    const r = data as Panel | null;
    if (e || !r?.ok) {
      setNuevo({ paso: 1, primero: "", actual: "" });
      return setError(
        e?.message ?? r?.error ?? "No se ha podido guardar el PIN.",
      );
    }
    setPin(actual);
    setNuevo(null);
    setPanel(r);
    setHecho("PIN guardado. A partir de ahora entra con el tuyo.");
    programarVuelta(60_000);
  };

  const fichar = async (tipo: TipoFichaje) => {
    if (!quien || ocupado) return;
    setOcupado(true);
    setError(null);
    const pos = await ubicacion();
    const { data, error: e } = await supabase.rpc("fn_fichaje_fichar", {
      p_empleado: quien.codigo,
      p_pin: pin,
      p_tipo: tipo,
      p_lat: pos?.lat ?? null,
      p_lng: pos?.lng ?? null,
      p_precision: pos?.precision ?? null,
      p_dispositivo: navigator.userAgent.slice(0, 200),
    });
    setOcupado(false);
    const r = data as Panel | null;
    if (e || !r?.ok)
      return setError(
        e
          ? /fetch|network/i.test(e.message)
            ? "Sin conexión: no se ha fichado. Prueba otra vez."
            : e.message
          : (r?.error ?? "No se ha podido fichar."),
      );
    setPanel(r);
    const ultimo = r.hoy[r.hoy.length - 1];
    setHecho(`${TIPOS_FICHAJE[tipo]} fichada a las ${horaCan(ultimo?.en)}`);
    setFraseHecho(
      tipo === "entrada"
        ? delDia(FRASES_ENTRADA)
        : tipo === "salida"
          ? delDia(FRASES_SALIDA)
          : "",
    );
    // Repartidor con la jornada abierta: tiene tiempo de pulsar «Mi reparto».
    programarVuelta(r.reparto_token ? 60_000 : 8_000);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: `#1A5C1A url(${base}marca/fondo-reparto.jpg) center top / cover fixed`,
        fontFamily: "Inter, system-ui, sans-serif",
        color: V.texto,
        padding: "14px 12px 60px",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(135deg,#0d3d0d 0%,#1A5C1A 45%,#237523 75%,#3a8f2a 100%)",
            borderRadius: 22,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,.25)",
          }}
        >
          <img
            src={`${base}marca/logo-ofipapel.png`}
            alt="Ofipapel"
            style={{ height: 44 }}
          />
          <div style={{ flex: 1, color: "#fff" }}>
            <div
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 800,
                fontSize: 24,
                lineHeight: 1.1,
              }}
            >
              Fichaje
            </div>
            <div
              style={{
                fontSize: 12,
                letterSpacing: 2.5,
                fontWeight: 600,
                opacity: 0.9,
              }}
            >
              {panel ? panel.nombre.toUpperCase() : "OFIPAPEL"}
            </div>
          </div>
          {!quien && (
            <a
              href={`${base}fichaje-gestion`}
              title="Gestión del fichaje (en el ERP, con usuario de gerencia)"
              style={{
                background: "rgba(255,255,255,.14)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,.35)",
                borderRadius: 12,
                padding: "6px 10px",
                fontWeight: 600,
                fontSize: 13,
                textAlign: "center",
                textDecoration: "none",
                lineHeight: 1.2,
              }}
            >
              🔒
              <br />
              Gerencia
            </a>
          )}
          {quien && (
            <button
              type="button"
              onClick={volver}
              style={{
                background: "rgba(255,255,255,.14)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,.35)",
                borderRadius: 12,
                padding: "8px 10px",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {panel ? "Terminar" : "Volver"}
            </button>
          )}
        </div>

        <Tarjeta style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <RelojAgujas ahora={ahora} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 40,
                fontWeight: 600,
                color: V.verde,
                lineHeight: 1.1,
              }}
            >
              {ahora.toLocaleTimeString("es-ES", {
                timeZone: "Atlantic/Canary",
              })}
            </div>
            <div
              style={{
                color: V.verdeMed,
                fontWeight: 500,
                textTransform: "capitalize",
              }}
            >
              {ahora.toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Atlantic/Canary",
              })}
            </div>
          </div>
        </Tarjeta>

        {!quien && (
          <Tarjeta>
            {!grupos && !error && (
              <div style={{ textAlign: "center", color: V.gris }}>
                Cargando…
              </div>
            )}
            {grupos && !grupos.length && (
              <div style={{ textAlign: "center", color: V.gris }}>
                Todavía no hay nadie dado de alta para fichar. Se hace en el
                ERP: Archivo → Fichaje → Personas.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {grupos
                ?.slice()
                .sort(
                  (a, b) =>
                    ORDEN_GRUPOS.indexOf(a.grupo) -
                    ORDEN_GRUPOS.indexOf(b.grupo),
                )
                .map((g) => {
                  // Dentro del grupo, un apartado por departamento si hay varios (Ofipapel: Almacén, Oficina, Pedidos…).
                  const deps = [...new Set(g.personas.map((p) => p.dep))];
                  const opcion = (p: Grupo["personas"][number]) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.nombre}
                    </option>
                  );
                  return (
                    <label
                      key={g.grupo}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          letterSpacing: 1.5,
                          color: V.verdeMed,
                          textTransform: "uppercase",
                        }}
                      >
                        {g.grupo}
                      </span>
                      <select
                        value=""
                        onChange={(e) => {
                          const p = g.personas.find(
                            (x) => x.codigo === e.target.value,
                          );
                          if (p)
                            setQuien({ codigo: p.codigo, nombre: p.corto });
                        }}
                        style={{
                          padding: "14px 14px",
                          borderRadius: 14,
                          border: "2px solid #d6ead6",
                          fontSize: 18,
                          fontWeight: 600,
                          color: V.texto,
                          background: "#fff",
                        }}
                      >
                        <option value="">— Elige tu nombre —</option>
                        {deps.length > 1
                          ? deps.map((d) => (
                              <optgroup key={d} label={d}>
                                {g.personas
                                  .filter((p) => p.dep === d)
                                  .map(opcion)}
                              </optgroup>
                            ))
                          : g.personas.map(opcion)}
                      </select>
                    </label>
                  );
                })}
            </div>
            <div
              style={{
                textAlign: "center",
                color: V.gris,
                marginTop: 14,
                fontSize: 14,
              }}
            >
              Toca el desplegable de tu departamento o tienda y busca tu nombre.
            </div>
            {error && (
              <div
                style={{ color: V.rojo, textAlign: "center", marginTop: 10 }}
              >
                {error}
              </div>
            )}
          </Tarjeta>
        )}

        {quien && !panel && nuevo && (
          <Tarjeta>
            <div
              style={{
                textAlign: "center",
                fontWeight: 700,
                fontSize: 20,
                color: V.verde,
              }}
            >
              Hola, {quien.nombre}
            </div>
            <div
              style={{ textAlign: "center", color: V.gris, marginBottom: 10 }}
            >
              {nuevo.paso === 1
                ? "Es tu primera vez: elige tu PIN de 4 cifras (el que usas siempre)"
                : "Repite tu PIN nuevo"}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 14,
                marginBottom: 14,
              }}
            >
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: i < nuevo.actual.length ? V.lima : "#dfe8df",
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 10,
              }}
            >
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Boton
                  key={d}
                  claro
                  onClick={() => void pulsarNuevo(d)}
                  style={{ fontSize: 26, padding: "14px 0" }}
                >
                  {d}
                </Boton>
              ))}
              <Boton
                claro
                color={V.gris}
                onClick={volver}
                style={{ fontSize: 14 }}
              >
                Cancelar
              </Boton>
              <Boton
                claro
                onClick={() => void pulsarNuevo("0")}
                style={{ fontSize: 26, padding: "14px 0" }}
              >
                0
              </Boton>
              <Boton
                claro
                color={V.gris}
                onClick={() =>
                  setNuevo({ ...nuevo, actual: nuevo.actual.slice(0, -1) })
                }
                style={{ fontSize: 22 }}
              >
                ⌫
              </Boton>
            </div>
            {ocupado && (
              <div
                style={{ textAlign: "center", color: V.gris, marginTop: 10 }}
              >
                Guardando…
              </div>
            )}
            {error && (
              <div
                style={{
                  color: V.rojo,
                  textAlign: "center",
                  marginTop: 10,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}
          </Tarjeta>
        )}

        {quien && !panel && !nuevo && (
          <Tarjeta>
            <div
              style={{
                textAlign: "center",
                fontWeight: 700,
                fontSize: 20,
                color: V.verde,
              }}
            >
              Hola, {quien.nombre}
            </div>
            <div
              style={{ textAlign: "center", color: V.gris, marginBottom: 10 }}
            >
              Pon tu PIN{" "}
              <span style={{ fontSize: 12 }}>(la primera vez: 1234)</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 14,
                marginBottom: 14,
              }}
            >
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: i < pin.length ? V.verdeMed : "#dfe8df",
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 10,
              }}
            >
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Boton
                  key={d}
                  claro
                  onClick={() => void pulsar(d)}
                  style={{ fontSize: 26, padding: "14px 0" }}
                >
                  {d}
                </Boton>
              ))}
              <Boton
                claro
                color={V.gris}
                onClick={volver}
                style={{ fontSize: 14 }}
              >
                No soy yo
              </Boton>
              <Boton
                claro
                onClick={() => void pulsar("0")}
                style={{ fontSize: 26, padding: "14px 0" }}
              >
                0
              </Boton>
              <Boton
                claro
                color={V.gris}
                onClick={() => setPin(pin.slice(0, -1))}
                style={{ fontSize: 22 }}
              >
                ⌫
              </Boton>
            </div>
            {ocupado && (
              <div
                style={{ textAlign: "center", color: V.gris, marginTop: 10 }}
              >
                Comprobando…
              </div>
            )}
            {error && (
              <div
                style={{
                  color: V.rojo,
                  textAlign: "center",
                  marginTop: 10,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}
          </Tarjeta>
        )}

        {panel && (
          <>
            {hecho && (
              <Tarjeta
                style={{ borderTopColor: V.verdeMed, textAlign: "center" }}
              >
                <div style={{ fontSize: 40 }}>✔</div>
                <div style={{ fontWeight: 800, fontSize: 20, color: V.verde }}>
                  {hecho}
                </div>
                {fraseHecho && (
                  <div
                    style={{
                      fontFamily: "Georgia, serif",
                      fontStyle: "italic",
                      fontSize: 19,
                      color: V.verdeMed,
                      marginTop: 6,
                      lineHeight: 1.35,
                    }}
                  >
                    {fraseHecho}
                  </div>
                )}
              </Tarjeta>
            )}
            <Tarjeta>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 18,
                  color: V.verde,
                  textAlign: "center",
                  marginBottom: 12,
                }}
              >
                {ESTADO[panel.estado]}
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {panel.siguientes.map((t) => (
                  <Boton
                    key={t}
                    color={BOTONES[t].color}
                    disabled={ocupado}
                    onClick={() => void fichar(t)}
                    style={{ fontSize: 20, padding: "18px 12px" }}
                  >
                    {BOTONES[t].icono}{" "}
                    {panel.estado === "salida" && t === "entrada"
                      ? "Volver a entrar"
                      : BOTONES[t].texto}
                  </Boton>
                ))}
                {panel.reparto_token && (
                  <a
                    href={`${base}repartidor?t=${panel.reparto_token}`}
                    style={{
                      display: "block",
                      textAlign: "center",
                      background: "#fff",
                      color: V.verde,
                      border: `2px solid ${V.verdeMed}`,
                      borderRadius: 16,
                      padding: "16px 12px",
                      fontWeight: 800,
                      fontSize: 20,
                      textDecoration: "none",
                    }}
                  >
                    🚚 Mi reparto
                  </a>
                )}
              </div>
              {ocupado && (
                <div
                  style={{ textAlign: "center", color: V.gris, marginTop: 10 }}
                >
                  Fichando…
                </div>
              )}
              {error && (
                <div
                  style={{
                    color: V.rojo,
                    textAlign: "center",
                    marginTop: 10,
                    fontWeight: 600,
                  }}
                >
                  {error}
                </div>
              )}
              {!!panel.hoy.length && (
                <div
                  style={{
                    marginTop: 14,
                    borderTop: "1px solid #e3ece3",
                    paddingTop: 10,
                  }}
                >
                  <div style={{ color: V.gris, fontSize: 13, marginBottom: 4 }}>
                    Hoy
                  </div>
                  {panel.hoy.map((e, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 15,
                        padding: "2px 0",
                      }}
                    >
                      <span>
                        {TIPOS_FICHAJE[e.tipo]}
                        {e.origen === "correccion"
                          ? " (corregido en la oficina)"
                          : ""}
                      </span>
                      <span
                        style={{
                          fontFamily: '"IBM Plex Mono", monospace',
                          fontWeight: 600,
                        }}
                      >
                        {horaCan(e.en)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {panel.repartidor && panel.estado !== "trabajando" && (
                <div style={{ marginTop: 12, fontSize: 13, color: V.gris }}>
                  Repartidores: sin la entrada fichada no se puede entregar. La
                  jornada termina al guardar la furgoneta en la nave: ficha la
                  salida allí.
                </div>
              )}
            </Tarjeta>
          </>
        )}
        <div
          style={{
            textAlign: "center",
            color: "rgba(255,255,255,.85)",
            fontSize: 12,
            textShadow: "0 1px 2px rgba(0,0,0,.5)",
          }}
        >
          Registro de jornada (art. 34.9 ET). Si te equivocas, avisa en la
          oficina: lo corrigen dejando constancia.
        </div>
      </div>
    </div>
  );
}
