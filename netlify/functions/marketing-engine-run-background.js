// Versión "Background Function" de marketing-engine-run.js — mismo pipeline
// (Marketing Engine → Creative Lab → proveedor real u OpenAI simulado),
// pero invocada de forma asíncrona: Netlify responde 202 al cliente de
// inmediato y esta función sigue corriendo hasta 15 minutos en vez de los
// ~26s que permite una función síncrona normal (DT-17,
// `.claude/rax/DEUDA_TECNICA.md` — una generación real con OpenAI + render
// de Chromium tarda 35-40s, más que ese límite; el proxy síncrono corta la
// conexión al cliente aunque la función termine bien por detrás).
//
// El cliente nunca ve el `return` de esta función (Netlify no espera a que
// termine para responder 202) — el resultado se entrega vía Netlify Blobs,
// bajo la clave `trackingId` que el propio cliente genera y envía en el
// body. marketing-engine-status.js lee esa misma clave para servir el
// resultado cuando esté listo. Ver INTEGRATION.md para el contrato
// completo de los dos endpoints.

const fs = require('node:fs');
const path = require('node:path');
const { connectLambda, getStore } = require('@netlify/blobs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STORE_NAME = 'marketing-engine-jobs';

exports.handler = async (event) => {
  connectLambda(event);
  const store = getStore(STORE_NAME);

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    console.error('marketing-engine-run-background: JSON inválido:', err.message);
    return;
  }

  const trackingId = payload.trackingId;
  if (!trackingId || typeof trackingId !== 'string') {
    // Sin trackingId no hay dónde escribir el resultado — el cliente no
    // podrá encontrarlo nunca. Se registra en logs de la función (única
    // vía de diagnóstico posible, el cliente ya recibió su 202).
    console.error('marketing-engine-run-background: falta trackingId en el body.');
    return;
  }

  try {
    await store.setJSON(trackingId, { status: 'running', startedAt: new Date().toISOString() });
  } catch (err) {
    // Si Netlify Blobs ya falla en esta primera escritura (límite de uso
    // de la cuenta, incidencia del servicio), la escritura final fallará
    // igual — mejor no gastar 35-40s de pipeline + una llamada real de
    // pago a OpenAI para un resultado que nunca se va a poder leer.
    console.error('marketing-engine-run-background: Blobs no disponible, abortando:', err.message);
    return;
  }

  if (!process.env.MARKETING_ENGINE_JOBS_DIR) {
    process.env.MARKETING_ENGINE_JOBS_DIR = path.join(
      process.env.TMPDIR || '/tmp',
      'marketing-engine-jobs'
    );
  }
  // Sin esto, learning-engine/store.js cae a su ruta por defecto
  // (junto al propio módulo, dentro del paquete de la función) — de solo
  // lectura en Lambda real (`/var/task`). El registro de aprendizaje no
  // sobrevive más allá del contenedor de todas formas (documentado en la
  // cabecera de store.js, limitación conocida hasta migrar a un datastore
  // real) — esto solo evita el ENOENT, no cambia esa limitación.
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
    await store.setJSON(trackingId, {
      status: 'failed_needs_human',
      errors: [`Brief inválido: ${err.message}`],
    });
    return;
  }

  let finalJob;
  try {
    finalJob = await runPipeline(job);
  } catch (err) {
    await store.setJSON(trackingId, {
      jobId: job.id,
      status: 'failed_needs_human',
      input,
      trace: readEvents(job.id),
      errors: [`Fallo inesperado del pipeline: ${err.message}`],
    });
    return;
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
  // El cerebro real: Marketing Engine → Creative Lab. Mismo bloque que
  // marketing-engine-run.js (DT-15) — ver ese fichero para el comentario
  // completo, no se duplica aquí.
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
      // testMode: 'fotografia-base' — experimento del propietario (ver
      // master-prompt-composer/base-photography.js). Opcional, ausente
      // por defecto: sin este campo en el body, cero cambio de
      // comportamiento respecto a antes de este bloque.
      //
      // productPhotoPath: modo calidad absoluta (2026-08-02) — si el
      // cliente manda una foto real en payload.images[0] (ruta o
      // data-URL, mismo campo que ya existía en el contrato del job),
      // se usa como referencia real para el proveedor (openai-images
      // ahora soporta /v1/images/edits). Sin imágenes en el payload,
      // undefined — cero cambio de comportamiento respecto a antes.
      const labResult = await runCreativeLab(brief, {
        providerId: creativeProviderId,
        testMode: payload.testMode,
        productPhotoPath: finalJob.input.images && finalJob.input.images[0],
      });
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
        providerRawResponse: winner.providerRawResponse,
        // Diagnóstico "modo calidad absoluta": ya se calculaba, solo se
        // expone — sin esto no hay forma de saber qué escenario/estilo/
        // iluminación ganó realmente sin adivinarlo mirando los píxeles.
        composedPrompt: winner.composedPrompt.fullPrompt,
      };

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

      // Foto cruda del proveedor, ANTES de Layout Composer (que no se
      // toca en el experimento "Fotografía Base" — sigue componiendo
      // título/CTA/etc. encima igual que siempre). Se expone solo para
      // poder inspeccionar la fotografía en sí; no sustituye renderedAsset.
      if (winner.assetPath) {
        try {
          const rawBuffer = fs.readFileSync(winner.assetPath);
          response.creative.rawPhotoAsset = { mimeType: 'image/png', base64: rawBuffer.toString('base64') };
        } catch (err) {
          response.errors.push(`No se pudo leer la foto cruda del proveedor: ${err.message}`);
        }
      }
    } catch (err) {
      response.errors.push(`Creative Lab no pudo generar la pieza: ${err.message}`);
    }
  }

  await store.setJSON(trackingId, response);
};
