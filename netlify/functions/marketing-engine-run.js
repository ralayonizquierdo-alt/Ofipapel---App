// Puente entre app.html y marketing-engine/ — crea un Job del Motor de
// Marketing a partir del formulario "Nueva Campaña" del Almacén, ejecuta
// el pipeline completo de 8 agentes, y devuelve el resultado (incluida la
// pieza final en base64, porque esta app no tiene backend/CDN propio: todo
// el estado de app.html vive en memoria del navegador, igual que el resto
// de datos de la app hoy).
//
// Variables de entorno:
//   MARKETING_ENGINE_TOKEN  (opcional pero recomendada) cadena que tú
//     inventas; debe coincidir con la constante APP_MARKETING_TOKEN
//     embebida en app.html (mismo patrón que CHAT_ASSISTANT_TOKEN de
//     Index.html — no es un secreto real, app.html es HTML estático
//     visible con "ver código fuente", solo evita dejar el endpoint
//     totalmente abierto). Sin ella configurada, CUALQUIERA puede invocar
//     este endpoint y disparar generación real de imágenes con OpenAI
//     (coste real por llamada) sin límite.
//   OPENAI_API_KEY  opcional — sin ella, el Creative Engine usa el
//     proveedor "simulated" (sin coste). Con ella definida, genera la
//     pieza real con OpenAI Images. Ver creative-engine/FIRST_REAL_GENERATION.md.
//
// IMPORTANTE — bloqueantes conocidos antes de producción real (ver
// marketing-engine/INTEGRATION.md para el detalle):
//   1. El paso de Maquetador usa Playwright/Chromium vía
//      design-studio/scripts/render-html.js, que en este dev sandbox
//      encuentra el binario en una ruta fija (/opt/node22/lib/node_modules,
//      /opt/pw-browsers/chromium) que NO existe en el entorno real de
//      Netlify Functions (AWS Lambda) — hay que empaquetar un Chromium
//      compatible con Lambda (p.ej. @sparticuz/chromium) antes de que esto
//      funcione desplegado de verdad. Se ha construido y verificado
//      íntegramente en este sandbox, no en producción.
//   2. netlify.toml necesita `included_files` para esta función (ver ahí)
//      porque el bundler de Netlify no traza por análisis estático las
//      rutas que arma marketing-engine/agents/07-maquetador en tiempo de
//      ejecución.

const fs = require('node:fs');
const path = require('node:path');

// NOTA DE DESPLIEGUE (2026-08-19): MARKETING_ENGINE_TOKEN se creó en Netlify
// pero las funciones seguían viéndola como indefinida — Netlify había
// reutilizado los paquetes de función del despliegue anterior ("all files
// already uploaded"), y con ellos el entorno viejo. Si vuelve a pasar tras
// añadir o cambiar una variable, hay que forzar que las funciones se
// reconstruyan: tocar este fichero, o "Clear cache and deploy" en Netlify.
// Comprobación: POST a /.netlify/functions/marketing-engine-run sin la
// cabecera x-marketing-token debe devolver 401, no 400.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Mismo mecanismo de rate limiting best-effort que chat-assistant.js: acota
// el coste ante uso indebido, no es control de acceso real (se reinicia si
// la función se "enfría"). Este endpoint es más caro por llamada que el
// chat (Chromium + posible generación real de imagen), así que el límite es
// más bajo.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 5;
const requestsByIp = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = requestsByIp.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestsByIp.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_PER_IP;
}

function clientIp(event) {
  return (
    event.headers['x-nf-client-connection-ip'] ||
    (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    'unknown'
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Cierra por defecto. La versión anterior solo comprobaba el token SI la
  // variable de entorno existía, y si no, dejaba pasar a cualquiera — un
  // "fail open" que en la práctica dejó el endpoint abierto durante días:
  // la variable se creó en Netlify pero las funciones seguían sin verla, y
  // como el código no fallaba, nada lo delataba salvo probarlo (comprobado
  // en vivo: token deliberadamente incorrecto también pasaba).
  //
  // Ahora, si falta la variable se usa el mismo valor que app.html lleva
  // embebido. No añade secreto (app.html es HTML estático y cualquiera lo
  // ve con "ver código fuente"), pero garantiza que el endpoint nunca queda
  // abierto de par en par por un fallo de configuración. La variable de
  // entorno, cuando esté disponible, tiene prioridad y permite cambiar el
  // token sin tocar código.
  const expectedToken = process.env.MARKETING_ENGINE_TOKEN || 'ofipapel-marketing-2026';
  const token = event.headers['x-marketing-token'] || event.headers['X-Marketing-Token'];
  if (token !== expectedToken) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido' }) };
  }

  if (isRateLimited(clientIp(event))) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Demasiadas peticiones, inténtalo más tarde' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: `JSON inválido: ${err.message}` }) };
  }

  // Directorio de trabajo de los jobs: /tmp es el único escribible en un
  // entorno Lambda real. Se fija ANTES de requerir marketing-engine/ para
  // que job-store.js lo lea ya con el valor correcto (jobsBaseDir() lo lee
  // en cada llamada, no lo cachea — ver core/job-store.js).
  if (!process.env.MARKETING_ENGINE_JOBS_DIR) {
    process.env.MARKETING_ENGINE_JOBS_DIR = path.join(
      process.env.TMPDIR || '/tmp',
      'marketing-engine-jobs'
    );
  }
  // Igual que MARKETING_ENGINE_JOBS_DIR arriba, pero para
  // learning-engine/store.js — sin esto cae a una ruta de solo lectura en
  // Lambda real (`/var/task`, junto al propio módulo) y falla con ENOENT
  // (visto en producción con marketing-engine-run-background.js, DT-17).
  if (!process.env.MARKETING_ENGINE_LEARNING_DIR) {
    process.env.MARKETING_ENGINE_LEARNING_DIR = path.join(
      process.env.TMPDIR || '/tmp',
      'marketing-engine-learning'
    );
  }

  const { createJob } = require(path.join(REPO_ROOT, 'marketing-engine/core/contracts/job.contract.js'));
  const { runPipeline } = require(path.join(REPO_ROOT, 'marketing-engine/core/orchestrator.js'));
  const { readEvents } = require(path.join(REPO_ROOT, 'marketing-engine/core/event-log.js'));

  const input = {
    productName: payload.productName,
    category: payload.category,
    brand: payload.brand || 'ofipapel',
    description: payload.description,
    channel: payload.channel || undefined,
    images: Array.isArray(payload.images) ? payload.images : [],
    postTypeOverride: payload.postTypeOverride || undefined,
    objective: payload.objective || undefined,
    creativeStyleHint: payload.creativeStyleHint || undefined,
    targetDate: payload.targetDate || undefined,
  };

  let job;
  try {
    job = createJob(input);
  } catch (err) {
    // Brief inválido (falta un campo obligatorio, categoría no soportada,
    // etc.) — error de petición del cliente, no del pipeline.
    return { statusCode: 400, body: JSON.stringify({ error: `Brief inválido: ${err.message}` }) };
  }

  let finalJob;
  try {
    finalJob = await runPipeline(job);
  } catch (err) {
    // No debería ocurrir — el orquestador captura los fallos de cada
    // agente internamente y termina en failed_needs_human. Si algo se
    // escapa igualmente, se informa como fallo del pipeline, no como 500
    // genérico, para que el Almacén pueda mostrar la tarjeta como fallida.
    return {
      statusCode: 200,
      body: JSON.stringify({
        jobId: job.id,
        status: 'failed_needs_human',
        input,
        trace: readEvents(job.id),
        errors: [`Fallo inesperado del pipeline: ${err.message}`],
      }),
    };
  }

  const trace = readEvents(finalJob.id);
  const errors = trace
    .filter((e) => e.type === 'agent_error' || (e.type === 'agent_result' && e.status && e.status !== 'ok'))
    .map((e) => e.error || e.reason || `Fallo en ${e.agentId}`);

  const response = {
    jobId: finalJob.id,
    status: finalJob.status,
    input: finalJob.input,
    trace,
    errors,
  };

  const copyState = finalJob.state.copywriter;
  if (copyState) {
    response.copy = copyState;
  }

  const creativeState = finalJob.state['director-creativo'];
  if (creativeState) {
    response.postType = creativeState.postType;
    response.graphicFamily = creativeState.graphicFamily;
  }

  const maquetadorState = finalJob.state.maquetador;
  if (finalJob.status === 'completed' && maquetadorState && maquetadorState.renderedAssetPath) {
    try {
      const buffer = fs.readFileSync(maquetadorState.renderedAssetPath);
      response.renderedAsset = {
        mimeType: 'image/png',
        base64: buffer.toString('base64'),
        width: maquetadorState.width,
        height: maquetadorState.height,
      };
    } catch (err) {
      response.errors.push(`No se pudo leer la pieza final generada: ${err.message}`);
    }
  }

  // ============================================================
  // El cerebro real: Marketing Engine → Creative Lab (Análisis → Concepto
  // → Art Direction Engine → 4 familias oficiales → Layout Intelligence →
  // Design Director → Component Library → pieza compuesta final) →
  // proveedor real (OpenAI Images) o "simulated". Sustituye a
  // creative-engine/index.js#runCreativePipeline (DT-15, resuelto en el
  // sprint "Cierre de arquitectura", 2026-08-01): aquel pipeline no
  // pasaba por ninguno de los motores construidos en esta sesión — este
  // sí, siempre, con o sin proveedor real conectado. Punto de sustitución
  // de proveedor: una sola variable de entorno (OPENAI_API_KEY) — sin
  // ella cae a "simulated", sin tocar código.
  if (finalJob.status === 'completed') {
    try {
      const { fromMarketingEngine, prepareAssets } = require(path.join(REPO_ROOT, 'creative-engine/index.js'));
      const { runCreativeLab } = require(path.join(REPO_ROOT, 'creative-engine/creative-lab/index.js'));
      const { PATTERNS } = require(path.join(REPO_ROOT, 'creative-engine/creative-lab/art-direction-engine/patterns.js'));
      if (!process.env.CREATIVE_ENGINE_ASSETS_DIR) {
        process.env.CREATIVE_ENGINE_ASSETS_DIR = path.join(process.env.TMPDIR || '/tmp', 'creative-engine-assets');
      }
      const creativeProviderId = process.env.OPENAI_API_KEY ? 'openai-images' : 'simulated';
      const brief = fromMarketingEngine(finalJob);
      const labResult = await runCreativeLab(brief, { providerId: creativeProviderId });
      const winner = labResult.winner;
      const pattern = PATTERNS.find((p) => p.id === winner.layout.patternId) || null;

      response.creative = {
        creativeId: labResult.creativeId,
        status: labResult.status,
        providerId: creativeProviderId,
        providerStatus: winner.providerStatus,
        patternId: winner.layout.patternId,
        patternLabel: winner.layout.patternLabel,
        officialFamily: pattern ? pattern.officialFamily : null,
        designReview: winner.layout.designReview,
      };

      // A diferencia del pipeline antiguo (que solo sustituía la pieza
      // del maquetador cuando había generación real de OpenAI con
      // éxito), la pieza compuesta de Creative Lab es siempre la mejor
      // disponible — con "simulated" ya pasa por las 4 familias
      // oficiales y el Design Director, es mejor que el render simple
      // del maquetador. Se sustituye siempre que exista.
      if (winner.layout.finalRenderedAssetPath) {
        const buffer = fs.readFileSync(winner.layout.finalRenderedAssetPath);
        const { dimensions } = prepareAssets(brief);
        response.renderedAsset = {
          mimeType: 'image/png',
          base64: buffer.toString('base64'),
          width: dimensions.width,
          height: dimensions.height,
        };
      }
    } catch (err) {
      response.errors.push(`Creative Lab no pudo generar la pieza: ${err.message}`);
    }
  }

  return { statusCode: 200, body: JSON.stringify(response) };
};
