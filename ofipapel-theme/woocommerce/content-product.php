<?php defined('ABSPATH') || exit;

global $product;
if (!is_a($product, 'WC_Product')) return;
?>

<article <?php wc_product_class('product-card', $product); ?>>
    <a href="<?php the_permalink(); ?>" class="product-card__image-link" tabindex="-1" aria-hidden="true">
        <div class="product-card__image-wrap">
            <?php if (has_post_thumbnail()): ?>
                <?php the_post_thumbnail('product-card', ['class' => 'product-card__image', 'loading' => 'lazy']); ?>
            <?php else: ?>
                <div class="product-card__image product-card__image--placeholder" aria-hidden="true">
                    <?php echo wc_placeholder_img('product-card'); ?>
                </div>
            <?php endif; ?>

            <?php if ($product->is_on_sale()): ?>
                <?php
                $regular = (float) $product->get_regular_price();
                $sale    = (float) $product->get_sale_price();
                $pct     = $regular > 0 ? round((($regular - $sale) / $regular) * 100) : 0;
                ?>
                <span class="badge badge-sale product-card__badge">-<?php echo $pct; ?>%</span>
            <?php elseif ($product->is_featured()): ?>
                <span class="badge badge-new product-card__badge">Nuevo</span>
            <?php endif; ?>

            <div class="product-card__hover-actions" aria-hidden="true">
                <a href="<?php the_permalink(); ?>" class="btn btn-primary btn-sm">Ver producto</a>
            </div>
        </div>
    </a>

    <div class="product-card__body">
        <div class="product-card__cats">
            <?php echo wc_get_product_category_list($product->get_id(), ' · '); ?>
        </div>

        <h2 class="product-card__title woocommerce-loop-product__title">
            <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
        </h2>

        <?php if (wc_review_ratings_enabled() && $product->get_average_rating()): ?>
        <div class="product-card__rating" role="img" aria-label="Valoración <?php echo round($product->get_average_rating(), 1); ?> de 5 estrellas">
            <?php for ($i = 1; $i <= 5; $i++): ?>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                     fill="<?php echo $i <= round($product->get_average_rating()) ? 'var(--color-cta)' : 'none'; ?>"
                     stroke="var(--color-cta)" stroke-width="2" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
            <?php endfor; ?>
            <span class="product-card__rating-count">(<?php echo $product->get_rating_count(); ?>)</span>
        </div>
        <?php endif; ?>

        <div class="product-card__price">
            <?php echo wp_kses_post($product->get_price_html()); ?>
        </div>

        <div class="product-card__add-to-cart">
            <?php woocommerce_template_loop_add_to_cart(['quantity' => 1]); ?>
        </div>
    </div>
</article>
