/**
 * La flota de Ofipapel reparte únicamente en Tenerife, así que todo el módulo de
 * geolocalización se centra en esta isla (nada de archipiélago completo).
 */

export const TENERIFE_ZONE_COORDS: Record<string, { lat: number; lon: number }> = {
  'Santa Cruz de Tenerife': { lat: 28.4636, lon: -16.2518 },
  'La Laguna': { lat: 28.4874, lon: -16.3159 },
  'Sur de Tenerife': { lat: 28.05, lon: -16.73 },
}

export const TENERIFE_ZONES = Object.keys(TENERIFE_ZONE_COORDS)

export const TENERIFE_BOUNDS = { lonMin: -16.95, lonMax: -16.1, latMin: 27.95, latMax: 28.62 }

/** Contorno aproximado de la costa de Tenerife (lon, lat), en sentido horario desde Anaga. */
export const TENERIFE_COAST: [number, number][] = [
  [-16.15, 28.57], // Punta de Anaga (NE)
  [-16.2, 28.53],
  [-16.25, 28.47], // Santa Cruz
  [-16.32, 28.4],
  [-16.37, 28.35], // Candelaria
  [-16.42, 28.31], // Güímar
  [-16.55, 28.15],
  [-16.68, 27.97], // Punta de Rasca (S)
  [-16.72, 28.05], // Los Cristianos
  [-16.75, 28.1], // Adeje
  [-16.8, 28.2], // Alcalá
  [-16.84, 28.24], // Los Gigantes
  [-16.87, 28.3],
  [-16.92, 28.35], // Punta de Teno (NW)
  [-16.85, 28.37],
  [-16.77, 28.37], // Garachico
  [-16.71, 28.35], // Icod de los Vinos
  [-16.55, 28.42], // Puerto de la Cruz
  [-16.45, 28.45],
  [-16.32, 28.58], // Punta del Hidalgo
  [-16.15, 28.57],
]

export const TENERIFE_ROADS: { nombre: string; puntos: [number, number][] }[] = [
  {
    nombre: 'TF-1 (Autopista del Sur)',
    puntos: [
      [-16.25, 28.47],
      [-16.37, 28.35],
      [-16.42, 28.31],
      [-16.55, 28.15],
      [-16.68, 27.99],
      [-16.72, 28.05],
    ],
  },
  {
    nombre: 'TF-5 (Autopista del Norte)',
    puntos: [
      [-16.25, 28.47],
      [-16.32, 28.5],
      [-16.45, 28.45],
      [-16.55, 28.42],
      [-16.71, 28.35],
      [-16.77, 28.37],
    ],
  },
  {
    nombre: 'TF-24 (subida al Teide)',
    puntos: [
      [-16.32, 28.5],
      [-16.45, 28.35],
      [-16.55, 28.24],
    ],
  },
]

export const TENERIFE_TOWNS: { nombre: string; lat: number; lon: number }[] = [
  { nombre: 'Santa Cruz de Tenerife', lat: 28.4636, lon: -16.2518 },
  { nombre: 'La Laguna', lat: 28.4874, lon: -16.3159 },
  { nombre: 'Puerto de la Cruz', lat: 28.4135, lon: -16.5466 },
  { nombre: 'La Orotava', lat: 28.3894, lon: -16.5225 },
  { nombre: 'Los Cristianos', lat: 28.0525, lon: -16.7178 },
  { nombre: 'Candelaria', lat: 28.3556, lon: -16.3667 },
]
