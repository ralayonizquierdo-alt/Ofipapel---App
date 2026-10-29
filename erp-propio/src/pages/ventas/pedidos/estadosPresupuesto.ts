// Estados y motivos de pérdida de los presupuestos (seguimiento).

export type EstadoPresupuesto = 'borrador' | 'enviado' | 'seguimiento' | 'aceptado' | 'perdido'

export const ESTADOS_PRESUPUESTO: { valor: EstadoPresupuesto; texto: string; color: string }[] = [
  { valor: 'borrador', texto: 'Borrador', color: '#6b7280' },
  { valor: 'enviado', texto: 'Enviado', color: '#1d5fb4' },
  { valor: 'seguimiento', texto: 'En seguimiento', color: '#b45309' },
  { valor: 'aceptado', texto: 'Aceptado', color: '#127a12' },
  { valor: 'perdido', texto: 'Perdido', color: '#c42b1c' },
]

export const MOTIVOS_PERDIDA = ['Precio', 'Plazo de entrega', 'Se lo compró a la competencia', 'No contesta', 'Ya no lo necesita', 'Otro']
