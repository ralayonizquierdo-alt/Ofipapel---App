// Puente entre app.html y marketing-engine/ — crea un Job del Motor de
// Marketing a partir del formulario "Nueva Campaña" del Almacén, ejecuta
// el pipeline completo de 8 agentes, y devuelve el resultado (incluida la
// pieza final en base64, porque esta app no tiene backend/CDN propio: todo
// el estado de app.html vive en memoria del navegador, igual que el resto
// de datos de la app hoy).
//
// Variables de entorno: ninguna necesaria para el proveedor "simulated"
// (el único activo). Ver marketing-engine/core/providers/README.md para
// cuando se conecte un proveedor real.
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

const REPO_ROOT = path.resolve(__dirname, '..', '..');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
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

  return { statusCode: 200, body: JSON.stringify(response) };
};
