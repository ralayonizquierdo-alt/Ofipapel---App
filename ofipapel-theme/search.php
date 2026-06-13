<?php get_header(); ?>

<div class="container">
    <header class="archive-header">
        <h1 class="archive-title">
            <?php if (get_search_query()): ?>
                Resultados para: <em><?php echo esc_html(get_search_query()); ?></em>
            <?php else: ?>
                Búsqueda
            <?php endif; ?>
        </h1>
    </header>

    <?php if (have_posts()): ?>
    <div class="products-grid">
        <?php while (have_posts()): the_post(); ?>
            <?php if (get_post_type() === 'product' && class_exists('WooCommerce')): ?>
                <?php wc_get_template_part('content', 'product'); ?>
            <?php else: ?>
                <article <?php post_class('post-card'); ?>>
                    <div class="post-card__body">
                        <h2 class="post-card__title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
                        <div class="post-card__excerpt"><?php the_excerpt(); ?></div>
                        <a href="<?php the_permalink(); ?>" class="btn btn-outline btn-sm">Ver más</a>
                    </div>
                </article>
            <?php endif; ?>
        <?php endwhile; ?>
    </div>

    <?php the_posts_navigation(); ?>

    <?php else: ?>
    <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <h2>Sin resultados</h2>
        <p>No encontramos productos que coincidan con "<?php echo esc_html(get_search_query()); ?>".</p>
        <a href="<?php echo esc_url(class_exists('WooCommerce') ? wc_get_page_permalink('shop') : home_url()); ?>" class="btn btn-primary">Ver todo el catálogo</a>
    </div>
    <?php endif; ?>
</div>

<?php get_footer(); ?>
