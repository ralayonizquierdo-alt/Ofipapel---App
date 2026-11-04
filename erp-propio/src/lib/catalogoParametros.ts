// Catálogo de parámetros de Avatar (Archivo → Parámetros), calcado de Utilidades → Parámetros de
// GeminisWin (todas las capturas del ZIP 7 «Parametros», 04/11/2026): Locales, Generales, TPV,
// Compras, Almacén, Contadores, Formatos Numéricos y Definición de Impuestos, cada uno con sus
// pestañas, y en Configuración: Hardware y Módulos.
//
// Aquí solo se describe cada parámetro (sección, pestaña, recuadro, tipo de control, opciones y
// valor por defecto). Los valores están en la base de datos: `parametro` (el de toda la empresa) y
// `parametro_empleado` (el de un empleado, que manda sobre el general; lo que en GeminisWin eran
// los «Parámetros Locales» de cada equipo, y en Compras los que van en cursiva). Se leen con
// src/lib/parametros.ts (valorParametro / useParametro).
//
// `usa`: dónde lo aplica ya el programa. Sin `usa`, el valor se guarda pero todavía no lo usa
// ninguna pantalla (la pantalla lo marca con un punto gris). NO cambies la clave de los que llevan
// `usa`: el programa los lee por su clave.
// `deshabilitado`: no tiene sentido en Avatar (o aún no puede funcionar); se ve en gris y el
// motivo sale al pasar el ratón.
// Ningún valor por defecto es un dato real de la empresa: solo los genéricos de GeminisWin
// (decimales, máscaras, nombres del módulo de reparaciones…).

import { coloresPorDefecto } from './coloresPantallas'
import type { BloqueOperativa } from '../components/gw/GwOperativa'

export type TipoParametro = 'bool' | 'num' | 'texto' | 'textoLargo' | 'opcion' | 'radio' | 'color' | 'tienda' | 'almacen' | 'empleado' | 'colores'

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
  /** Decimales (numéricos; 0 si falta). */
  decimales?: number
  ayuda?: string
  /** Dónde lo usa ya el programa (si falta: guardado, aún sin usar). */
  usa?: string
  /** Valor que tenía en GeminisWin (cuando se conoce y no es un dato sensible). */
  gw?: string
  /** Recuadro (marco con título) en el que va, como en GeminisWin. */
  grupo?: string
  /** Ancho del recuadro en doceavos (en el primer parámetro del recuadro; 12 si falta). */
  anchoGrupo?: number
  /** Ancho del control dentro del recuadro, en doceavos. */
  ancho?: number
  /**
   * Cómo se pinta: bool → 'boton' (botón ✔/✖ de GeminisWin, por defecto), 'casilla' o 'titulo'
   * (casilla en el título del recuadro: si está desmarcada, el resto del recuadro queda en gris);
   * radio → 'botones' (botones que se hunden) o, por defecto, botones de opción.
   */
  estilo?: 'boton' | 'casilla' | 'titulo' | 'botones'
  /** Motivo por el que no se puede cambiar en Avatar (se ve en gris). */
  deshabilitado?: string
}

export interface PestanaParametros {
  clave: string
  titulo: string
  parametros: DefParametro[]
  /** Pestaña con una parte que no es una lista de parámetros sino una pantalla propia. */
  especial?: 'contadores' | 'impuestos' | 'tarifas' | 'colores' | 'operativa' | 'programador' | 'fichas'
  /** Contenido de la pestaña «Operativa» (cómo se usa la sección). */
  operativa?: BloqueOperativa[]
  /** Nota que sale arriba de la pestaña. */
  nota?: string
}

export interface SeccionParametros {
  clave: string
  titulo: string
  icono: string
  pestanas: PestanaParametros[]
}

const PANTALLAS_INICIO = [
  { valor: '/', texto: 'Ninguna' },
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

/* ------------------------------------------------------------------ ayudas para escribir el catálogo */

type Extra = Partial<DefParametro>
const UNA = 'En la captura de GeminisWin solo se ve esta opción del desplegable.'
const opc = (l: string[]) => l.map((x) => ({ valor: x, texto: x }))
/** Botón ✔/✖. */
const b = (clave: string, etiqueta: string, x: Extra = {}): DefParametro => ({ clave, etiqueta, tipo: 'bool', defecto: false, ...x })
/** Casilla. */
const c = (clave: string, etiqueta: string, x: Extra = {}): DefParametro => ({ clave, etiqueta, tipo: 'bool', defecto: false, estilo: 'casilla', ancho: 12, ...x })
/** Casilla en el título del recuadro. */
const tit = (clave: string, etiqueta: string, x: Extra = {}): DefParametro => ({ clave, etiqueta, tipo: 'bool', defecto: false, estilo: 'titulo', ...x })
const t = (clave: string, etiqueta: string, x: Extra = {}): DefParametro => ({ clave, etiqueta, tipo: 'texto', defecto: '', ...x })
const tl = (clave: string, etiqueta: string, x: Extra = {}): DefParametro => ({ clave, etiqueta, tipo: 'textoLargo', defecto: '', ancho: 12, ...x })
const n = (clave: string, etiqueta: string, x: Extra = {}): DefParametro => ({ clave, etiqueta, tipo: 'num', defecto: 0, min: 0, ...x })
const col = (clave: string, etiqueta: string, x: Extra = {}): DefParametro => ({ clave, etiqueta, tipo: 'color', defecto: null, ancho: 3, ...x })
/** Desplegable cuyas opciones son los textos (el primero es el valor por defecto). */
const s = (clave: string, etiqueta: string, opciones: string[], x: Extra = {}): DefParametro => ({
  clave,
  etiqueta,
  tipo: 'opcion',
  defecto: opciones[0],
  opciones: opc(opciones),
  ...(opciones.length === 1 ? { ayuda: UNA } : {}),
  ...x,
})
const r = (clave: string, etiqueta: string, opciones: [string, string][], x: Extra = {}): DefParametro => ({
  clave,
  etiqueta,
  tipo: 'radio',
  defecto: opciones[0][0],
  opciones: opciones.map(([valor, texto]) => ({ valor, texto })),
  ancho: 12,
  ...x,
})
/** Pone el recuadro a una lista de parámetros (y su ancho en el primero). */
const g = (grupo: string, defs: DefParametro[], anchoGrupo?: number): DefParametro[] =>
  defs.map((d, i) => ({ ...d, grupo, ...(i === 0 && anchoGrupo ? { anchoGrupo } : {}) }))
/** Lo mismo con un motivo de «deshabilitado» para todos. */
const des = (motivo: string, defs: DefParametro[]): DefParametro[] => defs.map((d) => ({ ...d, deshabilitado: d.deshabilitado ?? motivo }))
/** Lo mismo marcando todos como «por empleado». */
const loc = (defs: DefParametro[]): DefParametro[] => defs.map((d) => ({ ...d, porEmpleado: true }))

const SIN_CARPETAS = 'Avatar no usa carpetas del equipo: los datos y las imágenes están en la nube.'
const SIN_PROGRAMAS = 'El navegador no puede ejecutar programas del equipo.'
const SIN_HARDWARE = 'El navegador no puede enviar códigos a la impresora, al cajón, al visor ni a la balanza: se imprime con la vista previa del navegador.'
const SIN_WINDOWS = 'Es una opción de Windows: Avatar funciona en el navegador.'

/** Recuadro de colores de Apariencia (Locales). */
function colores(pre: string, grupo: string, campos: string[], casillas: string[] = [], titulo = false): DefParametro[] {
  const defs: DefParametro[] = []
  if (titulo) defs.push(tit(`${pre}.activo`, grupo))
  campos.forEach((e, i) => defs.push(col(`${pre}.c${i + 1}`, e, { porEmpleado: true })))
  casillas.forEach((e, i) => defs.push(c(`${pre}.k${i + 1}`, e, { ancho: 6, porEmpleado: true })))
  return g(grupo, defs)
}
const CAMPOS_7 = ['Color del Fondo', 'Color del Texto', 'Texto Resaltado', 'Fondo Deshabil.', 'Texto Deshabilit.', 'Fondo Texto Seleccionado:', 'Color Texto Seleccionado:']
const MARCO = ['Fondo Trasparente', 'Usar Colores Degradados']

/** Recuadro de Formatos Numéricos (casilla de título, máscara, redondeo y decimales). */
function formato(pre: string, grupo: string, mascara: string, decimales: number, x: { anchoGrupo?: number; claveDec?: string; usaDec?: string; activo?: boolean; red?: string } = {}): DefParametro[] {
  return g(
    grupo,
    [
      tit(`fmt.${pre}`, grupo, { defecto: x.activo ?? false }),
      t(`fmt.${pre}_mascara`, 'Máscara', { defecto: mascara, ancho: x.anchoGrupo ? 6 : 5 }),
      c(`fmt.${pre}_redondeo`, x.red ?? 'Redondeo de Decimales:', { defecto: x.activo ?? false, ancho: x.anchoGrupo ? 3 : 4 }),
      {
        clave: x.claveDec ?? `fmt.${pre}_decimales`,
        etiqueta: x.anchoGrupo ? 'Decimales' : 'Decimales',
        tipo: 'num',
        defecto: decimales,
        min: 0,
        max: 6,
        ancho: 3,
        ...(x.usaDec ? { usa: x.usaDec } : {}),
      },
    ],
    x.anchoGrupo,
  )
}

/** Fila de «Opciones de Impresión del Ticket, Albarán, Factura y Pedido» (TPV). */
function filaImpresion(pre: string, etiqueta: string, cab: boolean): DefParametro[] {
  return [
    c(`tpv.imp.${pre}`, etiqueta, { ancho: 4 }),
    s(`tpv.imp.${pre}_emitir`, cab ? 'Emitir' : '', ['', 'Ticket', 'Albaran', 'Factura', 'Ticket y Factura'], { ancho: 3 }),
    n(`tpv.imp.${pre}_copias`, cab ? 'Copias' : '', { ancho: 1, max: 9 }),
    s(`tpv.imp.${pre}_informe`, cab ? 'Inf. Predeterm.' : '', ['Predeterminado'], { ancho: 2 }),
    s(`tpv.imp.${pre}_factura`, cab ? 'Generar Factura' : '', ['Predeterminado'], { ancho: 2 }),
  ]
}

/** Recuadro de los paneles de TPV Bares. */
function panelBares(pre: string, grupo: string, ordenar: string): DefParametro[] {
  return g(grupo, [
    n(`bar.${pre}_cols`, 'Cols.:', { ancho: 2 }),
    n(`bar.${pre}_filas`, 'Filas:', { ancho: 2 }),
    n(`bar.${pre}_letra`, 'Tam. Letra:', { ancho: 2 }),
    col(`bar.${pre}_color_boton`, 'Color Botón', { ancho: 2 }),
    col(`bar.${pre}_color_texto`, 'Color Texto', { ancho: 2 }),
    col(`bar.${pre}_fondo`, 'Fondo Panel', { ancho: 2 }),
    s(`bar.${pre}_orden`, ordenar, ['Predeterminado'], { ancho: 6 }),
  ])
}

/** Columna de «Parametrización del Cálculo de los Precios de Coste» (Compras). */
function calculoCoste(pre: string, grupo: string): DefParametro[] {
  return g(
    grupo,
    [
      c(`com.${pre}.igic`, 'Incluir IGIC'),
      c(`com.${pre}.canon`, 'Incluir Canon'),
      c(`com.${pre}.imp3`, 'Incluir Imp. 3', { deshabilitado: 'No hay un tercer impuesto definido (Definición de Impuestos).' }),
      c(`com.${pre}.bonificaciones`, 'Incluir Bonificaciones'),
      c(`com.${pre}.impuesto_pie`, 'Incluir Impuesto en Pie'),
      c(`com.${pre}.dto_pie`, 'Incluir Descuentos en Pie'),
      c(`com.${pre}.dto_linea`, 'Incluir Descuentos en Línea'),
      c(`com.${pre}.gastos`, 'Incluir Gastos y Transporte'),
    ],
    5,
  )
}

/** Fila de «Contadores Externos Para la Facturación». */
const filaContador = (pre: string): DefParametro[] => [
  t(`cont.ext.${pre}.dc`, 'Dígito Control'),
  n(`cont.ext.${pre}.numero`, 'Nº Factura'),
  b(`cont.ext.${pre}.incrementa_deuda`, 'Incrementa Deuda', { defecto: true }),
  b(`cont.ext.${pre}.emitir_pagada`, 'Emitir Pagada'),
  b(`cont.ext.${pre}.cambiar_numero`, 'Cambiar Núm. Fra'),
  s(`cont.ext.${pre}.eliminar`, 'Eliminar Facturas', ['Preguntar', 'Sí', 'No']),
  b(`cont.ext.${pre}.predeterminado`, 'DC Predet.'),
]

/* ------------------------------------------------------------------------------------- secciones */

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
          ...g('Tienda por Defecto', [
            {
              clave: 'local.tienda_defecto',
              etiqueta: '',
              tipo: 'tienda',
              defecto: null,
              porEmpleado: true,
              ancho: 12,
              usa: 'Tienda con la que se empieza a trabajar si en el navegador no hay otra elegida',
            },
            c('local.solo_datos_tienda', 'En los Formularios, Mostrar Sólo los datos de ésta Tienda', {
              porEmpleado: true,
              ayuda: 'Lo que de verdad limita a un empleado está en Control de Accesos → Usuarios o Empleados → Editar Actual.',
            }),
          ]),
          ...g('Empleado por Defecto', [{ clave: 'local.empleado_defecto', etiqueta: '', tipo: 'empleado', defecto: null, porEmpleado: true, ancho: 12 }]),
          {
            clave: 'local.turnos',
            etiqueta: 'Activar Gestión de Turnos',
            tipo: 'radio',
            defecto: 'no',
            opciones: [
              { valor: 'equipo', texto: 'Activar un Turno Diferente por cada Equipo' },
              { valor: 'tienda', texto: 'Activar el Mismo Turno para todos los Equipos de una misma Tienda' },
            ],
            estilo: 'titulo',
            grupo: 'Activar Gestión de Turnos',
            ayuda: 'Desmarcado = sin turnos.',
            gw: 'Sin turnos',
          },
          b('local.forzar_apertura_caja', 'Forzar que Siempre haya Aperturas y Cierres de Caja', { defecto: true, porEmpleado: true }),
          b('local.tareas_programadas', 'Activar la Ejecución de Tareas Programadas al Iniciar la Aplicación', { defecto: true }),
          b('local.traspasos_segundo_plano', 'Ejecutar los Traspasos de Información en Segundo Plano'),
          b('local.portapapeles', 'Utilizar el Portapapeles de Windows para copiar Registros en los formularios', { defecto: true, porEmpleado: true }),
          {
            clave: 'local.modo_impresion',
            etiqueta: 'Modo de Impresión de Informes',
            tipo: 'opcion',
            defecto: 'grafico',
            opciones: [
              { valor: 'grafico', texto: 'Imprimir en modo Gráfico (vista previa del navegador)' },
              { valor: 'pdf', texto: 'Directamente a PDF' },
            ],
            porEmpleado: true,
            ancho: 8,
            gw: 'Imprimir en modo Gráfico; Usando GDI+',
          },
        ],
      },
      {
        clave: 'preferencias',
        titulo: 'Preferencias',
        parametros: [
          ...loc(
            g('Opciones de Visualización', [
              b('local.busqueda_maximizada', 'Mostrar Siempre Maximizada la Regilla de Búsquedas', { ancho: 8 }),
              b('local.ajustar_resolucion', 'Ajustar Formularios a la Resolución Gráfica Indicada', { ancho: 8, deshabilitado: 'El navegador ajusta solo las pantallas al tamaño de la ventana.' }),
              n('local.resolucion_largo', 'Largo', { ancho: 2, deshabilitado: 'El navegador ajusta solo las pantallas al tamaño de la ventana.' }),
              n('local.resolucion_alto', 'Alto', { ancho: 2, deshabilitado: 'El navegador ajusta solo las pantallas al tamaño de la ventana.' }),
              s('local.pantalla_tactil', 'Activar Soporte Pantalla Táctil:', ['Predeterminado'], { ancho: 6 }),
              s('local.orientacion_pantalla', 'Orientación Pantalla:', ['Predeterminado'], { ancho: 6 }),
              r(
                'local.modo_imagenes',
                'Modo de Mostrar las Imágenes en los Formularios',
                [
                  ['real', 'Tamaño Real'],
                  ['ajustado', 'Tamaño Ajustado'],
                  ['rellenar', 'Rellenar marco'],
                ],
                { estilo: 'botones', defecto: 'ajustado', ancho: 8 },
              ),
              s('local.temas_windows', 'Temas de Windows', ['Predeterminado'], { ancho: 4, deshabilitado: SIN_WINDOWS }),
              b('local.offscreen', 'Desactivar el Método Off-Screen al dibujar las ventanas', { ancho: 8, deshabilitado: SIN_WINDOWS }),
            ]),
          ),
          ...loc(
            g('Sonido de Aviso', [
              n('local.aviso_frecuencia', 'Frecuencia, Hertz:', { ancho: 4, max: 20000 }),
              n('local.aviso_duracion', 'Duración, Miliseg.:', { ancho: 4, max: 5000 }),
              c('local.aviso_sin_sonido', 'Deshabilitar Sonido', { ancho: 4 }),
            ]),
          ),
          ...loc(
            g('Sonido de Error', [
              n('local.error_frecuencia', 'Frecuencia, Hertz:', { ancho: 4, max: 20000 }),
              n('local.error_duracion', 'Duración, Miliseg.:', { ancho: 4, max: 5000 }),
              c('local.error_sin_sonido', 'Deshabilitar Sonido', { ancho: 4 }),
            ]),
          ),
          b('local.pdf_imagen', 'Al Convertir los Informes en Documentos PDF, Generar una Imagen del Informe', { porEmpleado: true }),
          b('local.no_multiinstancia', 'No Permitir  Iniciar un mismo Formulario más de una vez, (Multi-Instancia)', { porEmpleado: true }),
          b('local.escape_cancela', 'Utilizar la Tecla "ESCAPE", para Cancelar las Modificaciones en los Formularios', { porEmpleado: true }),
          ...g('Avatar', [
            b('local.aviso_version', 'Avisar cuando haya una versión nueva del programa', { defecto: true, porEmpleado: true, usa: 'Franja amarilla «Hay una versión nueva»' }),
          ]),
        ],
      },
      {
        clave: 'apariencia',
        titulo: 'Apariencia',
        nota: 'Los colores de cada pantalla de Avatar se ponen en «Colores de pantallas» (sección de la izquierda). Estos de GeminisWin se guardan, pero aún no los usa ninguna pantalla.',
        parametros: [
          b('local.apariencia_formato', 'Formato', { ancho: 3, porEmpleado: true }),
          s('local.apariencia_formato_nombre', '', [''], {
            ancho: 9,
            ayuda: undefined,
            deshabilitado: 'Los formatos de colores guardados de GeminisWin no se usan en Avatar.',
          }),
          b('local.temas_windows_activar', 'Activar Temas de Windows', { ancho: 5, deshabilitado: SIN_WINDOWS }),
          col('local.color_fondo_app', 'Color Fondo de la Aplicación:', { ancho: 4, porEmpleado: true }),
          c('local.color_fondo_degradado', 'Degradado', { ancho: 3, porEmpleado: true }),
          ...colores('local.col.pantallas', 'Colores para las Pantallas', ['Color del Fondo', 'Color del Texto', 'Texto Resaltado', 'Texto Resaltado (2)'], ['Usar Colores Degradados']),
          ...colores('local.col.tallas', 'Tallas y Colores', ['Color del Padre', 'Color del Hijo']),
          ...colores('local.col.marcos', 'Colores para los Marcos', ['Color del Fondo', 'Color del Texto', 'Texto Resaltado'], MARCO),
          ...colores('local.col.negativos', 'Negativos, Anulados o de Baja', ['Color del Fondo', 'Color del Texto']),
          ...colores('local.col.opciones', 'Colores para los Marcos de Opciones', ['Color del Fondo', 'Color del Texto', 'Color del Título', 'Texto Resaltado'], MARCO),
          ...colores('local.col.paginas', 'Colores para los Marcos de Páginas o Pestañas', ['Color del Fondo', 'Color del Texto', 'Color del Título', 'Texto Resaltado'], MARCO),
          // El título de este recuadro queda entre las dos capturas (P03 y P04): no se ve.
          ...colores('local.col.campos', 'Colores para los Campos', CAMPOS_7),
          ...colores('local.col.listas', 'Definir Colores Diferentes para las Listas y las Regillas de Datos', CAMPOS_7, [], true),
          ...colores(
            'local.col.paneles',
            'Definir Colores para los Paneles Diferentes a los Marcos de Página o Pestañas',
            ['Color del Fondo', 'Color del Texto', 'Texto Resaltado', 'Fondo del Título', 'Texto del Título'],
            MARCO,
            true,
          ),
          ...colores('local.col.tactiles', 'Definir Colores Diferentes para Botones de Menú o Selección, en Pantallas Táctiles', CAMPOS_7.slice(0, 5), [], true),
          ...g('Pantallas de Avatar', [
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
            b('local.colores_seccion', 'Colorear las ventanas según la sección (Clientes, Compras…)', { defecto: true, porEmpleado: true, usa: 'Toda la aplicación', ancho: 6 }),
          ]),
        ],
      },
      {
        clave: 'carpetas',
        titulo: 'Ficheros y Carpetas',
        nota: 'En GeminisWin aquí se elegían carpetas del equipo. Avatar no usa carpetas: los datos están en la base de datos en la nube, la copia se descarga con Utilidades → Copia de Seguridad y cada periodo se gestiona en Archivo → Periodos.',
        parametros: [
          ...g('Copias de Seguridad', [
            t('local.carpeta_copia', 'Carpeta donde se Almacenará la Copia de Seguridad (Formato ZIP)', { ancho: 12, porEmpleado: true, deshabilitado: 'El navegador guarda la copia en su carpeta de descargas: no deja elegir otra.' }),
            b('local.copia_imagenes', 'Hacer copia de seguridad de la carpeta de Imágenes', { ancho: 7, deshabilitado: SIN_CARPETAS }),
            b('local.copia_encriptar', 'Encriptar la Copia', { ancho: 5, deshabilitado: 'Aún no: la copia ZIP de Avatar sale sin cifrar.' }),
          ]),
          ...g('Enlace con el Labeler (Generador de Etiquetas)', [
            t('local.labeler_comando', 'Linea de Comando del Labeler', { ancho: 12, deshabilitado: 'Las etiquetas se hacen en Utilidades → Etiquetas, sin programa externo.' }),
          ]),
          ...g('Carpeta donde se guardará la salida de los Informes (Pdf, Tiff, etc...)', [t('local.carpeta_informes', '', { ancho: 12, deshabilitado: 'El navegador guarda los PDF en su carpeta de descargas.' })]),
        ],
      },
      {
        clave: 'inicio',
        titulo: 'Inicio y Finalización',
        parametros: [
          ...loc(
            g('Al Iniciar Avatar', [
              s('local.opciones_menu', 'Opciones del Menu y de la Barra de Menu', ['Predeterminado en Avatar'], { ancho: 8 }),
              s('local.posicion_barra_menu', 'Posición Barra de Menu', ['Predeterminada'], { ancho: 4, deshabilitado: 'En Avatar el menú va siempre arriba.' }),
              { clave: 'local.pantalla_inicio', etiqueta: 'Ejecutar la Pantalla', tipo: 'opcion', defecto: '/', opciones: PANTALLAS_INICIO, ancho: 6, usa: 'Al iniciar sesión' },
              s('local.pantalla_inicio_ejecutar', 'Al Ejecutar la Pantalla', ['Predeterminado en Avatar'], { ancho: 6 }),
              s('local.pantalla_inicio_modo', 'Modo:', ['Predeterminado'], { ancho: 4 }),
              b('local.cerrar_con_pantalla', 'Al Cerrar esta Pantalla, salir de Avatar', { ancho: 8 }),
              b('local.no_multiinstancia_app', 'No Permitir  Iniciar más de una vez, (Multi-Instancia), a Avatar', { ancho: 10 }),
              t('local.comando_inicio', 'Ejecutar el Siguiente Comando', { ancho: 12, deshabilitado: SIN_PROGRAMAS }),
            ]),
          ),
          ...loc(
            g('Al Salir de Avatar', [
              b('local.confirmar_salir', 'Confirmar si realmente se quiere salir de Avatar', { defecto: true, ancho: 9, usa: 'Botón Salir y Cerrar Empleado' }),
              t('local.comando_salir', 'Ejecutar el Siguiente Comando', { ancho: 12, deshabilitado: SIN_PROGRAMAS }),
              r(
                'local.cerrar_windows',
                '',
                [
                  ['no', 'No Cerrar Windows'],
                  ['si', 'Cerrar Windows'],
                  ['preguntar', 'Preguntar si se Cierra'],
                ],
                { estilo: 'botones', deshabilitado: 'El navegador no puede apagar el equipo.' },
              ),
            ], 9),
          ),
          ...g('Avatar', [
            {
              clave: 'local.cerrar_inactividad',
              etiqueta: 'Cerrar la sesión si no se usa durante',
              tipo: 'opcion',
              defecto: '60',
              opciones: [
                { valor: '0', texto: 'Nunca' },
                { valor: '5', texto: '5 minutos' },
                { valor: '15', texto: '15 minutos' },
                { valor: '30', texto: '30 minutos' },
                { valor: '60', texto: '1 hora' },
                { valor: '120', texto: '2 horas' },
                { valor: '240', texto: '4 horas' },
              ],
              porEmpleado: true,
              ancho: 6,
              ayuda: 'Un minuto antes avisa con «Seguir trabajando». Al cerrarse vuelve a la entrada (3 botones) y pide la clave.',
              usa: 'Toda la aplicación',
            },
            b('local.copia_al_salir', 'Proponer una copia de seguridad al salir', { porEmpleado: true, ancho: 6 }),
          ]),
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
          ...g('Control de Lotes y Series de Artículos', [
            s('gen.lotes_modo', 'Modo Operacional', ['Desactivado'], { ancho: 6 }),
            s('gen.lotes_formulario', 'Tipo de Formulario a Utilizar', ['Formulario Completo sin Rellenar el Nº de Lote'], { ancho: 6 }),
          ]),
          b('gen.tallas_colores', 'Activar el Módulo de Tallas y Colores', { ancho: 5 }),
          ...g('Traspaso a Contabilidad', [n('gen.longitud_cuentas', 'Longitud de las Cuentas Contables:', { defecto: 8, min: 4, max: 12, ancho: 12 })], 6),
          ...g('Moneda Complementaria', [t('gen.moneda_complementaria', '', { ancho: 12, ayuda: 'Código de la moneda (Archivo → Monedas).' })], 6),
          ...g('Configuración de las Imágenes', [
            t('gen.carpeta_imagenes', 'Carpeta de las Imágenes', { ancho: 7, deshabilitado: SIN_CARPETAS }),
            c('gen.imagenes_ruta_completa', 'Guardar la ruta completa en la base de datos', { ancho: 5, deshabilitado: SIN_CARPETAS }),
            c('gen.img_art', 'Autogenerar Imágenes de Artículos', { ancho: 5 }),
            c('gen.img_fam', 'Autogenerar Imágenes de Familias', { ancho: 5 }),
            c('gen.img_marcas', 'Marcas', { ancho: 2 }),
            t('gen.img_art_prefijo', 'Prefijo', { ancho: 1 }),
            s('gen.img_art_campo', 'Campo del Artículo', ['Código Venta'], { ancho: 3 }),
            t('gen.img_art_sufijo', 'Sufijo', { ancho: 1 }),
            t('gen.img_fam_prefijo', 'Prefijo', { ancho: 1 }),
            s('gen.img_fam_campo', 'Campo de Familia', ['Cod. Familia'], { ancho: 3 }),
            t('gen.img_fam_sufijo', 'Sufijo', { ancho: 1 }),
            t('gen.img_marcas_prefijo', 'Prefijo', { ancho: 1 }),
            t('gen.img_marcas_sufijo', 'Sufijo', { ancho: 1 }),
          ]),
          b(
            'gen.maxima_seguridad',
            'Configurar la Base de Datos para una Máxima Seguridad y Fiabilidad, en Detrimento de la Velocidad, Sólo al Guardar la Información',
            { ancho: 9, deshabilitado: 'La base de datos en la nube ya guarda cada cambio de forma segura.' },
          ),
          ...g('Avatar', [
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
              ancho: 3,
              usa: 'Carga Cotización',
            },
            {
              clave: 'liquidacion_base',
              etiqueta: 'Base de las comisiones',
              tipo: 'opcion',
              defecto: 'base',
              opciones: [{ valor: 'base', texto: 'Base imponible de las líneas' }],
              ancho: 3,
              usa: 'Liquidación de comisiones',
            },
            t('gen.pais_defecto', 'País por defecto de las fichas nuevas', { defecto: 'ESPAÑA', ancho: 3 }),
            t('gen.provincia_defecto', 'Provincia por defecto (código)', { defecto: '38', ancho: 3 }),
          ]),
        ],
      },
      {
        clave: 'clientes',
        titulo: 'Clientes',
        parametros: [
          n('gen.cliente_digitos', 'Cifras del código de cliente', { defecto: 5, min: 3, max: 10, ancho: 4 }),
          b('gen.avisar_riesgo', 'Avisar al vender a un cliente que supera su riesgo', { defecto: true, ancho: 8 }),
          b('gen.bloquear_riesgo', 'No dejar vender a crédito por encima del riesgo', { ancho: 8 }),
        ],
      },
      {
        clave: 'documentos',
        titulo: 'Documentos',
        parametros: [
          n('gen.validez_presupuesto_dias', 'Validez de los presupuestos (días)', { defecto: 30, max: 365, ancho: 4 }),
          tl('gen.pie_documentos', 'Texto al pie de presupuestos, pedidos y facturas'),
        ],
      },
      {
        // Avisos por correo (Luis, 01/11/2026): los envía la función del servidor «correo-enviar» con el
        // correo de Archivo → Datos de Empresa (puerto 465 + SSL; la contraseña es un secreto del servidor).
        clave: 'avisos_correo',
        titulo: 'Avisos por correo',
        parametros: [
          t('avisos.correos_devoluciones', 'Correos que reciben los avisos de recibos devueltos', {
            ancho: 12,
            ayuda: 'Uno o varios, separados por comas (p. ej. el del jefe de ventas y el de contabilidad). Llega un correo en cada devolución y un recordatorio cada mañana si queda alguna sin decidir.',
            usa: 'Remesas SEPA → devoluciones',
          }),
        ],
      },
      // La doble firma (contab.importe_doble_firma) y el control de teletrabajo (acceso.control_remoto) ya no
      // están aquí: son protocolos de la empresa y solo cambian con un Acuerdo de Dirección (02/11/2026).
    ],
  },
  {
    clave: 'tpv',
    titulo: 'Parámetros TPV',
    icono: '🧾',
    pestanas: [
      {
        clave: 'iniciales',
        titulo: 'Parám. Iniciales',
        parametros: [
          ...g('Datos del Cliente', [
            t('tpv.cliente_defecto', 'Cliente por Defecto al crear una nueva Venta, Factura o Pedido', {
              ancho: 8,
              ayuda: 'Código del cliente. El cliente de contado de cada tienda se pone en Archivo → Tiendas.',
            }),
            s('tpv.campo_busqueda', 'Campo de búsqueda', ['Código'], { ancho: 4 }),
          ]),
          ...g('Artículos por Cliente', [
            c('tpv.articulos_cliente_auto', 'Introducir Automáticamente éstos Artículos al Crear una Venta Nueva', { ancho: 6 }),
            c('tpv.actualizar_pvp_cliente', 'Actualizar los Pvps según la Tarifa de Venta y el Pvp que tenga Asignado el Artículo en su Ficha', { ancho: 6 }),
          ]),
          s('tpv.recalcular_cambio_cliente', 'Al cambiar de Cliente con diferente Tarifa, Recalcular precios:', ['Predeterminado'], { ancho: 8 }),
          s('tpv.pantalla_ventas', 'Elegir Pantalla de Ventas en el TPV', ['Predeterminada'], { ancho: 5 }),
          s('tpv.pantalla_ventas_modo', 'Modo', ['Predeterminado'], { ancho: 3 }),
          s('tpv.pantalla_tactil', 'Elegir la Pantalla Táctil de Ventas', ['Pantalla Predeterminada'], { ancho: 4, deshabilitado: 'Avatar tiene una sola pantalla de ventas.' }),
          s('tpv.pantalla_pedidos', 'Elegir Pantalla de Pedidos de Clientes', ['Pant. con Facturación'], { ancho: 8 }),
          s('tpv.usar_igic', 'Usar IGIC en Ventas y Facturas', ['Predeterminado'], { ancho: 6 }),
          { clave: 'igic_defecto_pct', etiqueta: 'IGIC Por Defecto', tipo: 'num', defecto: 7, min: 0, max: 100, decimales: 2, ancho: 3, usa: 'Líneas nuevas de venta y artículos nuevos' },
          n('tpv.pedido_minimo', 'Pedido Mínimo', { decimales: 3, ancho: 3 }),
          c('tpv.registrar_cajon', 'Registrar aperturas del cajón portamonedas'),
          c('tpv.descripcion_corta', 'Usar la Descripción corta del artículo en el Tpv'),
          c('tpv.solo_alta_almacen', 'Sólo se pueden vender los artículos que estén dados de alta en el almacen actual'),
          c('tpv.control_demora', 'Activar control de la Demora en los Pagos de Clientes'),
          c('tpv.entrada_rapida', 'Activar opción de Entrada Rápida de Artículos en ventas'),
        ],
      },
      {
        clave: 'preferencias',
        titulo: 'Preferencias',
        parametros: [
          ...g('Pantalla de Entrega y Devolución', [
            r(
              'tpv.pantalla_pago',
              '',
              [
                ['simple', 'Pantalla de Pago Simple'],
                ['fraccionado', 'Pantalla Pago Fraccionado'],
              ],
              { ancho: 8 },
            ),
            s('tpv.imprimir_saldar', 'Al Saldar la Cuenta, Activar  Imprimir', ['Predeterminado del Programa'], { ancho: 4 }),
            c('tpv.devolucion_ventas', 'Mostrarla al Grabar Ventas', { ancho: 4 }),
            c('tpv.abrir_cajon_ventas', 'Abrir Cajón al Grabar Ventas', { ancho: 4, deshabilitado: SIN_HARDWARE }),
            c('tpv.devolucion_pedidos', 'Mostrarla al Grabar Pedidos', { ancho: 4 }),
            s('tpv.cajon_devolucion', '', ['No Abrir Automáticamente el Cajón Portamonedas en la Pantalla de Devolución'], { ancho: 12, deshabilitado: SIN_HARDWARE }),
          ]),
          ...g(
            'Opciones de Ventas y Pedidos de Clientes',
            [
              ['igic_linea', 'Usar por Defecto el IGIC en Línea por Artículo'],
              ['intro_rapida_datos', 'Activar Introducción Rápida de Datos'],
              ['intro_rapida_articulos', 'Activar Introducción Rápida de Artículos'],
              ['ventas_contado', 'Activar Modo de Ventas de Contado'],
              ['posicionar_nombre', 'Al Insertar un Registro, Posicionarse en el Nombre'],
              ['sin_dto_lineal', 'No Usar el Dto. Lineal por Artículo'],
              ['nif_genericos', 'Solicitar el N.I.F. a los Clientes Genéricos'],
              ['dto_cliente_linea', 'Dto. del Cliente por Línea de Artículo'],
              ['empleado_insertar', 'Solicitar Empleado al Insertar un Registro'],
              ['avisar_ofertas', 'Avisar Tarifas de Oferta por Artículo'],
              ['empleado_grabar', 'Solicitar Empleado al Grabar un Registro'],
              ['vendedor_cliente', 'Asignar el Vendedor del Cliente'],
              ['aviso_stock_minimo', 'Avisar al Vender con Stock Bajo Mínimo'],
              ['tienda_cliente', 'Asignar la Tienda del Cliente'],
              ['ultimo_pvp', 'Ver el Último Pvp del Artículo al Cliente Actual'],
              ['sin_facturacion_directa', 'No Ver Facturación Directa en Ventas'],
              ['codigo_compra', 'Ver el Código de Compra del Artículo Actual'],
              ['vender_cajas', 'Activar la opción de Vender por Cajas'],
              ['presupuesto_defecto', 'Por Defecto Crear Presupuestos en Pedidos Nuevos'],
              ['adicional_ventas', 'Mostrar pantalla adicional en Ventas'],
            ]
              .map(([k, e]) => c(`tpv.${k}`, e, { ancho: 6 }))
              .concat([
                s('tpv.localizar_por', 'Localizar los Artículos por el código:', ['Cód. Venta'], { ancho: 6 }),
                c('tpv.adicional_pedidos', 'Mostrar pantalla adicional en Pedidos', { ancho: 6 }),
                n('tpv.dias_validez', 'Días Estimados por defecto para la Validez de un Pedido y/o Presupuesto:', { ancho: 6, max: 365 }),
                c('tpv.empleado_linea', 'Ver Empleado por Línea de Artículo', { ancho: 6 }),
                n('tpv.dias_reparacion', 'Días Estimados Entrega Reparación:', { ancho: 3, max: 365 }),
                s('tpv.reparacion_nueva', 'Al Crear una Reparación Nueva, por Defecto:', ['Predeterminado por el Programa'], { ancho: 3 }),
                c('tpv.editar_tallas', 'Editar cantidades en Tallas y Colores', { ancho: 6, deshabilitado: 'El módulo de Tallas y Colores no está en Avatar.' }),
                s('tpv.generar_venta', 'Generar Venta:', [''], { ancho: 6, ayuda: undefined }),
              ]),
          ),
          ...g('Avatar', [
            b('tpv.vender_sin_stock', 'Permitir vender artículos sin stock', { defecto: true, ancho: 6 }),
            {
              clave: 'tpv.redondeo_efectivo',
              etiqueta: 'Redondeo del cobro en efectivo',
              tipo: 'opcion',
              defecto: 'no',
              opciones: [
                { valor: 'no', texto: 'Sin redondeo' },
                { valor: '0.05', texto: 'A 5 céntimos' },
              ],
              ancho: 6,
            },
          ]),
        ],
      },
      {
        clave: 'impresion',
        titulo: 'Parám. de Impresión',
        parametros: [
          ...g('Opciones de Impresión del Ticket, Albarán, Factura y Pedido', [
            ...filaImpresion('contado', 'En Ventas de Contado Emitir:', true),
            ...filaImpresion('credito', 'En Ventas de Crédito Emitir:', false),
            ...filaImpresion('aplazadas', 'En Ventas Aplazadas Emitir:', false),
            c('tpv.imp.preguntar_copias', 'Preguntar Siempre por el Nº de Copias al Imprimir'),
            n('tpv.imp.lineas_minimas', 'Nº Mínimo de Líneas de Detalle en Albarán y Factura:', { ancho: 8, max: 99 }),
            c('tpv.imp.lineas_verticales', 'Imprimir Líneas Verticales en Albarán y Factura'),
            c('tpv.imp.disenador', 'Imprimir el Ticket con el Diseñador de Informes', { ancho: 7 }),
            c('tpv.imp.agrupar', 'Agrupar artículos al Imprimir', { ancho: 5 }),
            n('tpv.imp.lineas_pie', 'Nº de Líneas en Blanco en el Pie del Ticket:', { ancho: 8, max: 99 }),
            s('tpv.imp.salida_ventas', 'Salida por Defecto de los Informes de Ventas:', ['Predeterminada'], { ancho: 8 }),
            s('tpv.imp.salida_pedidos', 'Salida por Defecto de los Informes de Pedidos:', ['Predeterminada'], { ancho: 8 }),
          ]),
          ...g('Resumen de Ventas', [c('tpv.imp.resumen_simplificado', 'List. Simplificado'), c('tpv.imp.resumen_caja', 'Listar Mov. de Caja')], 4),
          ...g('Listar Factura Global', [s('tpv.imp.factura_global', '', [''], { ancho: 12, ayuda: undefined })], 4),
          c('tpv.imp.impresoras_familia', 'Activar Imprimir Artículos Nuevos en Distintas Impresoras, Según la Familia', { deshabilitado: 'El navegador no deja elegir la impresora desde el programa.' }),
          s('tpv.imp.impresoras_familia_lista', '', [''], { ancho: 12, ayuda: undefined, deshabilitado: 'El navegador no deja elegir la impresora desde el programa.' }),
        ],
      },
      {
        clave: 'textos',
        titulo: 'Textos Informes',
        parametros: [
          tl('tpv.texto_pie_albaran', 'Texto Pie de Albarán y Factura'),
          t('tpv.texto_titulo_ticket', 'Texto para el Titulo del Ticket:', { ancho: 7 }),
          tl('tpv.texto_pie_ticket', 'Texto Pie de Ticket'),
          tl('tpv.texto_lopd', 'Texto LOPD, Ley Orgánica de Protección de Datos'),
        ],
      },
      {
        clave: 'bares',
        titulo: 'TPV Bares',
        nota: 'Avatar no tiene todavía el TPV de bares: estos valores se guardan para cuando exista.',
        parametros: [
          c('bar.predeterminados', 'Activar Todos los Valores Predeterminados para el Soporte deTPV Bares'),
          c('bar.zonas_tienda', 'Mostrar Sólo las Zonas de Servicio que Pertenezcan a la Tienda Actual'),
          c('bar.mesa_antes', 'En Cuentas nuevas, pedir mesa antes que empleado', { ancho: 7 }),
          c('bar.mesas_abiertas', 'Mostrar Sólo las Mesas Abiertas', { ancho: 5 }),
          c('bar.sin_imagenes', 'No mostrar imágenes en los botones', { ancho: 7 }),
          c('bar.regilla_anadir', 'Regilla de Artic. por defecto en modo Añadir', { ancho: 5 }),
          c('bar.no_acumular', 'No acumular cantidad del artículo al Seleccionarlo', { ancho: 7 }),
          c('bar.agrupar', 'Agrupar Artículos en el TPV', { ancho: 5 }),
          ...g('Configuración de las Zonas de Servicio', [
            n('bar.refrescar_segundos', 'Refrescar Automáticamente las Zonas de Servicio cada (Segundos):', { ancho: 12, max: 3600 }),
            s('bar.tipo_panel', 'Elegir Tipo de Panel para las Zonas de Servicio', ['Usar Panel Predeterminado'], { ancho: 8 }),
            n('bar.zonas_letra', 'Tamaño Letra:', { ancho: 4 }),
          ]),
          ...panelBares('familias', 'Configuración del Panel de Familias', 'Ordenar las familias por:'),
          ...panelBares('articulos', 'Configuración del Panel de los Artículos', 'Ordenar los Artículos por:'),
          c('bar.tamano_fijo', 'Eliminar la posibilidad de poder cambiar el tamaño de los paneles'),
          c('bar.auto_redimensionar', 'Auto Redimensionar los Paneles según el Número de Familias'),
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
        titulo: 'Parámetros',
        parametros: [
          ...g('Parámetros Generales y Locales (Cursiva)', [
            // En cursiva en GeminisWin = local del equipo → aquí, por empleado.
            ...loc([
              c('com.actualizar_stock', 'Por Defecto, Siempre se Actualizará el Stock en el Almacén'),
              c('com.intro_rapida', 'Activar Modo de Introducción Rápida de Registros'),
              c('com.columna_chequeo', 'Ver Columna de Chequeo'),
              c('com.no_rellenar_impuestos', 'No Rellenar los Campos de los Impuestos'),
              c('com.anterior_coste', 'Ver el Anterior precio de Coste'),
            ]),
            c('com.intro_cod_compra', 'Introducción de Artículos por el Cod. de Compra'),
            ...loc([c('com.avisar_duplicados', 'Avisar Artículos Duplicados')]),
            c('com.codigo_varios_proveedores', 'Permitir que el Mismo Código de Compra Pertenezca a Varios Proveedores'),
            c('com.reemplazar_impuestos', 'Al Actualizar, Reemplazar los Impuestos Lineales en Artículos'),
            ...loc([
              c('com.tallas_padres_hijos', 'En Artículos con Tallas y Colores, Mostrar Siempre Padres e Hijos'),
              c('com.tallas_cantidad_1', 'Al Introducir un Artículo con Tallas y Colores, poner la cantidad a 1 en Todos sus Hijos'),
            ]),
            c('com.factura_numerica', 'No permitir Números de Factura que no sean Numéricos'),
            n('com.longitud_factura', 'Longitud Máxima del Nº de Factura:', { defecto: 8, max: 20, ancho: 8 }),
            n('com.dias_entrega', 'Días Estimados Entrega de la Mercancía:', { ancho: 8, max: 365 }),
          ]),
          s('com.pantalla_pedidos', 'Elegir la Pantalla para Usar en Pedidos y/o Compras:', ['Pantalla Predeterminada'], { ancho: 8 }),
          s('com.tipo_documento', 'Tipo de Documento:', ['Pedido', 'Albarán', 'Factura'], { ancho: 4 }),
          ...g('Avatar', [
            b('com.actualizar_costes', 'Actualizar los costes de los artículos al recepcionar', { defecto: true, ancho: 6 }),
            {
              clave: 'com.reparto_portes',
              etiqueta: 'Reparto del transporte y otros gastos en el coste',
              tipo: 'opcion',
              defecto: 'importe',
              opciones: [
                { valor: 'importe', texto: 'En proporción al importe de cada línea' },
                { valor: 'cantidad', texto: 'En proporción a las unidades' },
              ],
              ancho: 6,
              usa: 'Pedido a proveedor (en proporción al importe)',
            },
            b('com.avisar_precio_distinto', 'Avisar si el precio del proveedor cambia respecto a la última compra', { defecto: true, ancho: 6 }),
            { clave: 'com.almacen_recepcion', etiqueta: 'Almacén de recepción por defecto', tipo: 'almacen', defecto: '01', porEmpleado: true, ancho: 6 },
          ]),
        ],
      },
      {
        clave: 'recalculo',
        titulo: 'Recálculo de Precios',
        nota: 'Parametrización del Cálculo de los Precios de Coste',
        parametros: [
          ...calculoCoste('coste_bruto', 'Precio Proveedor Bruto'),
          ...calculoCoste('coste_liquido', 'Precio Líquido Última Compra'),
          ...g('Precio Líq. Medio', [c('com.medio_sin_abonos', 'No Calcular el precio Líquido cuando son Abonos')], 2),
          ...g(
            'Autocálculo del PVP',
            [
              r('com.autocalculo_pvp', '', [
                ['preguntar', 'Preguntar'],
                ['recalcular', 'Recalcular'],
                ['manual', 'Recalc. Manual'],
                ['no', 'No Recalcular'],
              ]),
              c('com.no_pantalla_recalculo', 'No Mostrar Automáticamente pantalla de Recálculo', { porEmpleado: true }),
              c('com.no_actualizar_porcentajes', 'Al Recalcular, No Actualizar los Porcentajes de las Tarifas'),
              c('com.usar_plantillas', 'Para Recalcular, Utilizar Siempre las Plantillas de la Fam./Prov', { porEmpleado: true }),
            ],
            8,
          ),
        ],
      },
      {
        clave: 'notificaciones',
        titulo: 'Notificaciones',
        parametros: [
          ...g('Activar Notificaciones', [
            tit('com.notificaciones', 'Activar Notificaciones'),
            tl('com.correos_recepcion', 'Direcciones de Correo Electrónico a las que se Notificará la Recepción de Pedidos', { ayuda: 'Separadas por punto y coma.' }),
            tl('com.correos_actualizacion', 'Direcciones de Correo a las que se Notificará la Actualización o Liquidación de Pedidos', { ayuda: 'Separadas por punto y coma.' }),
          ]),
          c('com.notificaciones_desactivar_equipo', 'DesActivar Notificaciones en este equipo', { porEmpleado: true }),
          c('com.notificaciones_outlook', 'Usar Outlook para enviar los correos de las notificaciones', { deshabilitado: 'Avatar envía los correos desde el servidor (Microsoft 365), no con el Outlook del equipo.' }),
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
        titulo: 'Parámetros Generales',
        parametros: [
          ...g(
            'Formato Familias Artículos',
            [
              n('alm.familia_niveles', 'Nº de Niveles, Máximo 3 Niv.:', { defecto: 3, min: 1, max: 3, ancho: 12 }),
              n('alm.familia_nivel1', 'Nivel 1', { defecto: 2, min: 1, max: 6, ancho: 4 }),
              n('alm.familia_nivel2', 'Nivel 2', { defecto: 2, min: 0, max: 6, ancho: 4 }),
              n('alm.familia_nivel3', 'Nivel 3', { defecto: 2, min: 0, max: 6, ancho: 4 }),
            ],
            6,
          ),
          ...g(
            'Parámetros para tallas y Colores',
            [
              n('alm.digitos_talla', 'Nº de Dígitos para Identificar la Talla del Artículo:', { ancho: 12, max: 6 }),
              n('alm.digitos_color', 'Nº de Dígitos para Identificar el Color del Artículo:', { ancho: 12, max: 6 }),
              c('alm.busqueda_sin_hijos', 'En las Búsquedas de Artículos, No Mostrar los hijos'),
              s('alm.talla_inexistente', 'Al Crear un Artículo con una Talla o un Color Inexistente', ['Confirmar si se Quiere Crear el Artículo'], { ancho: 12 }),
            ],
            6,
          ),
          ...g(
            'Formato del Código del Artículo',
            [
              n('alm.longitud_cod_proveedor', 'Longitud Código Proveedor:', { ancho: 12, max: 20 }),
              c('alm.codigo_con_familia', 'Incluir Cod. de la Familia'),
              c('alm.codigo_con_proveedor', 'Incluir Cod. del proveedor'),
              c('alm.codigo_longitud_relleno', 'Definir Longitud y Relleno'),
              n('alm.longitud_codigo', 'Longitud Código Artículo:', { ancho: 12, max: 20 }),
              r('alm.codigo_alinear', 'Alinear el Código a la', [
                ['izquierda', 'Izquierda'],
                ['derecha', 'Derecha'],
              ]),
              t('alm.codigo_relleno', 'Rellenar los Espacios con:', { ancho: 6 }),
            ],
            6,
          ),
          ...g(
            'Generación del Código de Barras EAN',
            [
              c('alm.ean_auto', 'Auto Generar Cód. EAN', { ancho: 6 }),
              n('alm.ean_digitos', 'Nº de Dígitos EAN:', { defecto: 13, min: 8, max: 13, ancho: 6 }),
              c('alm.ean_con_interno', 'Incluir el Código Interno en el Código EAN'),
              { clave: 'alm.ean_desde', etiqueta: 'Generar el Código EAN a Partir del Número:', tipo: 'num', defecto: null, min: 0, ancho: 12 },
              c('alm.ean_chequear_dc', 'Chequear el Dígito de Control del Código EAN'),
            ],
            6,
          ),
          ...g(
            'Duplicación de Códigos de Artículos',
            [
              c('alm.omitir_descripciones_duplicadas', 'Omitir Chequear Descripciones Duplicadas'),
              s('alm.duplicado_cod_venta', 'Código de Venta:', ['Cód. Interno'], { ancho: 6 }),
              s('alm.duplicado_cod_barras', 'Código de Barras:', ['Cód. Compra'], { ancho: 6 }),
            ],
            6,
          ),
          s('alm.articulo_nuevo', 'Al Crear un Artículo Nuevo:', ['Darlo de Alta con Stock a Cero en el Almacén Actual'], { ancho: 12 }),
          s('alm.coste_beneficio', 'Precio de Coste Utilizado para el Cálculo del Beneficio:', ['Coste Líquido Ult. Compra'], { ancho: 12 }),
          s('alm.pantalla_articulos', 'Pantalla de Artículos:', ['Predeterminada'], { ancho: 6 }),
          s('alm.creacion_rapida', 'Creación Ráp. de Artíc.:', ['Predeterminada'], { ancho: 6 }),
          ...g('Avatar', [
            { clave: 'alm.almacen_defecto', etiqueta: 'Almacén por defecto', tipo: 'almacen', defecto: '01', porEmpleado: true, ancho: 6 },
            {
              clave: 'alm.metodo_coste',
              etiqueta: 'Coste de los artículos',
              tipo: 'opcion',
              defecto: 'medio',
              opciones: [
                { valor: 'medio', texto: 'Precio medio ponderado' },
                { valor: 'ultimo', texto: 'Último precio de compra' },
              ],
              ancho: 6,
            },
            b('alm.stock_negativo', 'Permitir stock negativo', { defecto: true, ancho: 6 }),
            b('alm.avisar_stock_minimo', 'Avisar al bajar del stock mínimo', { defecto: true, ancho: 6 }),
          ]),
        ],
      },
      {
        clave: 'tarifas',
        titulo: 'Parametrización de las Tarifas',
        especial: 'tarifas',
        parametros: [
          ...g('Tarifas de Oferta (Opciones)', [
            c('alm.oferta_precio_unico', 'Utilizar un sólo Precio para cualquier Tarifa'),
            c('alm.oferta_dto_superior', 'Permitir reflejar un Dto. superior al Dto. Máximo del Artículo'),
          ]),
          ...g(
            'Opciones para el Cálculo de las Tarifas',
            [
              s('alm.tarifa_coste', 'Precio de Coste para el Cálculo:', ['Coste Líquido'], { ancho: 8 }),
              r('alm.tarifa_formula', 'Método o Fórmula para el Cálculo del PVP', [
                ['incremento', 'Incremento sobre coste   P = C + (C * I) / 100'],
                ['margen', 'Margen Comercial   P = C + (C * I) / (100-I)'],
              ]),
            ],
            7,
          ),
          ...g(
            'Redondeo del P.V.P.',
            [
              r(
                'alm.redondeo_pvp',
                '',
                [
                  ['incremental', 'Incremental'],
                  ['decremental', 'Decremental'],
                  ['cercano', 'Más cercano'],
                  ['sin', 'Sin redondeo'],
                ],
                { defecto: 'sin', ancho: 6 },
              ),
              t('alm.redondeo_centimo', 'Céntimo:', { ancho: 6 }),
              t('alm.redondeo_decimo', 'Décimo:', { ancho: 6 }),
              t('alm.redondeo_unidad', 'Unidad:', { ancho: 6 }),
              t('alm.redondeo_decena', 'Decena:', { ancho: 6 }),
              t('alm.redondeo_centena', 'Centena:', { ancho: 6 }),
            ],
            5,
          ),
        ],
      },
      {
        clave: 'traspasos',
        titulo: 'Traspasos Entre Almacenes',
        // En cursiva en GeminisWin = local del equipo → aquí, por empleado.
        parametros: loc([
          c('alm.traspaso_intro_rapida', 'Activar Introducción Rápida de Artículos'),
          c('alm.traspaso_sin_stock', 'Por Defecto, No se Actualizará el Stock en los Almacenes'),
          s('alm.traspaso_localizar', 'Campo que se Utilizará para Localizar los Artículos:', ['Cód. Interno', 'Cód. Venta', 'Cód. Compra'], { ancho: 8 }),
          s('alm.traspaso_precio', 'Precio utilizado para la valoración de los Traspasos:', ['Bruto', 'Líquido'], { ancho: 8 }),
        ]),
      },
    ],
  },
  {
    clave: 'contadores',
    titulo: 'Contadores',
    icono: '🔢',
    pestanas: [
      {
        clave: 'contadores',
        titulo: 'Contadores',
        especial: 'contadores',
        parametros: [
          ...filaContador('variable'),
          ...filaContador('fijo1'),
          ...filaContador('fijo2'),
          t('cont.ext.dc_predeterminado', 'DC Predet.'),
          r('cont.bloqueo', 'Bloqueo de los Contadores', [
            ['siempre', 'Siempre que varíe su valor'],
            ['usuario', 'Si lo introduce el usuario'],
            ['nuevos', 'Al grabar registros nuevos'],
          ], { estilo: 'botones' }),
        ],
      },
    ],
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
          ...formato('monetario', 'Asignar Valores Monetarios Predeterminados', '999,999,999.999', 2),
          ...g('Asignar Valores Monetarios Predeterminados', [
            c('fmt.monetario_simbolo', 'Símbolo Moneda:', { ancho: 3 }),
            s('fmt.monetario_simbolo_valor', '', ['', '€'], { ancho: 2 }),
            c('fmt.monetario_simbolo_izquierda', 'Situar el Símbolo a la izquierda', { ancho: 7 }),
          ]),
          ...formato('cantidad_ventas', 'Asignar Valores para la Cantidad y/o Unidad en Ventas', '', 2, { claveDec: 'fmt.decimales_cantidad' }),
          ...formato('cantidad_compras', 'Asignar Valores para la Cantidad en Compras y Stock', '999,999,999.999', 3),
          ...formato('pvp', 'Asignar para Los Pvps', 'Predeterminada', 3, { anchoGrupo: 6, claveDec: 'decimales_precio', usaDec: 'Líneas de pedidos, ventas y ticket', activo: true, red: 'Red.' }),
          ...formato('coste', 'Precios de Coste', '9,999,999.999', 3, { anchoGrupo: 6, red: 'Red.' }),
          ...formato('subtotal_ventas', 'Subtotales Ventas y Fact.', 'Predeterminada', 2, { anchoGrupo: 6, red: 'Red.' }),
          ...formato('subtotal_compras', 'Subtotales Compras', '999,999,999.99', 3, { anchoGrupo: 6, red: 'Red.' }),
          ...formato('total_ventas', 'Totales Ventas y Fact.', 'Predeterminada', 2, { anchoGrupo: 6, red: 'Red.' }),
          ...formato('total_compras', 'Totales Compras', '999,999,999.99', 2, { anchoGrupo: 6, red: 'Red.' }),
        ],
      },
    ],
  },
  {
    clave: 'impuestos',
    titulo: 'Definición de Impuestos',
    icono: '📑',
    pestanas: [
      {
        clave: 'impuestos',
        titulo: 'Impuestos',
        especial: 'impuestos',
        parametros: [
          ...[1, 2].flatMap((i) => [
            s(`imp.lineal${i}.nomenclatura`, i === 1 ? 'Nomenclatura' : '', ['', 'Canon'], { ayuda: undefined }),
            s(`imp.lineal${i}.aplicable`, i === 1 ? 'Aplicable en' : '', ['Compras y Ventas.', 'Compras', 'Ventas']),
            s(`imp.lineal${i}.tipo`, i === 1 ? 'Tipo Impuesto' : '', ['Tot. Unds. + IVA', 'Tot. Unds.']),
            n(`imp.lineal${i}.importe`, '', { decimales: 2 }),
            c(`imp.lineal${i}.imputable`, 'Imputable al Prove.'),
            t(`imp.lineal${i}.cuenta`, i === 1 ? 'Cta. Contable' : ''),
          ]),
          s('imp.nomenclatura', 'Nomenclatura del Impuesto:', ['IGIC', 'IVA']),
          n('imp.defecto_pct', '% Impuesto por Defecto:', { decimales: 2, max: 100 }),
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
]

/** Configuración (segundo apartado de la izquierda): Hardware, Módulos, Programador de Tareas. */
export const SECCIONES_CONFIGURACION: SeccionParametros[] = [
  {
    clave: 'cfg_hardware',
    titulo: 'Configuración Hardware',
    icono: '🖨️',
    pestanas: [
      {
        clave: 'hardware',
        titulo: 'Configuración Hardware',
        parametros: loc([
          ...des(SIN_HARDWARE, [
            ...g('Configurar Impresora de Tickets', [
              t('hw.ticket_impresora', 'Nombre de la Impresora:', { ancho: 12, deshabilitado: 'Se apunta en Archivo → Elegir Impresora… (el navegador no deja elegirla desde el programa).' }),
              t('hw.ticket_inicializacion', 'Código de Inicialización:', { ancho: 8 }),
              t('hw.ticket_corte', 'Código Corte del Papel:', { ancho: 5 }),
            ]),
            ...g('Configurar Cajón', [t('hw.cajon_impresora', 'Nombre de la Impresora que está conectada al Cajón:', { ancho: 12 }), t('hw.cajon_apertura', 'Código de Apertura:', { ancho: 8 })]),
            ...g('Configurar Visor', [
              t('hw.visor_impresora', 'Nombre de la Impresora que está conectada al Visor:', { ancho: 12 }),
              t('hw.visor_datos_impresora', 'Enviar Datos a Impresora:', { ancho: 4 }),
              t('hw.visor_datos_visor', 'Enviar Datos al Visor:', { ancho: 4 }),
              t('hw.visor_borrar', 'Borrar Pantalla del Visor:', { ancho: 4 }),
              n('hw.visor_caracteres', 'Nº de Caracteres por Línea:', { ancho: 4, max: 80 }),
              s('hw.visor_mensaje', 'Enviar Mensaje:', ['Predeterminado'], { ancho: 6 }),
            ]),
          ]),
          n('hw.sufijo_lector', 'Código ASCII del Sufijo del Lector de Códigos de Barras:', { ancho: 8, max: 255, ayuda: 'El lector de códigos de barras funciona como un teclado: normalmente termina con Intro (13).' }),
          t('hw.puerto_balanza', 'Puerto COM para la Balanza:', { ancho: 8, deshabilitado: SIN_HARDWARE }),
        ]),
      },
    ],
  },
  {
    clave: 'cfg_modulos',
    titulo: 'Configuración de Módulos',
    icono: '🧩',
    pestanas: [
      {
        clave: 'modulos',
        titulo: 'Configuración de Módulos',
        parametros: [
          ...g(
            'Nomenclatura del Módulo de Reparaciones',
            [
              s('mod.rep_predefinida', 'Nomenclaturas Predefinidas:', ['Reparación'], { ancho: 12 }),
              t('mod.rep_asistencia', 'Asistencia en Singular', { defecto: 'Reparación', ancho: 6 }),
              t('mod.rep_asistencias', 'Asistencia en Plural', { defecto: 'Reparaciones', ancho: 6 }),
              t('mod.rep_objeto', 'Objeto en Singular', { defecto: 'aparato', ancho: 6 }),
              t('mod.rep_objetos', 'Objeto en Plural', { defecto: 'aparatos', ancho: 6 }),
              t('mod.rep_serie', 'Definición y Abreviatura de la Serie', { defecto: 'Serie', ancho: 6 }),
              t('mod.rep_serie_abrev', '', { defecto: 'N/S.', ancho: 3 }),
              t('mod.rep_serie2', 'Definición de la 2º Serie', { defecto: 'Nº Identif.', ancho: 6 }),
              t('mod.rep_motivo', 'Def. Motivo de Asistencia', { defecto: 'Averia', ancho: 6 }),
            ],
            9,
          ),
          ...g(
            'Nomenclaturas para Campos Personalizados',
            [
              t('mod.fac_otros_gastos', 'Facturas, Campo "Otros Gastos":', { ancho: 12 }),
              t('mod.cli_auxiliar1', 'Clientes, Campo Auxiliar 1', { ancho: 6 }),
              t('mod.cli_auxiliar2', 'Clientes, Campo Auxiliar 2', { ancho: 6 }),
              t('mod.art_compuestos', 'Definición de "Artículos Compuestos"', { ancho: 12 }),
              t('mod.art_en_compuestos', 'Definición del Artículo en Compuestos:', { ancho: 8 }),
              t('mod.ticket_venta', 'Definición del "Ticket" de Venta:', { ancho: 8 }),
            ],
            9,
          ),
        ],
      },
    ],
  },
  {
    clave: 'cfg_programador',
    titulo: 'Programador de Tareas',
    icono: '⏱️',
    pestanas: [{ clave: 'programador', titulo: 'Programador de Tareas', parametros: [], especial: 'programador' }],
  },
  {
    clave: 'cfg_fichas',
    titulo: 'Fichas de Configuración',
    icono: '🔧',
    pestanas: [{ clave: 'fichas', titulo: 'Fichas de Configuración', parametros: [], especial: 'fichas' }],
  },
]

/** Todos los parámetros del catálogo por clave. */
export const PARAMETROS_POR_CLAVE: Record<string, DefParametro> = Object.fromEntries(
  [...SECCIONES_PARAMETROS, ...SECCIONES_CONFIGURACION].flatMap((s) => s.pestanas.flatMap((p) => p.parametros.map((d) => [d.clave, d]))),
)
