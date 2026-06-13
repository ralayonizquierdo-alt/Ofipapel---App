<?php defined('ABSPATH') || exit; ?>

<section class="category-grid section-sm" aria-labelledby="cats-heading">
    <div class="container">
        <div class="section-header">
            <h2 class="section-title" id="cats-heading">Comprar por categoría</h2>
            <p class="section-subtitle">Encuentra todo lo que necesitas para tu oficina, empresa o escuela</p>
        </div>

        <?php
        $categories = [];

        if (class_exists('WooCommerce')) {
            $categories = get_terms([
                'taxonomy'   => 'product_cat',
                'orderby'    => 'menu_order',
                'order'      => 'ASC',
                'hide_empty' => true,
                'parent'     => 0,
                'number'     => 9,
                'exclude'    => [get_option('default_product_cat')],
            ]);
        }

        // Fallback con categorías estáticas si WC no está activo o no hay términos
        if (empty($categories) || is_wp_error($categories)):
            $static_cats = [
                ['name' => 'Archivo y Clasificación',  'slug' => 'archivo-y-clasificacion',  'url' => '/categoria-producto/archivo-y-clasificacion/'],
                ['name' => 'Papel y Etiquetas',        'slug' => 'papel-y-etiquetas',        'url' => '/categoria-producto/papel-y-etiquetas/'],
                ['name' => 'Escritura y Corrección',   'slug' => 'escritura-y-correccion',   'url' => '/categoria-producto/escritura-y-correccion/'],
                ['name' => 'Informática',               'slug' => 'informatica',               'url' => '/categoria-producto/informatica/'],
                ['name' => 'Mobiliario de Oficina',    'slug' => 'mobiliario-de-oficina',    'url' => '/categoria-producto/mobiliario-de-oficina/'],
                ['name' => 'Embalaje',                 'slug' => 'embalaje',                 'url' => '/categoria-producto/embalaje/'],
                ['name' => 'Material Escolar',         'slug' => 'escolar',                  'url' => '/categoria-producto/escolar/'],
                ['name' => 'Ofimática / Máquinas',     'slug' => 'ofimatica',                'url' => '/categoria-producto/ofimatica/'],
                ['name' => 'Servicios Generales',      'slug' => 'servicios-generales',      'url' => '/categoria-producto/servicios-generales/'],
            ];
        ?>
        <div class="cat-grid">
            <?php foreach ($static_cats as $cat): ?>
            <a href="<?php echo esc_url($cat['url']); ?>" class="cat-card">
                <div class="cat-card__icon" aria-hidden="true">
                    <?php echo ofipapel_category_icon($cat['slug']); ?>
                </div>
                <span class="cat-card__name"><?php echo esc_html($cat['name']); ?></span>
            </a>
            <?php endforeach; ?>
        </div>

        <?php else: ?>
        <div class="cat-grid">
            <?php foreach ($categories as $cat):
                $thumb_id  = get_term_meta($cat->term_id, 'thumbnail_id', true);
                $thumb_url = $thumb_id ? wp_get_attachment_image_url($thumb_id, 'category-icon') : '';
                $cat_url   = get_term_link($cat);
            ?>
            <a href="<?php echo esc_url($cat_url); ?>" class="cat-card">
                <?php if ($thumb_url): ?>
                    <div class="cat-card__image">
                        <img src="<?php echo esc_url($thumb_url); ?>" alt="" loading="lazy" width="80" height="80">
                    </div>
                <?php else: ?>
                    <div class="cat-card__icon" aria-hidden="true">
                        <?php echo ofipapel_category_icon($cat->slug); ?>
                    </div>
                <?php endif; ?>
                <span class="cat-card__name"><?php echo esc_html($cat->name); ?></span>
                <?php if ($cat->count): ?>
                    <span class="cat-card__count"><?php echo number_format_i18n($cat->count); ?> productos</span>
                <?php endif; ?>
            </a>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <div class="category-grid__cta">
            <a href="<?php echo class_exists('WooCommerce') ? esc_url(wc_get_page_permalink('shop')) : '/tienda/'; ?>" class="btn btn-outline">
                Ver todas las categorías
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
        </div>
    </div>
</section>
