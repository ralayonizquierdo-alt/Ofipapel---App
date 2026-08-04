// Icon Library — un set pequeño y disciplinado de iconos de línea,
// pensado para comportarse como documentación técnica premium (Apple,
// Bosch, Sony, JBL, Logitech, Brother): mismo viewBox (24×24), mismo
// grosor de trazo, mismo estilo (línea, sin relleno, extremos
// redondeados) para TODOS — el grosor/estilo se aplica UNA VEZ en
// render-helpers.js#iconRowMarkup, nunca por icono, así que es
// estructuralmente imposible que dos iconos salgan con distinto grosor.
//
// Cada icono declara `keywords` en español — select-icons.js solo lo
// selecciona si esas palabras aparecen de verdad en el texto del brief
// (descripción/beneficios/argumentos de venta). Nunca se inventa un
// icono sin señal real detrás (mismo principio de "no fabricar datos de
// negocio" ya aplicado al precio/contacto en un sprint anterior).

const ICONS = [
  {
    id: 'power',
    label: 'Potencia',
    keywords: ['potencia', 'watt', ' w.', 'motor'],
    markup: '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/>',
  },
  {
    id: 'water-drop',
    label: 'Nebulización',
    keywords: ['niebla', 'nebuliza', 'agua', 'humedad', 'vapor'],
    markup: '<path d="M12 2s7 8.5 7 13a7 7 0 0 1-14 0c0-4.5 7-13 7-13z"/>',
  },
  {
    id: 'remote-control',
    label: 'Mando a distancia',
    keywords: ['mando', 'control remoto', 'remoto'],
    markup: '<rect x="7" y="2" width="10" height="20" rx="3"/><circle cx="12" cy="7" r="1.4"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>',
  },
  {
    id: 'timer',
    label: 'Temporizador',
    keywords: ['temporizador', 'programable', 'timer'],
    markup: '<circle cx="12" cy="13" r="8"/><line x1="12" y1="13" x2="12" y2="9"/><line x1="12" y1="13" x2="15" y2="15"/><line x1="9" y1="2" x2="15" y2="2"/>',
  },
  {
    id: 'wind',
    label: 'Oscilación / corriente de aire',
    keywords: ['oscilación', 'oscilante', 'corriente de aire', 'ventilador'],
    markup: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 18h8a2.5 2.5 0 1 0-2.5-2.5"/>',
  },
  {
    id: 'speed-dial',
    label: 'Velocidades',
    keywords: ['velocidad', 'velocidades', 'modos'],
    markup: '<circle cx="12" cy="14" r="8"/><line x1="12" y1="14" x2="16" y2="10"/><line x1="8" y1="4" x2="8.6" y2="6"/><line x1="16" y1="4" x2="15.4" y2="6"/>',
  },
  {
    id: 'shield',
    label: 'Garantía',
    keywords: ['garantía', 'garantia', 'protección'],
    markup: '<path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3z"/>',
  },
  {
    id: 'leaf',
    label: 'Eficiencia',
    keywords: ['eco', 'ahorro energético', 'sostenib', 'bajo consumo'],
    markup: '<path d="M4 20c8 0 14-6 16-16-10 2-16 8-16 16z"/><path d="M4 20c3-3 5-7 6-11"/>',
  },
  {
    id: 'ruler',
    label: 'Dimensiones',
    keywords: ['diámetro', 'altura', 'cm', 'ajustable', 'tamaño'],
    markup: '<rect x="2" y="8" width="20" height="8" rx="1"/><line x1="6" y1="8" x2="6" y2="11"/><line x1="10" y1="8" x2="10" y2="12"/><line x1="14" y1="8" x2="14" y2="11"/><line x1="18" y1="8" x2="18" y2="12"/>',
  },
  {
    id: 'weight',
    label: 'Peso',
    keywords: [' kg', 'peso'],
    markup: '<circle cx="12" cy="8" r="5"/><path d="M8.5 12.5 5 22h14l-3.5-9.5"/>',
  },
  {
    id: 'plug',
    label: 'Alimentación',
    keywords: ['220v', '240v', 'tensión', 'enchufe', 'toma de corriente'],
    markup: '<path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0V8z"/><path d="M12 18v4"/>',
  },
  {
    id: 'checkmark',
    label: 'Fácil de usar',
    keywords: ['fácil de usar', 'sencillo', 'incluido'],
    markup: '<polyline points="4 12 10 18 20 6"/>',
  },
  {
    id: 'star',
    label: 'Calidad',
    keywords: ['calidad', 'premium', 'valorad'],
    markup: '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.2l7.1-.6L12 2z"/>',
  },
  {
    id: 'quiet',
    label: 'Silencioso',
    keywords: ['silencio', 'silencioso', 'bajo ruido'],
    markup: '<path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  },
];

module.exports = { ICONS };
