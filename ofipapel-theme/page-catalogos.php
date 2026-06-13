<?php
/*
 * Template Name: Página de Catálogos
 */
defined('ABSPATH') || exit;
get_header();
?>

<div class="page-hero page-hero--sm" style="background: linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%);">
    <div class="container">
        <h1 class="page-hero__title">Catálogos de productos</h1>
        <p class="page-hero__subtitle">Descarga o consulta online nuestros catálogos con todo el surtido de Ofipapel</p>
    </div>
</div>

<section class="catalogos-page section">
    <div class="container">

        <?php
        $query = new WP_Query([
            'post_type'      => 'catalogo',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
            'orderby'        => 'menu_order date',
            'order'          => 'ASC',
        ]);
        ?>

        <?php if ($query->have_posts()): ?>
        <div class="catalogs-full-grid">
            <?php while ($query->have_posts()): $query->the_post();
                $pdf_url    = get_post_meta(get_the_ID(), 'catalog_pdf_url',    true);
                $online_url = get_post_meta(get_the_ID(), 'catalog_online_url', true);
                $year       = get_post_meta(get_the_ID(), 'catalog_year',       true) ?: date('Y');
                $pages_num  = get_post_meta(get_the_ID(), 'catalog_pages',      true);
                $size_mb    = get_post_meta(get_the_ID(), 'catalog_size_mb',    true);
            ?>
            <article class="catalog-card catalog-card--full" id="catalog-<?php the_ID(); ?>">
                <a href="<?php echo $pdf_url ? esc_url($pdf_url) : get_permalink(); ?>"
                   class="catalog-card__cover-link"
                   <?php echo $pdf_url ? 'target="_blank" rel="noopener noreferrer"' : ''; ?>
                   aria-label="Ver catálogo: <?php the_title_attribute(); ?>">
                    <div class="catalog-card__cover">
                        <?php if (has_post_thumbnail()): ?>
                            <?php the_post_thumbnail('catalog-thumb', ['class' => 'catalog-card__img', 'loading' => 'lazy']); ?>
                        <?php else: ?>
                            <div class="catalog-card__placeholder" aria-hidden="true">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </div>
                    </div>
                </a>

                <div class="catalog-card__info">
                    <div class="catalog-card__meta">
                        <span class="catalog-card__year"><?php echo esc_html($year); ?></span>
                        <?php if ($pages_num): ?>
                            <span class="catalog-card__meta-item">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                <?php echo esc_html($pages_num); ?> páginas
                            </span>
                        <?php endif; ?>
                        <?php if ($size_mb): ?>
                            <span class="catalog-card__meta-item">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                <?php echo esc_html($size_mb); ?> MB
                            </span>
                        <?php endif; ?>
                    </div>

                    <h2 class="catalog-card__title">
                        <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
                    </h2>

                    <?php if (has_excerpt()): ?>
                        <div class="catalog-card__desc"><?php the_excerpt(); ?></div>
                    <?php elseif (get_the_content()): ?>
                        <div class="catalog-card__desc"><?php the_excerpt(); ?></div>
                    <?php endif; ?>

                    <div class="catalog-card__actions">
                        <?php if ($pdf_url): ?>
                        <a href="<?php echo esc_url($pdf_url); ?>"
                           class="btn btn-primary"
                           target="_blank" rel="noopener noreferrer"
                           download>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Descargar PDF
                        </a>
                        <?php endif; ?>
                        <?php if ($online_url): ?>
                        <a href="<?php echo esc_url($online_url); ?>"
                           class="btn btn-outline"
                           target="_blank" rel="noopener noreferrer"
                           data-catalog-id="<?php the_ID(); ?>">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            Ver online
                        </a>
                        <?php endif; ?>
                        <?php if (!$pdf_url && !$online_url): ?>
                        <a href="/contacto/" class="btn btn-outline">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                            Solicitar catálogo
                        </a>
                        <?php endif; ?>
                    </div>
                </div>
            </article>
            <?php endwhile; wp_reset_postdata(); ?>
        </div>

        <?php else: ?>
        <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <h2>Catálogos próximamente</h2>
            <p>Estamos preparando nuestros catálogos digitales. Mientras tanto, puedes contactarnos para solicitar información.</p>
            <a href="/contacto/" class="btn btn-primary">Contactar</a>
        </div>
        <?php endif; ?>

    </div>
</section>

<!-- CTA sección inferior -->
<section class="section-sm" style="background: var(--color-primary-light); text-align:center;">
    <div class="container">
        <p style="font-size: var(--text-lg); margin-bottom: var(--space-4); color: var(--color-primary-dark);">
            ¿No encuentras lo que buscas en los catálogos?
        </p>
        <a href="/contacto/" class="btn btn-primary btn-lg">Solicitar información personalizada</a>
    </div>
</section>

<?php get_footer(); ?>
