<?php defined('ABSPATH') || exit;
get_header();
?>

<div class="shop-page">
    <div class="container">

        <?php if (is_product_category()): ?>
        <!-- Hero de categoría -->
        <div class="category-hero">
            <?php
            $cat = get_queried_object();
            $thumbnail_id = get_term_meta($cat->term_id, 'thumbnail_id', true);
            $thumbnail_url = $thumbnail_id ? wp_get_attachment_image_url($thumbnail_id, 'promo-banner') : '';
            ?>
            <div class="category-hero__content" <?php if ($thumbnail_url): ?>style="background-image:url('<?php echo esc_url($thumbnail_url); ?>')"<?php endif; ?>>
                <div class="category-hero__overlay"></div>
                <div class="category-hero__inner">
                    <div class="category-hero__icon" aria-hidden="true">
                        <?php echo ofipapel_category_icon($cat->slug); ?>
                    </div>
                    <div>
                        <h1 class="category-hero__title"><?php echo esc_html($cat->name); ?></h1>
                        <?php if ($cat->description): ?>
                            <p class="category-hero__desc"><?php echo esc_html($cat->description); ?></p>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
        <?php else: ?>
        <div class="shop-header">
            <h1 class="shop-title"><?php woocommerce_page_title(); ?></h1>
        </div>
        <?php endif; ?>

        <!-- Breadcrumbs -->
        <div class="shop-breadcrumbs">
            <?php woocommerce_breadcrumb(); ?>
        </div>

        <div class="shop-layout">

            <!-- Sidebar -->
            <aside class="shop-sidebar" aria-label="Filtros">
                <div class="shop-sidebar__inner">
                    <!-- Categorías -->
                    <div class="sidebar-widget">
                        <h3 class="sidebar-widget__title">Categorías</h3>
                        <?php
                        $cat_args = [
                            'taxonomy'   => 'product_cat',
                            'orderby'    => 'name',
                            'show_count' => 1,
                            'pad_counts' => 1,
                            'hierarchical' => 1,
                            'hide_empty' => 1,
                            'title_li'   => '',
                            'depth'      => 2,
                        ];
                        echo '<ul class="sidebar-cats">';
                        wp_list_categories($cat_args);
                        echo '</ul>';
                        ?>
                    </div>

                    <!-- Filtro de precio WC -->
                    <?php if (is_active_sidebar('shop-sidebar')): ?>
                        <?php dynamic_sidebar('shop-sidebar'); ?>
                    <?php endif; ?>
                </div>
            </aside>

            <!-- Grid de productos -->
            <div class="shop-main">
                <?php if (woocommerce_product_loop()): ?>

                <!-- Barra de herramientas: conteo + ordenar -->
                <div class="shop-toolbar">
                    <div class="shop-toolbar__count">
                        <?php woocommerce_result_count(); ?>
                    </div>
                    <div class="shop-toolbar__ordering">
                        <?php woocommerce_catalog_ordering(); ?>
                    </div>
                </div>

                <?php woocommerce_product_loop_start(); ?>
                <?php while (have_posts()): the_post(); ?>
                    <?php wc_get_template_part('content', 'product'); ?>
                <?php endwhile; ?>
                <?php woocommerce_product_loop_end(); ?>

                <div class="shop-pagination">
                    <?php woocommerce_pagination(); ?>
                </div>

                <?php else: ?>
                <div class="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <h2>No se encontraron productos</h2>
                    <p>Intenta ajustar los filtros o busca otro producto.</p>
                    <a href="<?php echo esc_url(wc_get_page_permalink('shop')); ?>" class="btn btn-primary">Ver todo el catálogo</a>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<?php get_footer(); ?>
