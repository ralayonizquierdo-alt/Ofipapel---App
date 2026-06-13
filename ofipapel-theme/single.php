<?php get_header(); ?>

<div class="container">
    <div class="page-layout">
        <main class="page-content">
            <?php while (have_posts()): the_post(); ?>
            <article id="post-<?php the_ID(); ?>" <?php post_class('single-article'); ?>>
                <header class="single-article__header">
                    <div class="breadcrumbs">
                        <a href="<?php echo home_url(); ?>">Inicio</a>
                        <span class="sep">›</span>
                        <span><?php the_title(); ?></span>
                    </div>
                    <h1 class="single-article__title"><?php the_title(); ?></h1>
                    <div class="single-article__meta">
                        <time datetime="<?php echo get_the_date('c'); ?>"><?php echo get_the_date(); ?></time>
                    </div>
                </header>
                <?php if (has_post_thumbnail()): ?>
                    <?php the_post_thumbnail('large', ['class' => 'single-article__img']); ?>
                <?php endif; ?>
                <div class="single-article__content entry-content">
                    <?php the_content(); ?>
                </div>
            </article>
            <?php endwhile; ?>
        </main>
        <?php get_sidebar(); ?>
    </div>
</div>

<?php get_footer(); ?>
