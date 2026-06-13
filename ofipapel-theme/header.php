<!doctype html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="profile" href="https://gmpg.org/xfn/11">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<a class="skip-link" href="#main-content">Saltar al contenido principal</a>

<!-- ══════════════════════════════════════════════════════════════════
     TOP BAR
     ══════════════════════════════════════════════════════════════════ -->
<div class="top-bar" role="banner">
    <div class="container">
        <div class="top-bar__inner">
            <div class="top-bar__left">
                <?php $hours = get_theme_mod('ofipapel_header_opening_hours', 'Lun–Vie 9:00–14:00 / 16:00–19:30 · Sáb 9:00–14:00'); ?>
                <span class="top-bar__item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <?php echo esc_html($hours); ?>
                </span>
                <?php $shipping = get_theme_mod('ofipapel_header_free_shipping', 'Envío gratuito en pedidos superiores a 50€'); ?>
                <span class="top-bar__item top-bar__shipping">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                    <?php echo esc_html($shipping); ?>
                </span>
            </div>
            <div class="top-bar__right">
                <?php $phone = get_theme_mod('ofipapel_header_phone', '+34 922 79 49 19'); ?>
                <a class="top-bar__phone" href="tel:<?php echo esc_attr(preg_replace('/\s+/', '', $phone)); ?>">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.38 2 2 0 0 1 3.58 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l1.97-1.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <?php echo esc_html($phone); ?>
                </a>
                <?php if (class_exists('WooCommerce') && is_user_logged_in()): ?>
                    <a class="top-bar__link" href="<?php echo esc_url(wc_get_account_endpoint_url('dashboard')); ?>">Mi cuenta</a>
                <?php elseif (class_exists('WooCommerce')): ?>
                    <a class="top-bar__link" href="<?php echo esc_url(wc_get_account_endpoint_url('dashboard')); ?>">Iniciar sesión</a>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<!-- ══════════════════════════════════════════════════════════════════
     HEADER PRINCIPAL
     ══════════════════════════════════════════════════════════════════ -->
<header class="site-header" id="site-header" role="banner">
    <div class="container">
        <div class="site-header__inner">

            <!-- Logo -->
            <div class="site-header__logo">
                <a href="<?php echo esc_url(home_url('/')); ?>" rel="home" aria-label="<?php bloginfo('name'); ?> — Inicio">
                    <?php if (has_custom_logo()): ?>
                        <?php the_custom_logo(); ?>
                    <?php else: ?>
                        <span class="site-header__logo-text"><?php bloginfo('name'); ?></span>
                    <?php endif; ?>
                </a>
            </div>

            <!-- Buscador -->
            <div class="site-header__search">
                <?php if (class_exists('WooCommerce')): ?>
                    <form role="search" method="get" action="<?php echo esc_url(home_url('/')); ?>" class="search-form">
                        <label class="sr-only" for="header-search">Buscar productos</label>
                        <input
                            type="search"
                            id="header-search"
                            class="search-form__input"
                            placeholder="¿Qué estás buscando?"
                            value="<?php echo esc_attr(get_search_query()); ?>"
                            name="s"
                            autocomplete="off"
                        >
                        <input type="hidden" name="post_type" value="product">
                        <button type="submit" class="search-form__btn" aria-label="Buscar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        </button>
                    </form>
                <?php endif; ?>
            </div>

            <!-- Acciones header: cuenta y carrito -->
            <div class="site-header__actions">
                <?php if (class_exists('WooCommerce')): ?>
                    <a href="<?php echo esc_url(wc_get_account_endpoint_url('dashboard')); ?>" class="header-action" aria-label="Mi cuenta">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span class="header-action__label hide-sm">
                            <?php echo is_user_logged_in() ? 'Mi cuenta' : 'Acceder'; ?>
                        </span>
                    </a>

                    <a href="<?php echo esc_url(wc_get_cart_url()); ?>" class="header-action header-action--cart" aria-label="Carrito de compra">
                        <span class="header-action__icon-wrap">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                            <span class="cart-count" aria-label="productos en el carrito">
                                <?php echo WC()->cart ? WC()->cart->get_cart_contents_count() : 0; ?>
                            </span>
                        </span>
                        <span class="header-action__label hide-sm">Carrito</span>
                    </a>
                <?php endif; ?>

                <!-- Botón hamburguesa móvil -->
                <button class="nav-toggle" id="nav-toggle" aria-controls="primary-nav" aria-expanded="false" aria-label="Abrir menú de navegación">
                    <span class="nav-toggle__bar"></span>
                    <span class="nav-toggle__bar"></span>
                    <span class="nav-toggle__bar"></span>
                </button>
            </div>

        </div>
    </div>

    <!-- ── Megamenú de navegación ─────────────────────────────────── -->
    <nav class="main-nav" id="primary-nav" aria-label="Navegación principal" role="navigation">
        <div class="container">
            <?php
            wp_nav_menu([
                'theme_location'  => 'primary',
                'menu_id'         => 'primary-menu',
                'menu_class'      => 'nav-menu',
                'container'       => false,
                'fallback_cb'     => 'ofipapel_fallback_nav',
                'walker'          => class_exists('Ofipapel_Walker_Nav') ? new Ofipapel_Walker_Nav() : null,
            ]);
            ?>
        </div>
    </nav>
</header>
<!-- /site-header -->

<main id="main-content" class="main-content" tabindex="-1">
