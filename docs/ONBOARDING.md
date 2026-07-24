# Onboarding — Entorno de Desarrollo Ofipapel
**Tiempo estimado: 30 minutos**

---

## 1. Requisitos previos (5 min)

- Git configurado con tu usuario de GitHub
- Node.js 20+ (`node --version`)
- Acceso de colaborador al repo `ralayonizquierdo-alt/Ofipapel---App`
- (Opcional) Cuenta en Netlify si vas a revisar previews de deploy

---

## 2. Clonar y explorar (5 min)

```bash
git clone https://github.com/ralayonizquierdo-alt/Ofipapel---App.git
cd Ofipapel---App
```

**Estructura principal:**

```
Index.html          ← La app de gestión financiera (todo en un solo fichero)
sw.js               ← Service Worker (caching PWA)
alquileres/         ← App React de alquileres
joe-app/            ← App React Joe
docs/               ← Documentación y recursos (calendarios fiscales, etc.)
.github/workflows/  ← CI/CD (deploy automático a GitHub Pages)
```

Lee `CLAUDE.md` en la raíz — contiene todo lo que necesitas saber técnicamente.

---

## 3. Probar la app principal (5 min)

`Index.html` es una SPA vanilla — se abre directamente en el navegador sin build:

```bash
# Opción 1: abrirla directamente
open Index.html   # macOS
xdg-open Index.html  # Linux

# Opción 2: servidor local (evita problemas con Service Worker en file://)
npx serve . -p 3000
# → http://localhost:3000/Index.html
```

La app guarda todo en `localStorage`. No necesita servidor ni base de datos para funcionar.

---

## 4. Apps React (5 min, opcional)

```bash
# Alquileres
cd alquileres
npm install
npm run dev    # → http://localhost:5173

# Joe App
cd joe-app
npm install
npm run dev
```

---

## 5. Workflow de desarrollo (5 min)

```bash
# Crear rama para tu trabajo
git checkout -b feature/mi-cambio

# Hacer cambios, commitear
git add Index.html sw.js
git commit -m "feat: descripción del cambio"

# Si modificaste Index.html, bumpar sw.js primero:
# Editar sw.js línea 1: const CACHE = 'ofipapel-vXX'; (incrementar XX)

# Push y abrir PR
git push -u origin feature/mi-cambio
# → GitHub: abrir PR contra main
```

El deploy a producción ocurre automáticamente cuando el PR se mergea a `main`.

---

## 6. Convenciones importantes (5 min)

### Seguridad
- ❌ **NUNCA** subas claves API al repositorio
- La API key de Claude la introduce el usuario en la app (localStorage `op_claude_key`)
- La anon key de Supabase hardcodeada es intencional y segura (protegida por RLS)

### Service Worker
- Cada vez que modifiques `Index.html`, **incrementa** el número en `sw.js`:
  ```js
  const CACHE = 'ofipapel-v29';  // ← este número
  ```
- Sin esto, los usuarios no ven los cambios hasta que el SW expira

### Commits
- Usar prefijos: `feat:`, `fix:`, `docs:`, `refactor:`
- Mensaje en español o inglés, consistente con el historial
- Un commit por funcionalidad / cambio lógico

### LocalStorage
- Las claves tienen prefijo `op_` — no usar otros prefijos
- Los seeds usan guards (ej: `op_cajacierres_seed_v1`) para no re-ejecutarse
- Ver tabla completa en `CLAUDE.md`

---

## 7. Entornos y deploys

| Entorno | URL | Cómo se actualiza |
|---------|-----|-------------------|
| Producción | `ralayonizquierdo-alt.github.io/Ofipapel---App` | Merge a `main` |
| Preview Netlify | URL por rama (en el PR de GitHub) | Push a cualquier rama |

---

## 8. Resolución de problemas frecuentes

**La app no refleja mis cambios en el navegador**
→ El Service Worker está sirviendo la versión anterior. Abre DevTools → Application → Service Workers → "Update on reload" o "Skip waiting". En producción, los usuarios verán la nueva versión cuando el SW detecte el cambio de `CACHE`.

**Los datos de localStorage desaparecieron**
→ Normal en modo incógnito o si limpias el storage. Los seeds de `cajaCierres` se re-ejecutan si borras la key guard `op_cajacierres_seed_v1`.

**El build de Netlify falla**
→ Revisar que `alquileres/` y `joe-app/` compilan sin errores: `cd alquileres && npm ci && npm run build`.

---

## Contacto

Para dudas sobre el negocio o datos: **R. Alayón** (propietario del repo)  
Para dudas técnicas: abre un issue en el repo o consulta `CLAUDE.md`
