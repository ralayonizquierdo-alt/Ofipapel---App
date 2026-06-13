<?php get_header(); ?>

<div class="container">
    <div class="error-404" style="text-align:center; padding: var(--space-24) 0;">
        <div class="error-404__number" aria-hidden="true">404</div>
        <h1 class="error-404__title">Página no encontrada</h1>
        <p class="error-404__text">Lo sentimos, la página que buscas no existe o ha sido movida.</p>
        <div class="error-404__actions">
            <a href="<?php echo esc_url(home_url('/')); ?>" class="btn btn-primary btn-lg">Ir al inicio</a>
            <?php if (class_exists('WooCommerce')): ?>
            <a href="<?php echo esc_url(wc_get_page_permalink('shop')); ?>" class="btn btn-outline btn-lg">Ver la tienda</a>
            <?php endif; ?>
        </div>
    </div>
</div>

<?php get_footer(); ?>
