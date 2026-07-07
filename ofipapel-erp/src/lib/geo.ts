/** Coordenadas reales aproximadas de las zonas comerciales, y a qué isla pertenece cada una. */
export const ZONE_COORDS: Record<string, { lat: number; lon: number }> = {
  'Santa Cruz de Tenerife': { lat: 28.4636, lon: -16.2518 },
  'La Laguna': { lat: 28.4874, lon: -16.3159 },
  'Sur de Tenerife': { lat: 28.05, lon: -16.73 },
  'Las Palmas de Gran Canaria': { lat: 28.1235, lon: -15.4366 },
  Telde: { lat: 27.9977, lon: -15.4167 },
  Lanzarote: { lat: 29.0469, lon: -13.5899 },
  Fuerteventura: { lat: 28.416, lon: -14.0053 },
}

export type IslaNombre = 'Tenerife' | 'Gran Canaria' | 'Lanzarote' | 'Fuerteventura'

export const ISLA_POR_ZONA: Record<string, IslaNombre> = {
  'Santa Cruz de Tenerife': 'Tenerife',
  'La Laguna': 'Tenerife',
  'Sur de Tenerife': 'Tenerife',
  'Las Palmas de Gran Canaria': 'Gran Canaria',
  Telde: 'Gran Canaria',
  Lanzarote: 'Lanzarote',
  Fuerteventura: 'Fuerteventura',
}

/** Bounding box real aproximado (lon/lat) de cada isla, para poder encuadrar un mapa zoom por isla. */
export const ISLAND_BOUNDS: Record<IslaNombre, { lonMin: number; lonMax: number; latMin: number; latMax: number }> = {
  Tenerife: { lonMin: -16.95, lonMax: -16.1, latMin: 27.95, latMax: 28.62 },
  'Gran Canaria': { lonMin: -15.87, lonMax: -15.25, latMin: 27.72, latMax: 28.2 },
  Lanzarote: { lonMin: -13.9, lonMax: -13.4, latMin: 28.83, latMax: 29.25 },
  Fuerteventura: { lonMin: -14.65, lonMax: -13.85, latMin: 28.02, latMax: 28.8 },
}
