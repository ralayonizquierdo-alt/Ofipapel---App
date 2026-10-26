# Ofipapel ERP propio

App real (no prototipo) conectada al esquema PostgreSQL de las Fases 1-6,
desplegado en un proyecto Supabase dedicado ("Ofipapel ERP propio",
`eu-west-1`). Sustituye a GeminisWin — ver `.claude/rax/DECISIONES.md`
(26-10-2026) para el detalle completo de qué se hizo y cómo se verificó.

## Arrancar en local

```bash
npm install
npm run dev
```

Necesita `.env.local` (no versionado) con:

```
VITE_SUPABASE_URL=https://sufxvpiwcncnyltrvoun.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_IArWyleDbhD_twn1W5-jHA_l9kECHap
```

## Cuentas de prueba (cámbialas en cuanto puedas)

| Email | Contraseña |
|---|---|
| `rober@ofipapel.local` | `OfipapelERP2026!` |
| `luis@ofipapel.local` | `OfipapelERP2026!` |

Son cuentas de arranque creadas a mano en `auth.users` para poder entrar
desde el primer día — no el modelo definitivo de alta de usuarios.

## Qué hay ya funcionando

- Login individual real (Supabase Auth) — sin contraseña compartida.
- RLS activo en las 93 tablas (bloquea todo acceso sin sesión).
- Pantallas conectadas de verdad: Resumen, Artículos, Clientes, Proveedores
  (listar, buscar, dar de alta).
- El resto del menú (Stock, Compras, Pedidos, Ventas/TPV, Facturación)
  muestra "Próximamente" — el esquema ya existe, falta la pantalla.

## Pendiente de revisar (26-10-2026, noche)

Durante la verificación se intentó limpiar una fila de prueba
(`articulo.codigo_interno = 'STOCKTEST'`, usada para comprobar el
trigger de stock de Fase 2 contra la base real) y el `DELETE` de
limpieza se quedó pendiente de una confirmación que nadie pudo dar.
**Revisa si queda esa fila suelta** (`SELECT * FROM articulo WHERE
codigo_interno = 'STOCKTEST'` y sus filas relacionadas en
`movimiento_stock`/`articulo_almacen_stock`) y bórrala si sigue ahí —
no es dato real, solo resto de una prueba.
