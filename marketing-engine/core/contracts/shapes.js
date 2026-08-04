// Shape-checker mínimo hecho a mano — sin zod/ajv ni ninguna dependencia npm.
//
// Por qué: en 2026-07-24 no existe ni una sola dependencia de validación de
// esquemas en todo el repo (ni siquiera design-studio/). El volumen de formas
// aquí es pequeño y este es un pipeline interno sin payloads externos poco
// fiables — el caso de uso donde zod/ajv aportan valor real (validar datos
// de terceros, mensajes de error para un cliente HTTP) no aplica todavía.
// Si en el futuro entra un proveedor de IA con payloads complejos y poco
// fiables, esa es la señal concreta para reconsiderar una librería — no antes
// (ver marketing-engine/ARCHITECTURE.md, sección de decisiones).
//
// DSL soportado en una declaración de shape:
//   'string' | 'number' | 'boolean'        primitivos
//   enumOf('a', 'b', 'c')                   uno de estos valores exactos
//   arrayOf(shape)                          array donde cada elemento cumple `shape`
//   maybe(shape)                            el campo puede ser undefined o null
//   { campo: shape, ... }                   objeto anidado (los campos declarados
//                                            son obligatorios salvo que usen maybe();
//                                            campos NO declarados en el value se
//                                            permiten sin más — no es validación
//                                            estricta de "estás de más", solo
//                                            "lo que declaras, lo cumples")

function enumOf(...values) {
  return { __kind: 'enum', values };
}

function arrayOf(itemShape) {
  return { __kind: 'array', itemShape };
}

function maybe(innerShape) {
  return { __kind: 'maybe', innerShape };
}

function describe(shape) {
  if (typeof shape === 'string') return shape;
  if (shape && shape.__kind === 'enum') return `enum(${shape.values.join(' | ')})`;
  if (shape && shape.__kind === 'array') return `array<${describe(shape.itemShape)}>`;
  if (shape && shape.__kind === 'maybe') return `maybe<${describe(shape.innerShape)}>`;
  if (shape && typeof shape === 'object') return 'object';
  return String(shape);
}

/**
 * Valida `value` contra `shape`. Lanza Error con un mensaje en español y el
 * path exacto del campo que incumple si algo no encaja. No devuelve nada si
 * todo es correcto (igual que node:assert).
 *
 * @param {*} value
 * @param {*} shape
 * @param {string} [path]
 */
function assertShape(value, shape, path = 'root') {
  if (typeof shape === 'string') {
    assertPrimitive(value, shape, path);
    return;
  }

  if (shape && shape.__kind === 'enum') {
    if (!shape.values.includes(value)) {
      throw new Error(
        `Contrato incumplido en "${path}": se esperaba uno de [${shape.values.join(', ')}], se recibió ${JSON.stringify(value)}`
      );
    }
    return;
  }

  if (shape && shape.__kind === 'array') {
    if (!Array.isArray(value)) {
      throw new Error(`Contrato incumplido en "${path}": se esperaba un array, se recibió ${typeof value}`);
    }
    value.forEach((item, i) => assertShape(item, shape.itemShape, `${path}[${i}]`));
    return;
  }

  if (shape && shape.__kind === 'maybe') {
    if (value === undefined || value === null) return;
    assertShape(value, shape.innerShape, path);
    return;
  }

  if (shape && typeof shape === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Contrato incumplido en "${path}": se esperaba un objeto, se recibió ${JSON.stringify(value)}`);
    }
    for (const key of Object.keys(shape)) {
      if (!(key in value) && !(shape[key] && shape[key].__kind === 'maybe')) {
        throw new Error(`Contrato incumplido en "${path}.${key}": campo obligatorio ausente (se esperaba ${describe(shape[key])})`);
      }
      assertShape(value[key], shape[key], `${path}.${key}`);
    }
    return;
  }

  throw new Error(`Shape mal declarado en "${path}": ${JSON.stringify(shape)}`);
}

function assertPrimitive(value, kind, path) {
  const actual = typeof value;
  if (actual !== kind) {
    throw new Error(`Contrato incumplido en "${path}": se esperaba ${kind}, se recibió ${actual} (${JSON.stringify(value)})`);
  }
}

module.exports = { assertShape, enumOf, arrayOf, maybe, describe };
