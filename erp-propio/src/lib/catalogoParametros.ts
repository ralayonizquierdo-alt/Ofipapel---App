// Catálogo de parámetros de Avatar (Archivo → Parámetros), con el mismo árbol que Utilidades →
// Parámetros de GeminisWin: Locales, Generales, TPV, Compras, Almacén, Contadores, Formatos
// Numéricos y Definición de Impuestos, cada uno con sus pestañas.
//
// Aquí solo se describe cada parámetro (sección, pestaña, tipo, valor por defecto). Los valores
// están en la base de datos: `parametro` (el de toda la empresa) y `parametro_empleado` (el de un
// empleado, que manda sobre el general; lo que en GeminisWin eran los «Parámetros Locales» de cada
// equipo). Se leen con src/lib/parametros.ts (valorParametro / useParametro).
//
// `usa`: dónde lo aplica ya el programa. Sin `usa`, el valor se guarda pero todavía no lo usa
// ninguna pantalla (la pantalla lo marca con un punto gris).

import { coloresPorDefecto } from './coloresPantallas'
import type { BloqueOperativa } from '../components/gw/GwOperativa'

export type TipoParametro = 'bool' | 'num' | 'texto' | 'opcion' | 'tienda' | 'almacen' | 'colores'

export interface DefParametro {
  clave: string
  etiqueta: string
  tipo: TipoParametro
  defecto: unknown
  opciones?: { valor: string; texto: string }[]
  /** Se puede dar un valor distinto a cada empleado. */
  porEmpleado?: boolean
  /** Mínimo y máximo (numéricos). */
  min?: number
  max?: number
  ayuda?: string
  /** Dónde lo usa ya el programa (si falta: guardado, aún sin usar). */
  usa?: string
  /** Valor que tenía en GeminisWin (cuando se conoce). */
  gw?: string
}

export interface PestanaParametros {
  clave: string
  titulo: string
  parametros: DefParametro[]
  /** Pestaña que no es una lista de parámetros sino una pantalla propia. */
  especial?: 'contadores' | 'impuestos' | 'carpetas' | 'colores' | 'operativa'
  /** Contenido de la pestaña «Operativa» (cómo se usa la sección). */
  operativa?: BloqueOperativa[]
}

export interface SeccionParametros {
  clave: string
  titulo: string
  icono: string
  pestanas: PestanaParametros[]
}

const PANTALLAS_INICIO = [
  { valor: '/', texto: 'Escritorio' },
  { valor: '/resumen', texto: 'Panel de Control' },
  { valor: '/tpv', texto: 'TPV / Ventas' },
  { valor: '/pedidos', texto: 'Pedidos de clientes' },
  { valor: '/clientes', texto: 'Clientes' },
  { valor: '/articulos', texto: 'Artículos' },
  { valor: '/pedidos-proveedor', texto: 'Pedidos a proveedores' },
  { valor: '/caja', texto: 'Caja' },
]

/** Colores de partida de las pantallas (los de las secciones de siempre). */
export const COLORES_DEFECTO = coloresPorDefecto()

export const SECCIONES_PARAMETROS: SeccionParametros[] = [
  {
    clave: 'locales',
    titulo: 'Parámetros Locales',
    icono: '🖥️',
    pestanas: [
      {
        clave: 'iniciales',
        titulo: 'Parámetros Iniciales',
        parametros: [
          {
            clave: 'local.tienda_defecto',
            etiqueta: 'Tienda por defecto',
            tipo: 'tienda',
            defecto: null,
            porEmpleado: true,
            usa: 'Tienda con la que se empieza a trabajar si en el navegador no hay otra elegida',
            gw: 'Luis: 41 Ofi T-1 (Ofic.Direccion)',
          },
          {
            clave: 'local.turnos',
            etiqueta: 'Gestión de turnos',
            tipo: 'opcion',
            defecto: 'no',
            opciones: [
              { valor: 'no', texto: 'Sin turnos' },
              { valor: 'equipo', texto: 'Un turno diferente por cada equipo' },
              { valor: 'tienda', texto: 'El mismo turno para todos los equipos de una tienda' },
            ],
            gw: 'Sin turnos',
          },
          { clave: 'local.forzar_apertura_caja', etiqueta: 'Forzar que siempre haya aperturas y cierres de caja', tipo: 'bool', defecto: true, porEmpleado: true, gw: 'Sí' },
          { clave: 'local.tareas_programadas', etiqueta: 'Ejecutar las tareas programadas al iniciar', tipo: 'bool', defecto: true, gw: 'Sí' },
          { clave: 'local.traspasos_segundo_plano', etiqueta: 'Ejecutar los traspasos de información en segundo plano', tipo: 'bool', defecto: false, gw: 'No' },
          { clave: 'local.portapapeles', etiqueta: 'Utilizar el portapapeles para copiar registros en los formularios', tipo: 'bool', defecto: true, porEmpleado: true, gw: 'Sí' },
          {
            clave: 'local.modo_impresion',
            etiqueta: 'Modo de impresión de informes',
            tipo: 'opcion',
            defecto: 'grafico',
            opciones: [
              { valor: 'grafico', texto: 'Modo gráfico (vista previa del navegador)' },
              { valor: 'pdf', texto: 'Directamente a PDF' },
            ],
            porEmpleado: true,
            gw: 'Gráfico GDI+',
          },
        ],
      },
      {
        clave: 'preferencias',
        titulo: 'Preferencias',
        parametros: [
          { clave: 'local.confirmar_salir', etiqueta: 'Pedir confirmación al salir del programa', tipo: 'bool', defecto: true, porEmpleado: true, usa: 'Botón Salir y Cerrar Empleado' },
          { clave: 'local.aviso_version', etiqueta: 'Avisar cuando haya una versión nueva del programa', tipo: 'bool', defecto: true, porEmpleado: true, usa: 'Franja amarilla «Hay una versión nueva»' },
          { clave: 'local.sonido_avisos', etiqueta: 'Sonido en los avisos', tipo: 'bool', defecto: true, porEmpleado: true },
        ],
      },
      {
        clave: 'apariencia',
        titulo: 'Apariencia',
        parametros: [
          {
            clave: 'local.tamano_letra',
            etiqueta: 'Tamaño de las pantallas',
            tipo: 'opcion',
            defecto: '100',
            opciones: [
              { valor: '90', texto: 'Pequeño (90 %)' },
              { valor: '100', texto: 'Normal' },
              { valor: '110', texto: 'Grande (110 %)' },
              { valor: '125', texto: 'Muy grande (125 %)' },
            ],
            porEmpleado: true,
            usa: 'Toda la aplicación',
          },
          { clave: 'local.colores_seccion', etiqueta: 'Colorear las ventanas según la sección (Clientes, Compras…)', tipo: 'bool', defecto: true, porEmpleado: true, usa: 'Toda la aplicación' },
        ],
      },
      { clave: 'carpetas', titulo: 'Ficheros y Carpetas', parametros: [], especial: 'carpetas' },
      {
        clave: 'inicio',
        titulo: 'Inicio y Finalización',
        parametros: [
          { clave: 'local.pantalla_inicio', etiqueta: 'Pantalla que se abre al entrar', tipo: 'opcion', defecto: '/', opciones: PANTALLAS_INICIO, porEmpleado: true, usa: 'Al iniciar sesión' },
          { clave: 'local.copia_al_salir', etiqueta: 'Proponer una copia de seguridad al salir', tipo: 'bool', defecto: false, porEmpleado: true },
        ],
      },
    ],
  },
  {
    clave: 'colores',
    titulo: 'Colores de pantallas',
    icono: '🎨',
    pestanas: [
      {
        clave: 'colores',
        titulo: 'Colores de pantallas',
        especial: 'colores',
        parametros: [
          {
            clave: 'apariencia.colores',
            etiqueta: 'Color de cada menú y opción',
            tipo: 'colores',
            defecto: COLORES_DEFECTO,
            usa: 'Fondo y barra de título de las ventanas',
          },
        ],
      },
      {
        clave: 'operativa',
        titulo: 'Operativa',
        especial: 'operativa',
        parametros: [],
        operativa: [
          {
            titulo: 'Poner color a una pantalla',
            pasos: [
              'Elige un color en la paleta (queda recuadrado en azul).',
              'Abre con ▸ el menú donde está la pantalla.',
              'Pulsa en su casilla «Color».',
              'Pulsa Aplicar.',
            ],
          },
          {
            titulo: 'Bueno es saber',
            notas: [
              'Quitar un color: la ✖ roja de la fila.',
              'Un menú con color se lo pasa a todas sus opciones («heredado»), salvo las que tengan uno propio.',
              '«Ver solo los que tienen color»: enseña solo lo coloreado.',
              '«Colores de partida»: deshace todo y vuelve a los colores iniciales.',
            ],
          },
        ],
      },
    ],
  },
  {
    clave: 'generales',
    titulo: 'Parámetros Generales',
    icono: '🏢',
    pestanas: [
      {
        clave: 'general',
        titulo: 'Generales',
        parametros: [
          { clave: 'igic_defecto_pct', etiqueta: 'IGIC por defecto (%)', tipo: 'num', defecto: 7, min: 0, max: 100, usa: 'Líneas nuevas de venta y artículos nuevos' },
          {
            clave: 'moneda_empresa',
            etiqueta: 'Moneda de la empresa',
            tipo: 'opcion',
            defecto: 'EUR',
            opciones: [
              { valor: 'EUR', texto: 'Euro (EUR)' },
              { valor: 'USD', texto: 'Dólar (USD)' },
              { valor: 'GBP', texto: 'Libra (GBP)' },
            ],
            usa: 'Carga Cotización',
          },
          {
            clave: 'liquidacion_base',
            etiqueta: 'Base de las comisiones',
            tipo: 'opcion',
            defecto: 'base',
            opciones: [{ valor: 'base', texto: 'Base imponible de las líneas' }],
            usa: 'Liquidación de comisiones',
          },
          { clave: 'gen.pais_defecto', etiqueta: 'País por defecto de las fichas nuevas', tipo: 'texto', defecto: 'ESPAÑA' },
          { clave: 'gen.provincia_defecto', etiqueta: 'Provincia por defecto de las fichas nuevas (código)', tipo: 'texto', defecto: '38' },
        ],
      },
      {
        clave: 'clientes',
        titulo: 'Clientes',
        parametros: [
          { clave: 'gen.cliente_digitos', etiqueta: 'Cifras del código de cliente', tipo: 'num', defecto: 5, min: 3, max: 10 },
          { clave: 'gen.avisar_riesgo', etiqueta: 'Avisar al vender a un cliente que supera su riesgo', tipo: 'bool', defecto: true },
          { clave: 'gen.bloquear_riesgo', etiqueta: 'No dejar vender a crédito por encima del riesgo', tipo: 'bool', defecto: false },
        ],
      },
      {
        clave: 'documentos',
        titulo: 'Documentos',
        parametros: [
          { clave: 'gen.validez_presupuesto_dias', etiqueta: 'Validez de los presupuestos (días)', tipo: 'num', defecto: 30, min: 0, max: 365 },
          { clave: 'gen.pie_documentos', etiqueta: 'Texto al pie de presupuestos, pedidos y facturas', tipo: 'texto', defecto: '' },
        ],
      },
    ],
  },
  {
    clave: 'tpv',
    titulo: 'Parámetros TPV',
    icono: '🧾',
    pestanas: [
      {
        clave: 'tpv',
        titulo: 'TPV',
        parametros: [
          {
            clave: 'tpv.imprimir_ticket',
            etiqueta: 'Imprimir el ticket al cobrar',
            tipo: 'opcion',
            defecto: 'preguntar',
            opciones: [
              { valor: 'preguntar', texto: 'Preguntar' },
              { valor: 'siempre', texto: 'Siempre' },
              { valor: 'nunca', texto: 'Nunca' },
            ],
            porEmpleado: true,
          },
          { clave: 'tpv.pedir_empleado', etiqueta: 'Pedir empleado y contraseña al abrir el TPV', tipo: 'bool', defecto: true, porEmpleado: true },
          { clave: 'tpv.vender_sin_stock', etiqueta: 'Permitir vender artículos sin stock', tipo: 'bool', defecto: true },
          {
            clave: 'tpv.redondeo_efectivo',
            etiqueta: 'Redondeo del cobro en efectivo',
            tipo: 'opcion',
            defecto: 'no',
            opciones: [
              { valor: 'no', texto: 'Sin redondeo' },
              { valor: '0.05', texto: 'A 5 céntimos' },
            ],
          },
        ],
      },
    ],
  },
  {
    clave: 'compras',
    titulo: 'Parámetros Compras',
    icono: '🛒',
    pestanas: [
      {
        clave: 'compras',
        titulo: 'Compras',
        parametros: [
          { clave: 'com.actualizar_costes', etiqueta: 'Actualizar los costes de los artículos al recepcionar', tipo: 'bool', defecto: true },
          {
            clave: 'com.reparto_portes',
            etiqueta: 'Reparto del transporte y otros gastos en el coste',
            tipo: 'opcion',
            defecto: 'importe',
            opciones: [
              { valor: 'importe', texto: 'En proporción al importe de cada línea' },
              { valor: 'cantidad', texto: 'En proporción a las unidades' },
            ],
            usa: 'Pedido a proveedor (en proporción al importe)',
          },
          { clave: 'com.avisar_precio_distinto', etiqueta: 'Avisar si el precio del proveedor cambia respecto a la última compra', tipo: 'bool', defecto: true },
          { clave: 'com.almacen_recepcion', etiqueta: 'Almacén de recepción por defecto', tipo: 'almacen', defecto: '01', porEmpleado: true },
        ],
      },
    ],
  },
  {
    clave: 'almacen',
    titulo: 'Parámetros Almacén',
    icono: '📦',
    pestanas: [
      {
        clave: 'almacen',
        titulo: 'Almacén',
        parametros: [
          { clave: 'alm.almacen_defecto', etiqueta: 'Almacén por defecto', tipo: 'almacen', defecto: '01', porEmpleado: true },
          { clave: 'alm.stock_negativo', etiqueta: 'Permitir stock negativo', tipo: 'bool', defecto: true },
          {
            clave: 'alm.metodo_coste',
            etiqueta: 'Coste de los artículos',
            tipo: 'opcion',
            defecto: 'medio',
            opciones: [
              { valor: 'medio', texto: 'Precio medio ponderado' },
              { valor: 'ultimo', texto: 'Último precio de compra' },
            ],
          },
          { clave: 'alm.avisar_stock_minimo', etiqueta: 'Avisar al bajar del stock mínimo', tipo: 'bool', defecto: true },
        ],
      },
    ],
  },
  {
    clave: 'contadores',
    titulo: 'Contadores',
    icono: '🔢',
    pestanas: [{ clave: 'contadores', titulo: 'Contadores', parametros: [], especial: 'contadores' }],
  },
  {
    clave: 'formatos',
    titulo: 'Formatos Numéricos',
    icono: '#️⃣',
    pestanas: [
      {
        clave: 'formatos',
        titulo: 'Formatos Numéricos',
        parametros: [
          { clave: 'decimales_precio', etiqueta: 'Decimales de los precios', tipo: 'num', defecto: 3, min: 0, max: 6, usa: 'Líneas de pedidos, ventas y ticket' },
          { clave: 'fmt.decimales_cantidad', etiqueta: 'Decimales de las cantidades', tipo: 'num', defecto: 2, min: 0, max: 4 },
          { clave: 'fmt.decimales_importe', etiqueta: 'Decimales de los importes', tipo: 'num', defecto: 2, min: 0, max: 4 },
        ],
      },
    ],
  },
  {
    clave: 'impuestos',
    titulo: 'Definición de Impuestos',
    icono: '📑',
    pestanas: [{ clave: 'impuestos', titulo: 'Impuestos', parametros: [], especial: 'impuestos' }],
  },
]

/** Todos los parámetros del catálogo por clave. */
export const PARAMETROS_POR_CLAVE: Record<string, DefParametro> = Object.fromEntries(
  SECCIONES_PARAMETROS.flatMap((s) => s.pestanas.flatMap((p) => p.parametros.map((d) => [d.clave, d]))),
)
