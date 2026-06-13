<?php
defined('ABSPATH') || exit;

add_action('customize_register', function (WP_Customize_Manager $wp_customize) {

    /* ── Panel Ofipapel ─────────────────────────────────────────────── */
    $wp_customize->add_panel('ofipapel_panel', [
        'title'    => 'Ofipapel — Ajustes del tema',
        'priority' => 10,
    ]);

    /* ════════ SECCIÓN: Identidad corporativa ═══════════════════════ */
    $wp_customize->add_section('ofipapel_brand', [
        'title'    => 'Colores corporativos',
        'panel'    => 'ofipapel_panel',
        'priority' => 10,
    ]);

    $colors = [
        'primary'      => ['label' => 'Verde principal',    'default' => '#33B540'],
        'primary_dark' => ['label' => 'Verde oscuro',       'default' => '#1D7A22'],
        'lime'         => ['label' => 'Lima / amarillo',    'default' => '#AECC30'],
        'blue'         => ['label' => 'Azul acento',        'default' => '#4299C4'],
        'cta'          => ['label' => 'Naranja CTA',        'default' => '#F5A623'],
    ];

    foreach ($colors as $key => $data) {
        $wp_customize->add_setting("ofipapel_color_{$key}", [
            'default'           => $data['default'],
            'sanitize_callback' => 'sanitize_hex_color',
            'transport'         => 'postMessage',
        ]);
        $wp_customize->add_control(new WP_Customize_Color_Control($wp_customize, "ofipapel_color_{$key}", [
            'label'   => $data['label'],
            'section' => 'ofipapel_brand',
        ]));
    }

    /* ════════ SECCIÓN: Header / Topbar ═════════════════════════════ */
    $wp_customize->add_section('ofipapel_header', [
        'title'    => 'Header y barra superior',
        'panel'    => 'ofipapel_panel',
        'priority' => 20,
    ]);

    $header_settings = [
        'phone'          => ['Teléfono',           '+34 922 79 49 19'],
        'phone_2'        => ['Teléfono 2',         '+34 922 79 49 20'],
        'opening_hours'  => ['Horario',            'Lun–Vie 9:00–14:00 / 16:00–19:30 · Sáb 9:00–14:00'],
        'free_shipping'  => ['Texto envío gratis', 'Envío gratuito en pedidos superiores a 50€'],
    ];

    foreach ($header_settings as $key => $data) {
        $wp_customize->add_setting("ofipapel_header_{$key}", [
            'default'           => $data[1],
            'sanitize_callback' => 'sanitize_text_field',
        ]);
        $wp_customize->add_control("ofipapel_header_{$key}", [
            'label'   => $data[0],
            'section' => 'ofipapel_header',
            'type'    => 'text',
        ]);
    }

    /* ════════ SECCIÓN: Hero ════════════════════════════════════════ */
    $wp_customize->add_section('ofipapel_hero', [
        'title'    => 'Hero / Banner principal',
        'panel'    => 'ofipapel_panel',
        'priority' => 30,
    ]);

    for ($i = 1; $i <= 3; $i++) {
        // Título slide
        $wp_customize->add_setting("ofipapel_hero_{$i}_title", [
            'default'           => $i === 1 ? 'Todo lo que tu oficina necesita' : "Slide {$i} — Título",
            'sanitize_callback' => 'sanitize_text_field',
        ]);
        $wp_customize->add_control("ofipapel_hero_{$i}_title", [
            'label'   => "Slide {$i} — Título",
            'section' => 'ofipapel_hero',
            'type'    => 'text',
        ]);

        // Subtítulo
        $wp_customize->add_setting("ofipapel_hero_{$i}_subtitle", [
            'default'           => $i === 1 ? 'Suministros de oficina, papelería e informática en Tenerife y Canarias.' : '',
            'sanitize_callback' => 'sanitize_text_field',
        ]);
        $wp_customize->add_control("ofipapel_hero_{$i}_subtitle", [
            'label'   => "Slide {$i} — Subtítulo",
            'section' => 'ofipapel_hero',
            'type'    => 'textarea',
        ]);

        // URL del botón
        $wp_customize->add_setting("ofipapel_hero_{$i}_url", [
            'default'           => '/tienda',
            'sanitize_callback' => 'esc_url_raw',
        ]);
        $wp_customize->add_control("ofipapel_hero_{$i}_url", [
            'label'   => "Slide {$i} — URL del botón",
            'section' => 'ofipapel_hero',
            'type'    => 'url',
        ]);

        // Imagen de fondo
        $wp_customize->add_setting("ofipapel_hero_{$i}_image", [
            'default'           => '',
            'sanitize_callback' => 'absint',
        ]);
        $wp_customize->add_control(new WP_Customize_Media_Control($wp_customize, "ofipapel_hero_{$i}_image", [
            'label'     => "Slide {$i} — Imagen de fondo",
            'section'   => 'ofipapel_hero',
            'mime_type' => 'image',
        ]));
    }

    /* ════════ SECCIÓN: Tiendas / Contacto ══════════════════════════ */
    $wp_customize->add_section('ofipapel_stores', [
        'title'    => 'Datos de tiendas',
        'panel'    => 'ofipapel_panel',
        'priority' => 40,
    ]);

    $stores = [
        1 => ['Tienda Los Cristianos', 'Bulevar Chajofe, 4 — 38650 Los Cristianos, Tenerife'],
        2 => ['Tienda Avenida Suecia',  'Av. de Suecia, 7 — 38650 Los Cristianos, Tenerife'],
    ];

    foreach ($stores as $n => $defaults) {
        foreach (['name' => $defaults[0], 'address' => $defaults[1], 'phone' => '+34 922 79 49 19', 'hours' => 'Lun–Vie 9:00–14:00 / 16:00–19:30 · Sáb 9:00–14:00'] as $field => $default) {
            $wp_customize->add_setting("ofipapel_store_{$n}_{$field}", [
                'default'           => $default,
                'sanitize_callback' => 'sanitize_text_field',
            ]);
            $wp_customize->add_control("ofipapel_store_{$n}_{$field}", [
                'label'   => "Tienda {$n} — " . ucfirst($field),
                'section' => 'ofipapel_stores',
                'type'    => 'text',
            ]);
        }
    }

    // Maps embed URL
    $wp_customize->add_setting('ofipapel_maps_embed', [
        'default'           => 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3522.1!2d-16.71!3d28.05!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjjCsDAzJzAwLjAiTiAxNsKwNDInMzYuMCJX!5e0!3m2!1ses!2ses!4v1',
        'sanitize_callback' => 'esc_url_raw',
    ]);
    $wp_customize->add_control('ofipapel_maps_embed', [
        'label'   => 'URL embed de Google Maps',
        'section' => 'ofipapel_stores',
        'type'    => 'url',
    ]);
});

/* ── Output CSS desde customizer ─────────────────────────────────── */
add_action('wp_head', function () {
    $overrides = [
        '--color-primary'      => get_theme_mod('ofipapel_color_primary',      '#33B540'),
        '--color-primary-dark' => get_theme_mod('ofipapel_color_primary_dark', '#1D7A22'),
        '--color-lime'         => get_theme_mod('ofipapel_color_lime',         '#AECC30'),
        '--color-blue'         => get_theme_mod('ofipapel_color_blue',         '#4299C4'),
        '--color-cta'          => get_theme_mod('ofipapel_color_cta',          '#F5A623'),
    ];

    $css = ':root{';
    foreach ($overrides as $var => $value) {
        $css .= "{$var}:{$value};";
    }
    $css .= '}';

    echo "<style id='ofipapel-customizer-css'>{$css}</style>\n";
});
