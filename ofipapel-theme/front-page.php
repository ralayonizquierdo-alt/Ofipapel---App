<?php
defined('ABSPATH') || exit;
get_header();
?>

<?php get_template_part('template-parts/hero-slider'); ?>

<?php get_template_part('template-parts/trust-bar'); ?>

<?php get_template_part('template-parts/category-grid'); ?>

<?php get_template_part('template-parts/featured-products'); ?>

<?php get_template_part('template-parts/promo-banners'); ?>

<?php get_template_part('template-parts/catalogs-preview'); ?>

<!-- CTA visita tienda -->
<section class="store-cta section" style="background: linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%);">
    <div class="container">
        <div class="store-cta__inner">
            <div class="store-cta__text">
                <h2 class="store-cta__title">Visítanos en nuestras tiendas</h2>
                <p class="store-cta__subtitle">
                    Estamos en Los Cristianos, Tenerife. Nuestro equipo de especialistas te ayudará a encontrar exactamente lo que necesitas.
                </p>
                <div class="store-cta__hours">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span><?php echo esc_html(get_theme_mod('ofipapel_header_opening_hours', 'Lun–Vie 9:00–14:00 / 16:00–19:30 · Sáb 9:00–14:00')); ?></span>
                </div>
            </div>
            <div class="store-cta__actions">
                <a href="/contacto/" class="btn btn-white btn-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    Cómo llegar
                </a>
                <a href="tel:+34922794919" class="btn btn-cta btn-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.38 2 2 0 0 1 3.58 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l1.97-1.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    Llámanos
                </a>
            </div>
        </div>
    </div>
</section>

<?php get_footer(); ?>
