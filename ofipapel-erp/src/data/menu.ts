import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Users,
  Truck,
  ShoppingCart,
  ShoppingBag,
  Receipt,
  Globe,
  ShieldCheck,
  Store,
  Calculator,
  Landmark,
  Boxes,
  BarChart3,
  Building2,
  Contact,
  ScanLine,
  Smartphone,
  Zap,
  Gift,
  Route as RouteIcon,
  Handshake,
  LineChart,
  MapPin,
} from 'lucide-react'

export type Phase = 'core' | 'pro' | 'advanced' | 'optional'

export interface MenuItem {
  id: string
  label: string
  path: string
  icon: LucideIcon
  phase: Phase
  description: string
  /** Fase 1: columnas de una tabla de ejemplo para simular la pantalla real */
  sampleColumns?: string[]
  sampleRows?: string[][]
  /** Fase 2 / 3 / opcional: lista de funciones que incluirá el módulo */
  features?: string[]
}

export interface MenuSection {
  phase: Phase
  title: string
  badgeLabel: string
  items: MenuItem[]
}

export const PHASE_META: Record<Phase, { label: string; color: string; dot: string }> = {
  core: { label: 'Activo (Fase 1)', color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  pro: { label: 'Activo (Fase 2)', color: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  advanced: { label: 'Fase 3', color: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
  optional: { label: 'Opcional / escalable', color: 'bg-slate-200 text-slate-700', dot: 'bg-slate-500' },
}

export const MENU_SECTIONS: MenuSection[] = [
  {
    phase: 'core',
    title: 'Núcleo operativo',
    badgeLabel: 'Fase 1',
    items: [
      {
        id: 'dashboard',
        label: 'Panel principal',
        path: '/',
        icon: LayoutDashboard,
        phase: 'core',
        description: 'Visión general del negocio: ventas, stock crítico y actividad reciente.',
      },
      {
        id: 'catalogo',
        label: 'Catálogo',
        path: '/catalogo',
        icon: Package,
        phase: 'core',
        description: 'Alta, baja y edición de productos, variantes, categorías e imágenes.',
        sampleColumns: ['SKU', 'Producto', 'Categoría', 'Coste', 'PVP', 'Tarifa mayorista'],
        sampleRows: [
          ['OF-10234', 'Folio A4 80g (paquete 500)', 'Papelería', '2,10 €', '3,95 €', '2,80 €'],
          ['OF-10891', 'Bolígrafo azul punta fina', 'Escritura', '0,18 €', '0,60 €', '0,32 €'],
          ['OF-11207', 'Archivador A4 lomo ancho', 'Archivo', '1,35 €', '2,95 €', '1,90 €'],
          ['OF-12044', 'Tóner compatible HP 05A', 'Consumibles', '18,40 €', '34,90 €', '24,00 €'],
        ],
      },
      {
        id: 'stock',
        label: 'Stock y almacenes',
        path: '/stock',
        icon: Warehouse,
        phase: 'core',
        description: 'Existencias por almacén, movimientos y alertas de stock mínimo.',
        sampleColumns: ['SKU', 'Almacén', 'Unidades', 'Mínimo', 'Estado'],
        sampleRows: [
          ['OF-10234', 'Central', '840', '150', 'OK'],
          ['OF-10891', 'Central', '32', '100', 'Bajo mínimo'],
          ['OF-11207', 'Tienda Norte', '58', '25', 'OK'],
          ['OF-12044', 'Central', '4', '10', 'Bajo mínimo'],
        ],
      },
      {
        id: 'clientes',
        label: 'Clientes',
        path: '/clientes',
        icon: Users,
        phase: 'core',
        description: 'Fichas de cliente, tarifas asignadas, condiciones e historial.',
        sampleColumns: ['Cliente', 'Tipo', 'Tarifa', 'Saldo pendiente', 'Últ. pedido'],
        sampleRows: [
          ['Librería Montaña S.L.', 'Mayorista', 'Tarifa 2', '1.240,50 €', '18/06/2026'],
          ['Ana Pérez (particular)', 'Minorista', 'PVP', '0,00 €', '29/06/2026'],
          ['Copistería Rápida', 'Mayorista', 'Tarifa 1', '340,00 €', '30/06/2026'],
        ],
      },
      {
        id: 'proveedores',
        label: 'Proveedores',
        path: '/proveedores',
        icon: Truck,
        phase: 'core',
        description: 'Fichas de proveedor, condiciones de compra e histórico de pedidos.',
        sampleColumns: ['Proveedor', 'Contacto', 'Plazo entrega', 'Últ. compra'],
        sampleRows: [
          ['Distribuciones Papel Sur', 'Marta Ruiz', '3 días', '25/06/2026'],
          ['Global Office Supplies', 'Javier Soto', '7 días', '20/06/2026'],
        ],
      },
      {
        id: 'ventas',
        label: 'Ventas',
        path: '/ventas',
        icon: ShoppingCart,
        phase: 'core',
        description: 'Presupuestos, pedidos, albaranes y facturas en un mismo flujo.',
        sampleColumns: ['Nº', 'Cliente', 'Estado', 'Total', 'Fecha'],
        sampleRows: [
          ['P-2026-0341', 'Librería Montaña S.L.', 'Facturado', '612,40 €', '28/06/2026'],
          ['P-2026-0342', 'Copistería Rápida', 'Albarán', '198,00 €', '29/06/2026'],
          ['P-2026-0343', 'Ana Pérez', 'Presupuesto', '42,90 €', '30/06/2026'],
        ],
      },
      {
        id: 'compras',
        label: 'Compras',
        path: '/compras',
        icon: ShoppingBag,
        phase: 'core',
        description: 'Pedidos a proveedor, recepción de mercancía y actualización de stock.',
        sampleColumns: ['Nº pedido', 'Proveedor', 'Estado', 'Total', 'Fecha prevista'],
        sampleRows: [
          ['C-2026-0088', 'Distribuciones Papel Sur', 'Pendiente', '3.400,00 €', '04/07/2026'],
          ['C-2026-0087', 'Global Office Supplies', 'Recibido', '1.120,50 €', '27/06/2026'],
        ],
      },
      {
        id: 'facturacion',
        label: 'Facturación',
        path: '/facturacion',
        icon: Receipt,
        phase: 'core',
        description: 'Series, numeración legal, IGIC y exportación de facturas en PDF.',
        sampleColumns: ['Factura', 'Cliente', 'Base', 'IGIC', 'Total'],
        sampleRows: [
          ['F-2026-0512', 'Librería Montaña S.L.', '506,10 €', '106,30 €', '612,40 €'],
          ['F-2026-0511', 'Copistería Rápida', '163,60 €', '34,40 €', '198,00 €'],
        ],
      },
      {
        id: 'web',
        label: 'Tienda web',
        path: '/web',
        icon: Globe,
        phase: 'core',
        description: 'Sincronización de catálogo, stock y pedidos con la tienda online.',
        sampleColumns: ['Canal', 'Productos publicados', 'Pedidos hoy', 'Última sync'],
        sampleRows: [
          ['Web Ofipapel', '19.842 / 20.130', '14', 'hace 2 min'],
        ],
      },
      {
        id: 'usuarios',
        label: 'Usuarios y permisos',
        path: '/usuarios',
        icon: ShieldCheck,
        phase: 'core',
        description: 'Roles de administración, comercial, almacén y contabilidad.',
        sampleColumns: ['Usuario', 'Rol', 'Último acceso'],
        sampleRows: [
          ['r.alayonizquierdo', 'Administración', 'hoy 09:12'],
          ['almacen1', 'Almacén', 'hoy 08:40'],
        ],
      },
    ],
  },
  {
    phase: 'pro',
    title: 'Profesionalización',
    badgeLabel: 'Fase 2',
    items: [
      {
        id: 'tpv',
        label: 'TPV / Punto de venta',
        path: '/tpv',
        icon: Store,
        phase: 'pro',
        description: 'Venta física en mostrador, caja y cierre diario.',
        features: ['Venta rápida por escaneo o búsqueda', 'Gestión de caja y arqueo', 'Tickets y devoluciones'],
      },
      {
        id: 'contabilidad',
        label: 'Contabilidad',
        path: '/contabilidad',
        icon: Calculator,
        phase: 'pro',
        description: 'Asientos automáticos desde facturas y libro mayor.',
        features: ['Asiento automático por factura', 'Libro mayor y diario', 'Cierre de IGIC trimestral'],
      },
      {
        id: 'fiscalidad',
        label: 'Fiscalidad',
        path: '/fiscalidad',
        icon: Landmark,
        phase: 'pro',
        description: 'Cumplimiento normativo: facturación electrónica y Veri*Factu.',
        features: ['Facturación electrónica', 'Veri*Factu / SII', 'Modelos 303 y 390'],
      },
      {
        id: 'lotes',
        label: 'Lotes y caducidad',
        path: '/lotes',
        icon: Boxes,
        phase: 'pro',
        description: 'Trazabilidad por lote, caducidad o número de serie.',
        features: ['Alta de lote en recepción', 'Alertas de caducidad', 'Trazabilidad completa'],
      },
      {
        id: 'informes',
        label: 'Informes avanzados',
        path: '/informes',
        icon: BarChart3,
        phase: 'pro',
        description: 'Rentabilidad, rotación de stock y ranking de ventas.',
        features: ['Rentabilidad por producto/cliente/vendedor', 'Rotación de stock', 'Ranking de ventas'],
      },
      {
        id: 'multialmacen',
        label: 'Multi-almacén avanzado',
        path: '/multialmacen',
        icon: Warehouse,
        phase: 'pro',
        description: 'Transferencias entre almacenes y rutas de reparto.',
        features: ['Transferencias entre almacenes', 'Reserva de stock', 'Rutas de reparto'],
      },
    ],
  },
  {
    phase: 'advanced',
    title: 'Avanzado',
    badgeLabel: 'Fase 3',
    items: [
      {
        id: 'multiempresa',
        label: 'Multi-empresa / divisa',
        path: '/multiempresa',
        icon: Building2,
        phase: 'advanced',
        description: 'Gestión de varias sociedades o mercados con distinta divisa.',
        features: ['Varias sociedades en un mismo sistema', 'Multi-divisa', 'Consolidación de resultados'],
      },
      {
        id: 'crm',
        label: 'CRM comercial',
        path: '/crm',
        icon: Contact,
        phase: 'advanced',
        description: 'Seguimiento de oportunidades y objetivos comerciales.',
        features: ['Pipeline de oportunidades', 'Historial de contacto', 'Objetivos por comercial'],
      },
      {
        id: 'hardware',
        label: 'Hardware POS',
        path: '/hardware',
        icon: ScanLine,
        phase: 'advanced',
        description: 'Lectores de código de barras, impresoras de etiquetas y básculas.',
        features: ['Lectores de código de barras', 'Impresión de etiquetas', 'Básculas conectadas'],
      },
      {
        id: 'appmovil',
        label: 'App móvil',
        path: '/appmovil',
        icon: Smartphone,
        phase: 'advanced',
        description: 'App para comerciales en ruta y personal de almacén.',
        features: ['Consulta de stock en ruta', 'Pedidos in situ', 'Preparación de pedidos en almacén'],
      },
      {
        id: 'automatizacion',
        label: 'Automatización',
        path: '/automatizacion',
        icon: Zap,
        phase: 'advanced',
        description: 'Reposición automática y alertas predictivas de rotura.',
        features: ['Reposición automática de stock', 'Alertas predictivas de rotura', 'Reglas de negocio configurables'],
      },
    ],
  },
  {
    phase: 'optional',
    title: 'Funciones escalables',
    badgeLabel: 'Opcional',
    items: [
      {
        id: 'comercial-cliente',
        label: 'Comercial y cliente',
        path: '/escalable/comercial-cliente',
        icon: Gift,
        phase: 'optional',
        description: 'Diferenciadores de cara al cliente final.',
        features: [
          'Portal B2B de autoservicio (pedidos, histórico, facturas)',
          'Programa de fidelización por volumen histórico',
          'Firma electrónica de presupuestos y pedidos',
          'Chatbot de atención al cliente en la web',
          'Notificaciones automáticas de pedidos (email/WhatsApp)',
        ],
      },
      {
        id: 'operaciones-logistica',
        label: 'Operaciones y logística',
        path: '/escalable/operaciones-logistica',
        icon: RouteIcon,
        phase: 'optional',
        description: 'Eficiencia en almacén y transporte.',
        features: [
          'Integración con transportistas (etiquetas y seguimiento)',
          'Portal de proveedores con disponibilidad compartida',
          'Escaneo de código de barras vía móvil',
        ],
      },
      {
        id: 'inteligencia-negocio',
        label: 'Inteligencia de negocio',
        path: '/escalable/inteligencia-negocio',
        icon: LineChart,
        phase: 'optional',
        description: 'Datos para decidir, no solo para consultar.',
        features: [
          'Dashboards ejecutivos en tiempo real',
          'Previsión de demanda y sugerencia de reposición',
          'Analítica predictiva de rotura de stock',
        ],
      },
      {
        id: 'comercial-ampliado',
        label: 'Comercial ampliado',
        path: '/escalable/comercial-ampliado',
        icon: Handshake,
        phase: 'optional',
        description: 'Crecimiento hacia nuevos canales y mercados.',
        features: [
          'Integración con marketplaces (Amazon, eBay, ManoMano)',
          'Gestión de comisiones y objetivos por comercial',
          'Multi-idioma para expansión internacional',
        ],
      },
      {
        id: 'movilidad',
        label: 'Movilidad',
        path: '/escalable/movilidad',
        icon: MapPin,
        phase: 'optional',
        description: 'El equipo trabajando fuera de la oficina.',
        features: [
          'App para comerciales en ruta con geolocalización de clientes',
          'App de almacén para preparación de pedidos',
        ],
      },
    ],
  },
]

export const ALL_ITEMS: MenuItem[] = MENU_SECTIONS.flatMap((s) => s.items)
