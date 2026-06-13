<?php defined('ABSPATH') || exit;

if (!class_exists('WooCommerce')) return;

$args = [
    'post_type'      => 'product',
    'posts_per_page' => 8,
    'orderby'        => 'rand',
    'post_status'    => 'publish',
    'tax_query'      => [[
        'taxonomy' => 'product_visibility',
        'field'    => 'name',
        'terms'    => 'featured',
    ]],
];

$featured_query = new WP_Query($args);
if (!$featured_query->have_posts()) return;
?>

<section class="featured-products section" aria-labelledby="featured-heading">
    <div class="container">
        <div class="section-header" style="display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:1rem;">
            <div>
                <h2 class="section-title" id="featured-heading">Productos destacados</h2>
                <p class="section-subtitle">Selección de los más vendidos y mejor valorados</p>
            </div>
            <a href="<?php echo esc_url(wc_get_page_permalink('shop')); ?>" class="btn btn-outline btn-sm">
                Ver todos
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
        </div>

        <div class="products-grid" role="list">
            <?php while ($featured_query->have_posts()): $featured_query->the_post();
                global $product;
            ?>
            <div class="product-card" role="listitem">
                <a href="<?php the_permalink(); ?>" class="product-card__link" tabindex="-1" aria-hidden="true">
                    <div class="product-card__image-wrap">
                        <?php if (has_post_thumbnail()): ?>
                            <?php the_post_thumbnail('product-card', ['class' => 'product-card__image', 'loading' => 'lazy']); ?>
                        <?php else: ?>
                            <div class="product-card__image product-card__image--placeholder">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            </div>
                        <?php endif; ?>

                        <?php if ($product->is_on_sale()): ?>
                            <span class="badge badge-sale product-card__badge">Oferta</span>
                        <?php elseif ($product->is_featured()): ?>
                            <span class="badge badge-new product-card__badge">Destacado</span>
                        <?php endif; ?>

                        <div class="product-card__overlay">
                            <a href="<?php the_permalink(); ?>" class="btn btn-primary btn-sm">Ver producto</a>
                            <?php woocommerce_template_loop_add_to_cart(); ?>
                        </div>
                    </div>
                </a>

                <div class="product-card__info">
                    <div class="product-card__cats">
                        <?php
                        $cats = wc_get_product_category_list($product->get_id(), ', ', '<span>', '</span>');
                        echo wp_kses_post($cats);
                        ?>
                    </div>
                    <h3 class="product-card__title">
                        <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
                    </h3>
                    <div class="product-card__price">
                        <?php echo wp_kses_post($product->get_price_html()); ?>
                    </div>
                    <?php if ($product->get_average_rating()): ?>
                    <div class="product-card__rating" aria-label="Valoración: <?php echo $product->get_average_rating(); ?> de 5">
                        <?php for ($i = 1; $i <= 5; $i++): ?>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="<?php echo $i <= round($product->get_average_rating()) ? 'var(--color-cta)' : 'none'; ?>" stroke="var(--color-cta)" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        <?php endfor; ?>
                    </div>
                    <?php endif; ?>
                </div>
            </div>
            <?php endwhile; wp_reset_postdata(); ?>
        </div>
    </div>
</section>
