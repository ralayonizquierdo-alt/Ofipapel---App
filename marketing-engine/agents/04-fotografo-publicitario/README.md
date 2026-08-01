# Agente: Fotógrafo Publicitario

## Responsabilidad única

Genera únicamente las **instrucciones** (ficha técnica: ángulo, fondo,
iluminación) para obtener fotografías profesionales del producto.

## Límites explícitos

- **Nunca modifica el producto.**
- **Nunca inventa piezas, botones ni accesorios.**
- **Nunca altera los colores reales.**
- **Nunca genera la imagen** — eso es `05-especialista-prompts` (convierte
  la ficha en prompt) + el proveedor de IA.

## Entrada

`job.input` + `job.state['director-arte']` + `job.state['guardian-marca']`
(solo se llega aquí si el Guardián de Marca aprobó).

## Salida (`job.state['fotografo-publicitario']`)

```json
{
  "photoSpec": {
    "angle": "frontal, ligeramente en picado (15°)",
    "background": "fondo blanco de estudio, sin distracciones",
    "lighting": "luz suave difusa, sin sombras duras, resalta el producto",
    "notes": "Producto: \"Ventilador Nebulizador MUVIP 75W\". ..."
  },
  "fidelityRules": [
    "No modificar el producto real: mismas proporciones, mismos materiales.",
    "No inventar piezas, botones, etiquetas ni accesorios que el producto no tiene.",
    "No alterar los colores reales del producto.",
    "Máxima fidelidad fotográfica — esto es publicidad de producto real, no arte conceptual."
  ]
}
```

## Estado actual

Simulado — ficha técnica por defecto según el layout (`config.js`). Prompt
real ya redactado en `prompts/photo-spec.prompt.md`.
