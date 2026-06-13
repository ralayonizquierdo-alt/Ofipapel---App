<?php
defined('ABSPATH') || exit;

if (!class_exists('WooCommerce')) return;

/* ── Eliminar estilos por defecto de WC que sobreescribiremos ──────── */
add_filter('woocommerce_enqueue_styles', '__return_empty_array');

/* ── Layout de productos: 4 columnas en tienda ─────────────────────── */
add_filter('loop_shop_columns', fn() => 4);
add_filter('loop_shop_per_page', fn() => 16);

/* ── Quitar sidebar lateral de WooCommerce (usamos el nuestro) ─────── */
remove_action('woocommerce_sidebar', 'woocommerce_get_sidebar', 10);

/* ── Breadcrumb personalizado ──────────────────────────────────────── */
add_filter('woocommerce_breadcrumb_defaults', function ($defaults) {
    $defaults['delimiter']   = '<span class="sep">›</span>';
    $defaults['wrap_before'] = '<nav class="breadcrumbs" aria-label="Breadcrumb"><ol itemscope itemtype="https://schema.org/BreadcrumbList">';
    $defaults['wrap_after']  = '</ol></nav>';
    $defaults['before']      = '<li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">';
    $defaults['after']       = '</li>';
    return $defaults;
});

/* ── Número de imágenes en la galería del producto ─────────────────── */
add_filter('woocommerce_product_thumbnails_columns', fn() => 4);

/* ── Quitar campos innecesarios del checkout ───────────────────────── */
add_filter('woocommerce_checkout_fields', function ($fields) {
    unset($fields['billing']['billing_company']);
    return $fields;
});

/* ── Añadir clase al body en páginas WC ────────────────────────────── */
add_filter('body_class', function ($classes) {
    if (is_woocommerce() || is_cart() || is_checkout() || is_account_page()) {
        $classes[] = 'woocommerce-page';
    }
    return $classes;
});

/* ── Mostrar conteo de resultados y ordenar ────────────────────────── */
add_action('woocommerce_before_shop_loop', 'woocommerce_result_count', 20);
add_action('woocommerce_before_shop_loop', 'woocommerce_catalog_ordering', 30);

/* ── Flash messages como toasts ────────────────────────────────────── */
add_filter('woocommerce_add_to_cart_fragments', function ($fragments) {
    ob_start();
    ?>
    <span class="cart-count"><?= WC()->cart->get_cart_contents_count(); ?></span>
    <?php
    $fragments['.cart-count'] = ob_get_clean();
    return $fragments;
});

/* ── Deshabilitar reviews si no se usan ────────────────────────────── */
// add_filter('woocommerce_product_tabs', function($tabs) {
//     unset($tabs['reviews']);
//     return $tabs;
// });
