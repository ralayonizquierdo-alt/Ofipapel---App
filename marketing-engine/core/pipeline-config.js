// ÚNICA fuente de verdad del orden de ejecución del pipeline. Los prefijos
// numéricos en los nombres de carpeta (agents/01-.../08-...) son solo para
// que el orden se vea con un `ls` — si algún día divergen, ESTE fichero
// manda, no los nombres de carpeta.
//
// Nota de diseño sobre el orden: el diagrama de flujo del propietario no
// menciona explícitamente dónde va "Copywriter" (solo aparece en la lista
// de 8 agentes, no en el diagrama de flechas). Se decidió colocarlo antes
// de "maquetador" porque el propio Maquetador se define como "recibe
// imágenes, fondos, ELEMENTOS" — el copy es uno de esos elementos y no
// depende de nada que produzca el Maquetador. Ver marketing-engine/agents/
// 06-copywriter/interface.js y ARCHITECTURE.md para el razonamiento
// completo.

const PIPELINE = [
  'director-creativo',
  'director-arte',
  'guardian-marca',
  'fotografo-publicitario',
  'especialista-prompts',
  'copywriter',
  'maquetador',
  'control-calidad',
];

// Mapeo agentId (usado en PIPELINE y en el sobre AGENT_RESULT) → nombre de
// carpeta real bajo marketing-engine/agents/.
const AGENT_FOLDERS = {
  'director-creativo': '01-director-creativo',
  'director-arte': '02-director-arte',
  'guardian-marca': '03-guardian-marca',
  'fotografo-publicitario': '04-fotografo-publicitario',
  'especialista-prompts': '05-especialista-prompts',
  copywriter: '06-copywriter',
  maquetador: '07-maquetador',
  'control-calidad': '08-control-calidad',
};

// Justo después de completar este agente, el orquestador invoca el
// proveedor de IA (core/providers/registry.js) usando el
// `generationRequest`/`providerId` que produjo, y guarda el resultado en
// job.state['proveedor-ia'] antes de continuar con el siguiente agente del
// pipeline. Así el diagrama del propietario
// (Especialista en Prompts → Proveedor de IA → Maquetador) queda
// representado sin que el proveedor sea un agente con carpeta propia.
const PROVIDER_INVOCATION_AFTER = 'especialista-prompts';
const PROVIDER_STATE_KEY = 'proveedor-ia';

// Límite de reintentos por agente antes de que el orquestador se rinda y
// marque el job como failed_needs_human — nunca un bucle infinito
// silencioso.
const MAX_RETRIES_PER_AGENT = 2;

module.exports = {
  PIPELINE,
  AGENT_FOLDERS,
  PROVIDER_INVOCATION_AFTER,
  PROVIDER_STATE_KEY,
  MAX_RETRIES_PER_AGENT,
};
