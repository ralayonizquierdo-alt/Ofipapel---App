<?php
defined('ABSPATH') || exit;

add_action('after_setup_theme', function () {
    load_theme_textdomain('ofipapel', OFIPAPEL_DIR . '/languages');

    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5', ['search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script']);
    add_theme_support('automatic-feed-links');
    add_theme_support('customize-selective-refresh-widgets');
    add_theme_support('responsive-embeds');

    // WooCommerce
    add_theme_support('woocommerce', [
        'thumbnail_image_width' => 400,
        'single_image_width'    => 600,
        'product_grid'          => [
            'default_rows'    => 4,
            'min_rows'        => 2,
            'max_rows'        => 8,
            'default_columns' => 4,
            'min_columns'     => 2,
            'max_columns'     => 5,
        ],
    ]);
    add_theme_support('wc-product-gallery-zoom');
    add_theme_support('wc-product-gallery-lightbox');
    add_theme_support('wc-product-gallery-slider');

    // Menús
    register_nav_menus([
        'primary'    => 'Menú principal (megamenú)',
        'categories' => 'Menú de categorías',
        'footer-1'   => 'Footer — Columna 1',
        'footer-2'   => 'Footer — Columna 2',
        'footer-3'   => 'Footer — Columna 3',
    ]);
});

/* ── Widget areas ──────────────────────────────────────────────────── */
add_action('widgets_init', function () {
    $sidebars = [
        ['name' => 'Sidebar tienda',      'id' => 'shop-sidebar'],
        ['name' => 'Footer — columna 1',  'id' => 'footer-1'],
        ['name' => 'Footer — columna 2',  'id' => 'footer-2'],
        ['name' => 'Footer — columna 3',  'id' => 'footer-3'],
        ['name' => 'Footer — columna 4',  'id' => 'footer-4'],
    ];

    foreach ($sidebars as $s) {
        register_sidebar([
            'name'          => $s['name'],
            'id'            => $s['id'],
            'before_widget' => '<div class="widget %2$s">',
            'after_widget'  => '</div>',
            'before_title'  => '<h3 class="widget-title">',
            'after_title'   => '</h3>',
        ]);
    }
});
