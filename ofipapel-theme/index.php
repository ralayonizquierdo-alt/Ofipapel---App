<?php get_header(); ?>

<div class="container">
    <div class="main-layout">
        <div class="content-area">
            <?php if (have_posts()): while (have_posts()): the_post(); ?>
                <article id="post-<?php the_ID(); ?>" <?php post_class('post-card'); ?>>
                    <?php if (has_post_thumbnail()): ?>
                        <a href="<?php the_permalink(); ?>" class="post-card__thumbnail-link" tabindex="-1" aria-hidden="true">
                            <?php the_post_thumbnail('medium_large', ['class' => 'post-card__thumbnail']); ?>
                        </a>
                    <?php endif; ?>
                    <div class="post-card__body">
                        <h2 class="post-card__title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
                        <div class="post-card__excerpt"><?php the_excerpt(); ?></div>
                        <a href="<?php the_permalink(); ?>" class="btn btn-outline btn-sm">Leer más</a>
                    </div>
                </article>
            <?php endwhile;
            the_posts_navigation();
            else: ?>
                <p><?php esc_html_e('No se encontró contenido.', 'ofipapel'); ?></p>
            <?php endif; ?>
        </div>
        <?php get_sidebar(); ?>
    </div>
</div>

<?php get_footer(); ?>
