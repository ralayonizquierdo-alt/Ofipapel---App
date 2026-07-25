// Orquestador — máquina de estados minúscula que recorre
// core/pipeline-config.js agente a agente, invoca al proveedor de IA justo
// después de "especialista-prompts", y gestiona el bucle de vuelta
// (returnTo) que puede pedir 03-guardian-marca u 08-control-calidad, con
// límite de reintentos para no entrar nunca en un bucle infinito
// silencioso.
//
// Deliberadamente una lista + un bucle + un switch de 3 casos (ok /
// blocked / needs_revision) — sin motor de workflow de terceros, sin
// dependencia npm nueva. Ver ARCHITECTURE.md para el razonamiento.
//
// Este módulo NUNCA conoce detalles de un agente concreto: solo conoce el
// sobre uniforme (AGENT_RESULT_SHAPE) que todos comparten.

const path = require('node:path');
const {
  PIPELINE,
  AGENT_FOLDERS,
  PROVIDER_INVOCATION_AFTER,
  PROVIDER_STATE_KEY,
  MAX_RETRIES_PER_AGENT,
} = require('./pipeline-config.js');
const { assertShape } = require('./contracts/shapes.js');
const { AGENT_RESULT_SHAPE } = require('./contracts/job.contract.js');
const { getProvider } = require('./providers/registry.js');
const { saveJob } = require('./job-store.js');
const { appendEvent } = require('./event-log.js');

const AGENTS_ROOT = path.join(__dirname, '..', 'agents');

function loadAgentModules(agentId) {
  const folder = AGENT_FOLDERS[agentId];
  if (!folder) {
    throw new Error(`Agente desconocido en PIPELINE: "${agentId}" — falta en AGENT_FOLDERS (core/pipeline-config.js)`);
  }
  const dir = path.join(AGENTS_ROOT, folder);
  return {
    service: require(path.join(dir, 'service.js')),
    interface: require(path.join(dir, 'interface.js')),
  };
}

function fail(job, reason) {
  job.status = 'failed_needs_human';
  saveJob(job);
  appendEvent(job.id, { type: 'pipeline_end', status: job.status, reason });
  return job;
}

/**
 * Ejecuta el pipeline completo sobre un Job ya creado (ver
 * core/contracts/job.contract.js createJob). Muta y devuelve el mismo job.
 *
 * @param {object} job
 * @returns {Promise<object>} el job, con status final: 'completed' | 'failed_needs_human'
 */
async function runPipeline(job) {
  appendEvent(job.id, { type: 'pipeline_start', input: job.input });
  saveJob(job);

  while (job.currentAgentIndex < PIPELINE.length) {
    const agentId = PIPELINE[job.currentAgentIndex];
    const { service, interface: agentInterface } = loadAgentModules(agentId);

    appendEvent(job.id, { type: 'agent_start', agentId, index: job.currentAgentIndex });

    let result;
    try {
      result = await service.run(job);
      assertShape(result, AGENT_RESULT_SHAPE, 'result');
      if (result.status === 'ok') {
        assertShape(result.output, agentInterface.OUTPUT_SHAPE, 'result.output');
      }
    } catch (err) {
      appendEvent(job.id, { type: 'agent_error', agentId, error: err.message });
      return fail(job, `Error en "${agentId}": ${err.message}`);
    }

    appendEvent(job.id, {
      type: 'agent_result',
      agentId,
      status: result.status,
      returnTo: result.returnTo,
      reason: result.reason,
    });

    if (result.status === 'ok') {
      job.state[agentId] = result.output;
      job.currentAgentIndex += 1;
      saveJob(job);

      if (agentId === PROVIDER_INVOCATION_AFTER) {
        const providerResult = await invokeProvider(job, result.output);
        if (providerResult.failed) return fail(job, providerResult.reason);
      }
      continue;
    }

    // status: 'blocked' | 'needs_revision' — bucle de vuelta.
    const returnToIndex = PIPELINE.indexOf(result.returnTo);
    if (returnToIndex === -1) {
      return fail(job, `"${agentId}" pidió volver a un agente inválido: "${result.returnTo}"`);
    }

    job.retryCount[result.returnTo] = (job.retryCount[result.returnTo] || 0) + 1;
    if (job.retryCount[result.returnTo] > MAX_RETRIES_PER_AGENT) {
      return fail(job, `Máximo de reintentos (${MAX_RETRIES_PER_AGENT}) superado para "${result.returnTo}" — última razón: ${result.reason}`);
    }

    appendEvent(job.id, {
      type: 'loop_back',
      from: agentId,
      to: result.returnTo,
      retryCount: job.retryCount[result.returnTo],
      reason: result.reason,
    });
    job.currentAgentIndex = returnToIndex;
    saveJob(job);
  }

  job.status = 'completed';
  saveJob(job);
  appendEvent(job.id, { type: 'pipeline_end', status: job.status });
  return job;
}

async function invokeProvider(job, especialistaPromptsOutput) {
  const { providerId, generationRequest } = especialistaPromptsOutput;
  appendEvent(job.id, { type: 'provider_start', providerId });

  try {
    const provider = getProvider(providerId);
    const request = {
      ...generationRequest,
      // Fusiona con cualquier metadata que ya trajera especialista-prompts
      // (nunca la sobrescribe) y añade jobId + la foto real del producto,
      // si el usuario subió una, para que el proveedor pueda usarla en vez
      // de generar un placeholder abstracto (ver simulated.provider.js).
      metadata: {
        ...(generationRequest.metadata || {}),
        jobId: job.id,
        sourceImage: job.input.images[0] || null,
      },
    };
    const genResult = await provider.generate(request);
    job.state[PROVIDER_STATE_KEY] = genResult;
    appendEvent(job.id, { type: 'provider_result', providerId, assetPath: genResult.assetPath });
    saveJob(job);
    return { failed: false };
  } catch (err) {
    appendEvent(job.id, { type: 'provider_error', providerId, error: err.message });
    return { failed: true, reason: `Proveedor "${providerId}" falló: ${err.message}` };
  }
}

module.exports = { runPipeline };
