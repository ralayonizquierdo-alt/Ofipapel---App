/** La flota de Ofipapel reparte únicamente en Tenerife, así que la ubicación de cada vehículo cae siempre dentro de la isla. */
export const TENERIFE_ZONE_COORDS: Record<string, { lat: number; lon: number }> = {
  'Santa Cruz de Tenerife': { lat: 28.4636, lon: -16.2518 },
  'La Laguna': { lat: 28.4874, lon: -16.3159 },
  'Sur de Tenerife': { lat: 28.05, lon: -16.73 },
}

export const TENERIFE_ZONES = Object.keys(TENERIFE_ZONE_COORDS)
