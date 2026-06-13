<?php defined('ABSPATH') || exit;

$catalogs = new WP_Query([
    'post_type'      => 'catalogo',
    'posts_per_page' => 4,
    'post_status'    => 'publish',
    'orderby'        => 'menu_order date',
    'order'          => 'ASC',
]);

if (!$catalogs->have_posts()) return;
?>

<section class="catalogs-preview section" aria-labelledby="catalogs-heading">
    <div class="container">
        <div class="section-header" style="display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:1rem;">
            <div>
                <h2 class="section-title" id="catalogs-heading">Catálogos</h2>
                <p class="section-subtitle">Descarga nuestros catálogos de productos y descubre todo el surtido</p>
            </div>
            <a href="/catalogos/" class="btn btn-outline btn-sm">
                Ver todos los catálogos
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
        </div>

        <div class="catalogs-grid">
            <?php while ($catalogs->have_posts()): $catalogs->the_post();
                $pdf_url = get_post_meta(get_the_ID(), 'catalog_pdf_url', true);
                $online_url = get_post_meta(get_the_ID(), 'catalog_online_url', true);
                $year = get_post_meta(get_the_ID(), 'catalog_year', true) ?: date('Y');
            ?>
            <article class="catalog-card">
                <a href="<?php echo $pdf_url ? esc_url($pdf_url) : get_permalink(); ?>"
                   class="catalog-card__cover-link"
                   <?php echo $pdf_url ? 'target="_blank" rel="noopener noreferrer"' : ''; ?>
                   aria-label="Ver catálogo: <?php the_title_attribute(); ?>">
                    <div class="catalog-card__cover">
                        <?php if (has_post_thumbnail()): ?>
                            <?php the_post_thumbnail('catalog-thumb', ['class' => 'catalog-card__img', 'loading' => 'lazy']); ?>
                        <?php else: ?>
                            <div class="catalog-card__placeholder" aria-hidden="true">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <rect x="5" y="5" width="70" height="90" rx="4"/>
                                    <line x1="15" y1="30" x2="65" y2="30"/>
                                    <line x1="15" y1="42" x2="65" y2="42"/>
                                    <line x1="15" y1="54" x2="50" y2="54"/>
                                    <rect x="15" y="63" width="50" height="20" rx="2"/>
                                </svg>
                                <span class="catalog-card__placeholder-year"><?php echo esc_html($year); ?></span>
                            </div>
                        <?php endif; ?>
                        <div class="catalog-card__cover-overlay" aria-hidden="true">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </div>
                    </div>
                </a>

                <div class="catalog-card__info">
                    <span class="catalog-card__year"><?php echo esc_html($year); ?></span>
                    <h3 class="catalog-card__title">
                        <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
                    </h3>
                    <?php if (has_excerpt()): ?>
                        <p class="catalog-card__desc"><?php the_excerpt(); ?></p>
                    <?php endif; ?>

                    <div class="catalog-card__actions">
                        <?php if ($pdf_url): ?>
                        <a href="<?php echo esc_url($pdf_url); ?>"
                           class="btn btn-primary btn-sm"
                           target="_blank" rel="noopener noreferrer"
                           download>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Descargar PDF
                        </a>
                        <?php endif; ?>
                        <?php if ($online_url): ?>
                        <a href="<?php echo esc_url($online_url); ?>"
                           class="btn btn-outline btn-sm"
                           target="_blank" rel="noopener noreferrer">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            Ver online
                        </a>
                        <?php endif; ?>
                    </div>
                </div>
            </article>
            <?php endwhile; wp_reset_postdata(); ?>
        </div>
    </div>
</section>
