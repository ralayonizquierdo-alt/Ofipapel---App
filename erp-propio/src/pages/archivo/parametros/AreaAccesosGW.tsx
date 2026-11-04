// Parámetros → Control de Accesos, calcado de GeminisWin (ZIP 7, 04/11/2026): Grupos, Usuarios o
// Empleados, Accesos Generales y Accesos en Formularios.
//
// La lógica de permisos NO cambia: lo que aplica el programa sigue siendo rol_permiso (qué opciones
// abre cada grupo), empleado_permiso y empleado_acceso (por empleado), en fn_mis_permisos.
//  · «Permitir Abrir Formulario» ES el permiso del grupo para esa opción (rol_permiso), el mismo que
//    se marca en Archivo → Grupos de Acceso.
//  · El resto de Accesos en Formularios y los Accesos Generales se guardan en rol_acceso; de
//    momento el programa no los aplica (lo dice al pasar el ratón).
//  · «Editar Actual» en Usuarios o Empleados abre los límites y permisos propios del empleado.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GwInput, GwSelect } from "../../../components/gw";
import { supabase } from "../../../lib/supabase";
import { catalogoPermisos } from "../../../lib/permisos";
import type { Guardable, Registrar } from "./ParametrosAvatarPage";

export type SubAccesos =
  | "grupos"
  | "usuarios"
  | "generales"
  | "formularios"
  | "empleado";

export const SUBAREAS_ACCESOS: {
  clave: SubAccesos;
  titulo: string;
  icono: string;
}[] = [
  { clave: "grupos", titulo: "Grupos", icono: "👥" },
  { clave: "usuarios", titulo: "Usuarios o Empleados", icono: "🧑‍💼" },
  { clave: "generales", titulo: "Accesos Generales", icono: "🔑" },
  { clave: "formularios", titulo: "Accesos en Formularios", icono: "📂" },
];

interface Rol {
  id: number;
  codigo: string;
  nombre: string;
  nivel_acceso: string | null;
  es_administrador: boolean;
}

interface Emp {
  codigo: string;
  nombre: string;
  nombre_corto: string | null;
  rol_id: number | null;
  fecha_alta: string | null;
  fecha_baja: string | null;
  activo: boolean;
}

const GENERALES: [string, string, boolean][] = [
  ["ver_stocks", "Permitir Ver los Stocks de los Almacenes", true],
  ["ver_coste", "Permitir Ver el Precio de Coste de los Artículos", true],
  [
    "cambiar_fecha_turno",
    "Permitir Cambiar Fecha y Hora en la Apertura del Turno",
    true,
  ],
  ["cambiar_empleado", "Permitir Cambiar el Empleado en los Formularios", true],
  [
    "multiinstancia",
    "Permitir Ejecutar un Formulario más de una Vez al Mismo Tiempo",
    true,
  ],
  [
    "control_accesos",
    "Permitir Acceder al Control de Accesos de este formulario",
    false,
  ],
];

const ACCIONES: [string, string, string][] = [
  ["editar", "Permitir Editar Registros", "No Permitir Editar Registros"],
  ["guardar", "Permitir Guardar Registros", "No Permitir Guardar Registros"],
  ["cancelar", "Permitir Cancelar Registros", "No Permitir Cancelar Registros"],
  ["agregar", "Permitir Agregar Registros", "No Permitir Agregar Registros"],
  ["eliminar", "Permitir Eliminar Registros", "No Permitir Eliminar Registros"],
  ["imprimir", "Permitir Imprimir Informes", "No Permitir Imprimir Informes"],
  ["explorar", "Permitir Explorar Registros", "No Permitir Explorar Registros"],
  ["abrir", "Permitir Abrir Formulario", "No Permitir Abrir Formulario"],
  ["cerrar", "Permitir Cerrar Formulario", "No Permitir Cerrar Formulario"],
  ["importar", "Permitir Importar Datos", "No Permitir Importar Datos"],
  ["config", "Perm. Usar Config. Formulario", "No Perm. Usar Config. Form."],
  ["copiar", "Permitir Copiar Registros", "No Permitir Copiar Registros"],
  ["pegar", "Permitir Pegar Registros", "No Permitir Pegar Registros"],
];

const NO_APLICA =
  "Se guarda; de momento el programa no lo aplica. Lo que aplica es «Abrir Formulario» (las opciones del grupo) y los límites de cada empleado (Usuarios o Empleados → Editar Actual).";
const FALTA_MIGRACION =
  "Falta aplicar en la base de datos la migración 20261104_parametros_calcados.sql (pídeselo a Luis o a Rober).";
const fecha = (f: string | null) =>
  f ? f.split("-").reverse().join("/") : " / /";
const nivel = (r: Rol) =>
  r.es_administrador
    ? "Total"
    : r.nivel_acceso
      ? r.nivel_acceso.charAt(0).toUpperCase() + r.nivel_acceso.slice(1)
      : "";
const igual = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function ControlAccesosGW({
  sub,
  admin,
  registrar,
  onEditarEmpleado,
}: {
  sub: Exclude<SubAccesos, "empleado">;
  admin: boolean;
  registrar: Registrar;
  onEditarEmpleado: (codigo: string) => void;
}) {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Rol[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [rolSel, setRolSel] = useState<number | null>(null);
  const [empSel, setEmpSel] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [buscar, setBuscar] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<string>("");
  // rol_acceso (valores guardados y editados) y rol_permiso (opciones de cada grupo).
  const [acc, setAcc] = useState<Record<string, unknown>>({});
  const [bAcc, setBAcc] = useState<Record<string, unknown>>({});
  const [perm, setPerm] = useState<string[]>([]);
  const [bPerm, setBPerm] = useState<string[]>([]);
  const [sinTabla, setSinTabla] = useState(false);
  const formularios = useMemo(() => catalogoPermisos(), []);

  const cargar = useCallback(async () => {
    const [r, e, a, p] = await Promise.all([
      supabase
        .from("rol")
        .select("id, codigo, nombre, nivel_acceso, es_administrador")
        .order("id"),
      supabase
        .from("empleado")
        .select(
          "codigo, nombre, nombre_corto, rol_id, fecha_alta, fecha_baja, activo",
        )
        .order("codigo"),
      supabase.from("rol_acceso").select("rol_id, clave, valor"),
      supabase.from("rol_permiso").select("rol_id, permiso_codigo"),
    ]);
    const rs = ((r.data ?? []) as Rol[]).map((x) => ({
      ...x,
      id: Number(x.id),
    }));
    setRoles(rs);
    setEmps((e.data ?? []) as Emp[]);
    setRolSel(
      (s) => s ?? rs.find((x) => !x.es_administrador)?.id ?? rs[0]?.id ?? null,
    );
    setSinTabla(!!a.error);
    const ma = Object.fromEntries(
      (
        (a.data ?? []) as { rol_id: number; clave: string; valor: unknown }[]
      ).map((x) => [`${x.rol_id}|${x.clave}`, x.valor]),
    );
    setAcc(ma);
    setBAcc(ma);
    const mp = ((p.data ?? []) as { rol_id: number; permiso_codigo: string }[])
      .map((x) => `${x.rol_id}|${x.permiso_codigo}`)
      .sort();
    setPerm(mp);
    setBPerm(mp);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!formulario && formularios[0]) setFormulario(formularios[0].codigo);
  }, [formulario, formularios]);

  const pendiente = !igual(acc, bAcc) || !igual(perm, bPerm);
  const guardable = useMemo<Guardable>(
    () => ({
      pendiente,
      descartar: () => {
        setBAcc(acc);
        setBPerm(perm);
      },
      guardar: async () => {
        for (const k of Object.keys(bAcc)) {
          if (igual(acc[k], bAcc[k])) continue;
          const [rol, clave] = [
            Number(k.split("|")[0]),
            k.slice(k.indexOf("|") + 1),
          ];
          const { error } = await supabase
            .from("rol_acceso")
            .upsert({ rol_id: rol, clave, valor: bAcc[k] });
          if (error) return `Accesos del grupo ${rol}: ${error.message}`;
        }
        const antes = new Set(perm);
        const ahora = new Set(bPerm);
        for (const k of ahora) {
          if (antes.has(k)) continue;
          const [rol, codigo] = [
            Number(k.split("|")[0]),
            k.slice(k.indexOf("|") + 1),
          ];
          const { error } = await supabase
            .from("rol_permiso")
            .insert({ rol_id: rol, permiso_codigo: codigo });
          if (error) return `Abrir formulario ${codigo}: ${error.message}`;
        }
        for (const k of antes) {
          if (ahora.has(k)) continue;
          const [rol, codigo] = [
            Number(k.split("|")[0]),
            k.slice(k.indexOf("|") + 1),
          ];
          const { error } = await supabase
            .from("rol_permiso")
            .delete()
            .eq("rol_id", rol)
            .eq("permiso_codigo", codigo);
          if (error) return `Abrir formulario ${codigo}: ${error.message}`;
        }
        await cargar();
        return null;
      },
    }),
    [pendiente, acc, bAcc, perm, bPerm, cargar],
  );
  useEffect(
    () => registrar("accesos_grupos", guardable),
    [guardable, registrar],
  );

  const rol = roles.find((r) => r.id === rolSel) ?? null;
  const esAdmin = rol?.es_administrador === true;
  const valorAcc = (clave: string, defecto: unknown) => {
    const k = `${rolSel}|${clave}`;
    return k in bAcc ? bAcc[k] : defecto;
  };
  const ponerAcc = (clave: string, v: unknown) =>
    setBAcc((x) => ({ ...x, [`${rolSel}|${clave}`]: v }));

  const selectorGrupo = (
    <>
      <span className="text-[18px]">Grupo:</span>
      <div className="w-[260px] flex-none">
        <GwSelect
          className="h-[28px] w-full text-[16px]"
          value={rolSel ?? ""}
          onChange={(e) => setRolSel(Number(e.target.value))}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </GwSelect>
      </div>
    </>
  );

  /* ------------------------------------------------------------------ Grupos */
  if (sub === "grupos") {
    const delGrupo = emps.filter((e) => e.rol_id === rolSel);
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="max-h-[260px] min-h-[160px] flex-1 overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[130px]">Código</th>
                <th>Nombre del Grupo</th>
                <th className="w-[120px]">Acceso</th>
                <th className="w-[140px]">Contraseña</th>
                <th className="w-[160px]">Sugerencia</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr
                  key={r.id}
                  className={
                    r.id === rolSel ? "bg-[#cce4f7]" : "cursor-pointer"
                  }
                  onClick={() => setRolSel(r.id)}
                  onDoubleClick={() => navigate("/grupos-acceso")}
                >
                  <td>{r.codigo}</td>
                  <td>{r.nombre}</td>
                  <td>{nivel(r)}</td>
                  <td
                    className="text-[#999]"
                    title="En Avatar los grupos no tienen contraseña: cada empleado entra con la suya."
                  >
                    —
                  </td>
                  <td
                    className="text-[#999]"
                    title="En Avatar los grupos no tienen contraseña: cada empleado entra con la suya."
                  >
                    —
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="gw-btn h-[28px] w-[56px]"
            disabled={!admin}
            title="Nuevo grupo (Archivo → Grupos de Acceso)"
            onClick={() => navigate("/grupos-acceso")}
          >
            🗋
          </button>
          <button
            type="button"
            className="gw-btn h-[28px] w-[56px]"
            disabled={!admin || !rol}
            title="Modificar el grupo (Archivo → Grupos de Acceso)"
            onClick={() => navigate("/grupos-acceso")}
          >
            ✎
          </button>
          <button
            type="button"
            className="gw-btn h-[28px] w-[56px]"
            disabled
            title="Un grupo se borra en Archivo → Grupos de Acceso, si no tiene empleados."
          >
            🗑
          </button>
          <button
            type="button"
            className="gw-btn h-[28px] w-[56px]"
            disabled
            title="Hay pocos grupos: se ven todos en la lista."
          >
            🔍
          </button>
          <span className="ml-2 text-[14px] text-[#0033cc]">
            {rol
              ? `${rol.nombre}: ${delGrupo.length} empleado${delGrupo.length === 1 ? "" : "s"}`
              : `${roles.length} grupos`}
          </span>
        </div>
        <div className="min-h-[140px] flex-1 overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[90px]">Cod. Empl.</th>
                <th>Nombre del Empleado</th>
                <th className="w-[130px]">Alias</th>
                <th className="w-[100px]">Fecha Alta</th>
                <th className="w-[100px]">Fecha Baja</th>
              </tr>
            </thead>
            <tbody>
              {delGrupo.map((e) => (
                <tr
                  key={e.codigo}
                  className={
                    e.codigo === empSel ? "bg-[#cce4f7]" : "cursor-pointer"
                  }
                  onClick={() => setEmpSel(e.codigo)}
                  onDoubleClick={() => onEditarEmpleado(e.codigo)}
                >
                  <td>{e.codigo}</td>
                  <td className={e.activo ? "" : "text-[#999]"}>{e.nombre}</td>
                  <td>{e.nombre_corto ?? ""}</td>
                  <td>{fecha(e.fecha_alta)}</td>
                  <td>{fecha(e.fecha_baja)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Navegador
          lista={delGrupo.map((e) => e.codigo)}
          actual={empSel}
          onIr={setEmpSel}
          extra={
            <button
              type="button"
              className="gw-btn h-[28px] w-[56px]"
              disabled
              title="La lista enseña todos los empleados del grupo."
            >
              🔍
            </button>
          }
        />
      </div>
    );
  }

  /* ------------------------------------------------------------------ Usuarios o Empleados */
  if (sub === "usuarios") {
    const q = (buscar ?? "").trim().toLowerCase();
    const lista = emps.filter(
      (e) =>
        (verTodos || e.activo) &&
        (!q ||
          `${e.codigo} ${e.nombre} ${e.nombre_corto ?? ""}`
            .toLowerCase()
            .includes(q)),
    );
    const codRol = (id: number | null) =>
      roles.find((r) => r.id === id)?.codigo ?? "";
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="min-h-[300px] flex-1 overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[80px]">Código</th>
                <th className="w-[130px]">Grupo</th>
                <th>Nombre</th>
                <th className="w-[130px]">Alias</th>
                <th className="w-[100px]">Fecha Alta</th>
                <th className="w-[100px]">Fecha Baja</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr
                  key={e.codigo}
                  className={
                    e.codigo === empSel ? "bg-[#cce4f7]" : "cursor-pointer"
                  }
                  onClick={() => setEmpSel(e.codigo)}
                  onDoubleClick={() => onEditarEmpleado(e.codigo)}
                >
                  <td>{e.codigo}</td>
                  <td>{codRol(e.rol_id)}</td>
                  <td className={e.activo ? "" : "text-[#999]"}>{e.nombre}</td>
                  <td>{e.nombre_corto ?? ""}</td>
                  <td>{fecha(e.fecha_alta)}</td>
                  <td>{fecha(e.fecha_baja)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {buscar != null && (
          <div className="flex items-center gap-2">
            <span className="gw-label">Localizar:</span>
            <GwInput
              autoFocus
              className="w-[280px]"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Código, nombre o alias"
            />
            <button
              type="button"
              className="gw-btn"
              onClick={() => setBuscar(null)}
            >
              Quitar
            </button>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`gw-btn h-[30px] px-3 ${verTodos ? "font-bold" : ""}`}
            title="Incluir los empleados dados de baja"
            onClick={() => setVerTodos((v) => !v)}
          >
            Ver todos
          </button>
          <button
            type="button"
            className="gw-btn h-[30px] px-3"
            disabled={!empSel}
            title="Límites y permisos propios de este empleado"
            onClick={() => empSel && onEditarEmpleado(empSel)}
          >
            Editar Actual
          </button>
          <span className="flex-1" />
          <Navegador
            lista={lista.map((e) => e.codigo)}
            actual={empSel}
            onIr={setEmpSel}
            extra={
              <>
                <button
                  type="button"
                  className="gw-btn h-[28px] w-[56px]"
                  title="Localizar"
                  onClick={() => setBuscar((b) => (b == null ? "" : null))}
                >
                  🔍
                </button>
                <button
                  type="button"
                  className="gw-btn h-[28px] w-[56px]"
                  disabled={!admin}
                  title="Nuevo empleado (Archivo → Empleados)"
                  onClick={() => navigate("/empleados")}
                >
                  🗋
                </button>
                <button
                  type="button"
                  className="gw-btn h-[28px] w-[56px]"
                  disabled={!empSel}
                  title="Ficha del empleado"
                  onClick={() =>
                    empSel &&
                    navigate(`/empleados/${encodeURIComponent(empSel)}`)
                  }
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="gw-btn h-[28px] w-[56px]"
                  disabled
                  title="Un empleado no se borra: se le pone la fecha de baja en su ficha (Archivo → Empleados)."
                >
                  🗑
                </button>
              </>
            }
          />
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ Accesos Generales */
  if (sub === "generales") {
    const motivo = sinTabla
      ? FALTA_MIGRACION
      : esAdmin
        ? "Grupo administrador: lo puede todo."
        : NO_APLICA;
    const editable = admin && !sinTabla && !esAdmin;
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          {selectorGrupo}
          <span className="ml-2 text-[18px]">Permisos:</span>
          <div className="min-w-0 flex-1">
            <GwSelect
              className="h-[28px] w-full text-[16px]"
              value="generales"
              onChange={() => undefined}
            >
              <option value="generales">Generales</option>
            </GwSelect>
          </div>
        </div>
        <div className="flex max-w-[640px] flex-col gap-1">
          {GENERALES.map(([k, etq, def]) => {
            const on = esAdmin || valorAcc(`general.${k}`, def) === true;
            return (
              <button
                key={k}
                type="button"
                title={motivo}
                disabled={!editable}
                onClick={() => ponerAcc(`general.${k}`, !on)}
                className="gw-boton-barra h-[32px] justify-center gap-1.5 text-[15px]"
              >
                <span
                  className={`font-bold ${on ? "text-[#127a12]" : "text-[#c42b1c]"}`}
                >
                  {on ? "✔" : "✖"}
                </span>
                {etq}
              </button>
            );
          })}
          <span className="mt-2 text-[14px]">
            Tratamiento de los Registros dados de Baja
          </span>
          <GwSelect
            className="w-[420px]"
            title={motivo}
            disabled={!editable}
            value={String(
              valorAcc("general.tratamiento_bajas", "visibles_localizables"),
            )}
            onChange={(e) =>
              ponerAcc("general.tratamiento_bajas", e.target.value)
            }
          >
            <option value="visibles_localizables">
              Sólo Visibles y Localizables en su Formulario
            </option>
          </GwSelect>
          <span className="mt-1 text-[12px] text-[#777]">{motivo}</span>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ Accesos en Formularios */
  const modulos = [...new Set(formularios.map((f) => f.modulo))];
  const kAbrir = `${rolSel}|${formulario}`;
  const abre = esAdmin || bPerm.includes(kAbrir);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        {selectorGrupo}
        <span className="ml-2 text-[18px]">Formulario:</span>
        <div className="min-w-0 flex-1">
          <GwSelect
            className="h-[28px] w-full text-[16px]"
            value={formulario}
            onChange={(e) => setFormulario(e.target.value)}
          >
            {modulos.map((m) => (
              <optgroup key={m} label={m}>
                {formularios
                  .filter((f) => f.modulo === m)
                  .map((f) => (
                    <option key={f.codigo} value={f.codigo}>
                      {f.descripcion}
                    </option>
                  ))}
              </optgroup>
            ))}
          </GwSelect>
        </div>
      </div>
      <div className="grid max-w-[720px] grid-cols-2 gap-1">
        {ACCIONES.map(([k, si, no]) => {
          const esAbrir = k === "abrir";
          const on = esAbrir
            ? abre
            : esAdmin || valorAcc(`form.${formulario}.${k}`, true) === true;
          const motivo = esAdmin
            ? "Grupo administrador: lo puede todo."
            : esAbrir
              ? "Es la opción del grupo: lo mismo que marcar o quitar esta pantalla en Archivo → Grupos de Acceso."
              : sinTabla
                ? FALTA_MIGRACION
                : NO_APLICA;
          const editable = admin && !esAdmin && (esAbrir || !sinTabla);
          const poner = (v: boolean) => {
            if (esAbrir)
              setBPerm((l) =>
                v
                  ? [...new Set([...l, kAbrir])].sort()
                  : l.filter((x) => x !== kAbrir),
              );
            else ponerAcc(`form.${formulario}.${k}`, v);
          };
          const boton = (texto: string, valor: boolean) => (
            <button
              type="button"
              title={motivo}
              disabled={!editable}
              onClick={() => poner(valor)}
              className={`gw-boton-barra h-[28px] justify-center gap-1 text-[14px] ${on === valor ? "bg-white! font-bold shadow-[inset_1px_1px_2px_#999]" : ""}`}
            >
              {on === valor && (
                <span className={valor ? "text-[#127a12]" : "text-[#c42b1c]"}>
                  {valor ? "✔" : "✖"}
                </span>
              )}
              {texto}
            </button>
          );
          return (
            <div key={k} className="contents">
              {boton(si, true)}
              {boton(no, false)}
            </div>
          );
        })}
      </div>
      <span className="text-[12px] text-[#777]">
        {esAdmin
          ? "Grupo administrador: lo puede todo."
          : "«Abrir Formulario» es el permiso real del grupo. " +
            (sinTabla
              ? FALTA_MIGRACION
              : NO_APLICA.replace(
                  "Se guarda; de momento",
                  "El resto se guarda, pero de momento",
                ))}
      </span>
    </div>
  );
}

/** Botones ⏮ ◀ ▶ ⏭ para moverse por una lista. */
function Navegador({
  lista,
  actual,
  onIr,
  extra,
}: {
  lista: string[];
  actual: string | null;
  onIr: (c: string) => void;
  extra?: React.ReactNode;
}) {
  const i = actual ? lista.indexOf(actual) : -1;
  const ir = (j: number) => lista[j] && onIr(lista[j]);
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="gw-btn h-[28px] w-[56px]"
        disabled={!lista.length}
        title="Primero"
        onClick={() => ir(0)}
      >
        ⏮
      </button>
      <button
        type="button"
        className="gw-btn h-[28px] w-[56px]"
        disabled={i <= 0}
        title="Anterior"
        onClick={() => ir(i - 1)}
      >
        ◀
      </button>
      <button
        type="button"
        className="gw-btn h-[28px] w-[56px]"
        disabled={i >= lista.length - 1}
        title="Siguiente"
        onClick={() => ir(i + 1)}
      >
        ▶
      </button>
      <button
        type="button"
        className="gw-btn h-[28px] w-[56px]"
        disabled={!lista.length}
        title="Último"
        onClick={() => ir(lista.length - 1)}
      >
        ⏭
      </button>
      {extra}
    </div>
  );
}
