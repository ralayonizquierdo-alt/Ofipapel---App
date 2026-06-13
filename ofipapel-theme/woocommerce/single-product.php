<?php defined('ABSPATH') || exit;
get_header();
?>

<div class="single-product-page">
    <div class="container">

        <!-- Breadcrumbs -->
        <div class="shop-breadcrumbs">
            <?php woocommerce_breadcrumb(); ?>
        </div>

        <?php while (have_posts()): the_post(); ?>
        <?php wc_get_template_part('content', 'single-product'); ?>
        <?php endwhile; ?>

    </div>
</div>

<?php get_footer(); ?>
