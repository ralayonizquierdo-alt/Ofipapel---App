<?php get_header(); ?>

<div class="container">
    <div class="page-layout">
        <main class="page-content">
            <?php while (have_posts()): the_post(); ?>
            <article id="post-<?php the_ID(); ?>" <?php post_class('page-article'); ?>>
                <header class="page-article__header">
                    <h1 class="page-article__title"><?php the_title(); ?></h1>
                </header>
                <?php if (has_post_thumbnail()): ?>
                    <?php the_post_thumbnail('large', ['class' => 'page-article__featured-image']); ?>
                <?php endif; ?>
                <div class="page-article__content entry-content">
                    <?php the_content(); ?>
                </div>
            </article>
            <?php endwhile; ?>
        </main>
        <?php get_sidebar(); ?>
    </div>
</div>

<?php get_footer(); ?>
