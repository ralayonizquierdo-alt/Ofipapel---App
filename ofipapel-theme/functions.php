<?php
defined('ABSPATH') || exit;

define('OFIPAPEL_VERSION', '1.0.0');
define('OFIPAPEL_DIR', get_template_directory());
define('OFIPAPEL_URI', get_template_directory_uri());

/* ── Includes ─────────────────────────────────────────────────────── */
require_once OFIPAPEL_DIR . '/inc/theme-setup.php';
require_once OFIPAPEL_DIR . '/inc/woocommerce-functions.php';
require_once OFIPAPEL_DIR . '/inc/customizer.php';

/* ── Enqueue assets ───────────────────────────────────────────────── */
add_action('wp_enqueue_scripts', function () {
    // Google Fonts
    wp_enqueue_style(
        'ofipapel-fonts',
        'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap',
        [],
        null
    );

    // Main stylesheet (style.css = theme header only, real styles in main.css)
    wp_enqueue_style('ofipapel-style', get_stylesheet_uri(), ['ofipapel-fonts'], OFIPAPEL_VERSION);

    // Main CSS
    wp_enqueue_style('ofipapel-main', OFIPAPEL_URI . '/assets/css/main.css', ['ofipapel-style'], OFIPAPEL_VERSION);

    // WooCommerce CSS (solo si WC está activo)
    if (class_exists('WooCommerce')) {
        wp_enqueue_style('ofipapel-woocommerce', OFIPAPEL_URI . '/assets/css/woocommerce.css', ['ofipapel-main'], OFIPAPEL_VERSION);
    }

    // Main JS
    wp_enqueue_script('ofipapel-main', OFIPAPEL_URI . '/assets/js/main.js', [], OFIPAPEL_VERSION, true);

    // Catalog viewer (solo en página de catálogos)
    if (is_page_template('page-catalogos.php') || is_page('catalogos')) {
        wp_enqueue_script('ofipapel-catalog', OFIPAPEL_URI . '/assets/js/catalog-viewer.js', ['ofipapel-main'], OFIPAPEL_VERSION, true);
    }

    // Pasar datos a JS
    wp_localize_script('ofipapel-main', 'ofipapelData', [
        'ajaxUrl'  => admin_url('admin-ajax.php'),
        'nonce'    => wp_create_nonce('ofipapel_nonce'),
        'cartUrl'  => class_exists('WooCommerce') ? wc_get_cart_url() : '',
        'currency' => class_exists('WooCommerce') ? get_woocommerce_currency_symbol() : '€',
    ]);
});

/* ── Admin styles ─────────────────────────────────────────────────── */
add_action('admin_enqueue_scripts', function () {
    wp_enqueue_style('ofipapel-admin', OFIPAPEL_URI . '/assets/css/admin.css', [], OFIPAPEL_VERSION);
});

/* ── CPT: Catálogo ────────────────────────────────────────────────── */
add_action('init', function () {
    register_post_type('catalogo', [
        'labels' => [
            'name'               => 'Catálogos',
            'singular_name'      => 'Catálogo',
            'add_new'            => 'Añadir catálogo',
            'add_new_item'       => 'Añadir nuevo catálogo',
            'edit_item'          => 'Editar catálogo',
            'view_item'          => 'Ver catálogo',
            'all_items'          => 'Todos los catálogos',
            'search_items'       => 'Buscar catálogos',
            'not_found'          => 'No se encontraron catálogos',
        ],
        'public'             => true,
        'show_in_rest'       => true,
        'supports'           => ['title', 'editor', 'thumbnail', 'excerpt', 'custom-fields'],
        'menu_icon'          => 'dashicons-media-document',
        'menu_position'      => 5,
        'has_archive'        => false,
        'rewrite'            => ['slug' => 'catalogos'],
    ]);
});

/* ── Custom image sizes ───────────────────────────────────────────── */
add_action('after_setup_theme', function () {
    add_image_size('catalog-thumb',    400, 566, true);
    add_image_size('product-card',     400, 400, true);
    add_image_size('category-icon',    120, 120, true);
    add_image_size('hero-banner',     1920, 600, true);
    add_image_size('promo-banner',     800, 400, true);
}, 11);

/* ── Helpers ──────────────────────────────────────────────────────── */

/**
 * Devuelve el SVG de un icono de categoría por slug.
 */
function ofipapel_category_icon(string $slug): string {
    $icons = [
        'archivo-y-clasificacion' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        'papel-y-etiquetas'       => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
        'escritura-y-correccion'  => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
        'informatica'             => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
        'mobiliario-de-oficina'   => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg>',
        'embalaje'                => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        'escolar'                 => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        'ofimatica'               => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="14" x2="22" y2="14"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="14" x2="4" y2="14"/></svg>',
        'servicios-generales'     => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>',
        'default'                 => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    ];
    return $icons[$slug] ?? $icons['default'];
}

/**
 * Formatea precio WooCommerce con estilo.
 */
function ofipapel_price_html(float $price): string {
    return '<span class="price-amount">' . wc_price($price) . '</span>';
}

/* ── Fallback nav (sin menú configurado) ──────────────────────────── */
function ofipapel_fallback_nav() {
    $cats = get_terms(['taxonomy' => 'product_cat', 'orderby' => 'name', 'hide_empty' => true, 'parent' => 0, 'number' => 8]);
    echo '<ul class="nav-menu">';
    echo '<li><a href="' . esc_url(home_url('/')) . '">Inicio</a></li>';
    if (!is_wp_error($cats)) {
        foreach ($cats as $cat) {
            echo '<li><a href="' . esc_url(get_term_link($cat)) . '">' . esc_html($cat->name) . '</a></li>';
        }
    }
    echo '<li><a href="/catalogos/">Catálogos</a></li>';
    echo '<li><a href="/contacto/">Contacto</a></li>';
    echo '</ul>';
}
