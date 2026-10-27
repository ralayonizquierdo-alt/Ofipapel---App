// Shaders de NEXA (WebGL2 / GLSL ES 3.00).
//
// Cada partícula se calcula entera en la GPU: el procesador solo actualiza unos pocos
// «uniforms» por fotograma (tiempo, pesos de los estados, nivel de voz, formación…).
// Coordenadas: espacio normalizado de la cara, -1..1, y hacia arriba.
//   ojos ≈ (±0.227, 0.179) · boca ≈ (0, -0.228) · barbilla ≈ (0, -0.43)

export const VERTEX = /* glsl */ `#version 300 es
precision highp float;

in vec2 a_pos;      // destino de la partícula en el rostro
in vec4 a_props;    // tamaño, semilla, profundidad, tono (0 brillo · 1 sombra)
in vec4 a_color;    // color (rgb) y alfa del punto según la referencia

uniform float u_time;
uniform vec2  u_canvas;     // píxeles físicos del lienzo
uniform float u_scale;      // fracción del lienzo que ocupa el rostro
uniform float u_pointPx;    // tamaño base del punto en px físicos
uniform vec4  u_states;     // escuchando, pensando, hablando, alerta (0..1)
uniform float u_level;      // nivel de voz 0..1 (genérico o audio real)
uniform float u_form;       // 0 = nube dispersa, 1 = NEXA formada
uniform float u_blink;      // 0 abierto, 1 cerrado
uniform vec2  u_gaze;       // desplazamiento de la mirada (-1..1)
uniform float u_glow;       // 0..1

out float v_bright;
out float v_alpha;
out float v_core;           // fracción del sprite que es núcleo (el resto es halo)
out float v_tono;
out vec3 v_color;
out float v_alfaRef;

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float gauss2(vec2 p, vec2 c, vec2 r) {
  vec2 d = (p - c) / r;
  return exp(-dot(d, d));
}

void main() {
  float size  = a_props.x;
  float seed  = a_props.y;
  float depth = a_props.z;
  float tono  = a_props.w;
  float t = u_time;
  vec2 p = a_pos;

  float listening = u_states.x;
  float thinking  = u_states.y;
  float speaking  = u_states.z;
  float alert     = u_states.w;

  // --- Zonas del rostro (pesos suaves, sin máscaras duras)
  float eyes  = gauss2(vec2(abs(p.x), p.y), vec2(0.227, 0.179), vec2(0.115, 0.06));
  float mouth = gauss2(p, vec2(0.0, -0.228), vec2(0.17, 0.075));
  float jaw   = smoothstep(-0.22, -0.48, p.y) * exp(-pow(p.x / 0.32, 2.0));
  float cheek = gauss2(vec2(abs(p.x), p.y), vec2(0.27, -0.12), vec2(0.11, 0.1));

  // --- Reposo: microvibración y respiración digital (siempre activas)
  float br = 1.0 + 0.006 * sin(t * 0.8);
  p *= br;
  p += 0.0014 * vec2(sin(t * 0.73 + seed * 61.0), cos(t * 0.61 + seed * 47.0));
  float bright = 0.82 + 0.18 * sin(t * 1.3 + seed * 40.0);

  // --- Parpadeo: los propios puntos del ojo se aprietan hacia la línea del párpado
  p.y = mix(p.y, 0.179 + (p.y - 0.179) * 0.08, u_blink * eyes);
  p += u_gaze * 0.012 * eyes;

  // --- Escuchando: ondas que suben desde abajo y reaccionan al nivel del micrófono
  float rL = distance(p, vec2(0.0, -0.95));
  float waveL = sin(rL * 22.0 - t * 5.5);
  float envL = listening * (0.35 + 0.65 * u_level);
  p += normalize(p - vec2(0.0, -0.95) + 1e-4) * 0.006 * waveL * envL;
  bright += 0.35 * max(waveL, 0.0) * envL;

  // --- Pensando: bandas de información que recorren el rostro y pequeños reagrupamientos
  float band = fract(p.y * 0.55 - t * 0.32 + 0.12 * sin(p.x * 6.0 + t));
  float bandW = smoothstep(0.1, 0.0, abs(band - 0.5));
  float band2 = smoothstep(0.06, 0.0, abs(fract(p.x * 0.7 + t * 0.21) - 0.5));
  vec2 jitter = vec2(sin(seed * 91.0 + t * 2.3), cos(seed * 57.0 + t * 1.9));
  p += thinking * (0.012 * bandW + 0.005 * band2) * jitter;
  bright += thinking * (0.55 * bandW + 0.25 * band2);

  // --- Hablando: la nube de la boca se abre y se recoge; la mandíbula acompaña
  float open = speaking * u_level;
  float upper = step(-0.228, a_pos.y);
  p.y += mouth * open * mix(-0.034, 0.012, upper);
  p.y -= jaw * open * 0.016;
  p.x *= 1.0 - 0.07 * open * mouth;
  p += normalize(vec2(sign(p.x) + 1e-4, 0.15)) * 0.004 * open * cheek;
  bright += 0.5 * open * mouth + 0.12 * speaking * u_level;

  // --- Alerta: pulso suave y una onda que sale del centro
  float rA = length(a_pos);
  float ring = exp(-pow((rA - fract(t * 0.55) * 1.7) * 7.0, 2.0));
  p += normalize(a_pos + 1e-4) * 0.01 * ring * alert;
  bright += alert * (0.22 + 0.22 * sin(t * 3.6) + 0.7 * ring);

  // --- Formación / disolución: desorden -> organización -> NEXA
  float h1 = hash(seed * 13.7);
  float h2 = hash(seed * 71.3);
  float ang = seed * 6.2831 * 9.0 + t * (0.06 + 0.1 * h2);
  vec2 lejos = a_pos * (1.25 + 0.6 * h1) + vec2(cos(ang), sin(ang)) * (0.35 + 0.9 * h2);
  float retraso = 0.55 * h1 + 0.25 * (1.0 - depth);
  float k = clamp((u_form * 1.8 - retraso) / 0.85, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);
  // un ligero remolino mientras viaja
  vec2 perp = vec2(-(p.y - lejos.y), p.x - lejos.x);
  vec2 pos = mix(lejos, p, k) + perp * 0.18 * k * (1.0 - k);
  float alpha = mix(0.28, 1.0, k) * smoothstep(0.0, 0.08, u_form + 0.02);

  // --- Proyección al lienzo (el rostro centrado, cuadrado)
  float aspect = u_canvas.x / u_canvas.y;
  vec2 clip = pos * u_scale;
  clip.x /= max(aspect, 1.0);
  clip.y *= min(aspect, 1.0);
  gl_Position = vec4(clip, 0.0, 1.0);

  float halo = 1.0 + 2.2 * u_glow;
  float px = u_pointPx * size * mix(0.8, 1.0, k);
  gl_PointSize = max(1.5, px * halo);
  v_core = 1.0 / halo;
  v_bright = bright * (0.85 + 0.25 * depth);
  v_tono = tono;
  v_color = a_color.rgb;
  v_alfaRef = a_color.a;
  v_alpha = alpha;
}
`

export const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in float v_bright;
in float v_alpha;
in float v_core;
in float v_tono;
in vec3 v_color;
in float v_alfaRef;

uniform float u_light;    // 0 = fondo claro, 1 = fondo oscuro
uniform float u_glow;
uniform float u_opacity;
uniform float u_boost;    // intensidad del azul

out vec4 color;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;     // 0 centro .. 1 borde del sprite
  float r = d / v_core;                            // 0..1 dentro del núcleo
  float core = 1.0 - smoothstep(0.86, 1.0, r);
  // Borde algo más oscuro en fondo claro: separa el punto del blanco sin ninguna superficie.
  float rim = smoothstep(0.55, 0.9, r) * core;
  float glow = (1.0 - smoothstep(v_core, 1.0, d)) * exp(-pow(d * 1.6, 2.0)) * u_glow;

  // Color real del punto en la referencia. Sobre fondo oscuro se aclara para que no se pierda.
  vec3 claro = v_color * mix(1.0, 0.5, smoothstep(0.25, 1.0, v_tono));
  vec3 oscuro = v_color * mix(1.2, 0.72, v_tono) + vec3(0.04, 0.10, 0.16);
  vec3 nucleo = mix(claro, oscuro, u_light);
  vec3 borde  = mix(v_color * 0.7, vec3(0.20, 0.55, 1.00), u_light);
  float b = clamp(v_bright * u_boost, 0.0, 1.8);
  // Cada punto es una pequeña esfera: brillo arriba a la izquierda y borde más oscuro.
  vec2 q = (gl_PointCoord - 0.5) * 2.0 / v_core;
  float esfera = clamp(1.0 - dot(q - vec2(-0.32, -0.32), q - vec2(-0.32, -0.32)) * 1.4, 0.0, 1.0);
  vec3 c = mix(nucleo, borde, rim * mix(0.35, 0.2, u_light)) * mix(0.85, 1.0, min(b, 1.0));
  c = mix(c, vec3(0.9, 0.96, 1.0), esfera * esfera * mix(0.22, 0.4, u_light));
  c += vec3(0.55, 0.8, 1.0) * max(b - 1.0, 0.0) * 0.6;   // destellos al pulsar/pensar

  float aCore = core * clamp(0.75 + 0.4 * b, 0.0, 1.0);
  float aGlow = glow * mix(0.18, 0.55, u_light) * clamp(b, 0.0, 1.5);
  vec3 glowCol = mix(vec3(0.15, 0.45, 1.0), vec3(0.35, 0.7, 1.0), u_light);

  float a = clamp(aCore + aGlow * (1.0 - aCore), 0.0, 1.0) * v_alpha * u_opacity * mix(v_alfaRef, 1.0, u_light * 0.5);
  if (a < 0.003) discard;
  vec3 rgb = (c * aCore + glowCol * aGlow * (1.0 - aCore)) / max(aCore + aGlow * (1.0 - aCore), 1e-4);
  color = vec4(rgb * a, a);   // alfa premultiplicado: transparencia real
}
`
