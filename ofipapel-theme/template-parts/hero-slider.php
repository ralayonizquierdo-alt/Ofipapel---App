<?php defined('ABSPATH') || exit; ?>

<section class="hero-slider" aria-label="Banner principal">
    <div class="hero-slider__track" id="hero-track">

        <?php for ($i = 1; $i <= 3; $i++):
            $title    = get_theme_mod("ofipapel_hero_{$i}_title",    $i === 1 ? 'Todo lo que tu oficina necesita' : ($i === 2 ? 'Mobiliario de oficina premium' : 'Vuelta al cole — Prepárate ya'));
            $subtitle = get_theme_mod("ofipapel_hero_{$i}_subtitle", $i === 1 ? 'Suministros de oficina, papelería e informática en Tenerife y Canarias. Más de 30 años a tu servicio.' : ($i === 2 ? 'Sillas ergonómicas, escritorios y estanterías para equipar tu espacio de trabajo.' : 'Todo el material escolar al mejor precio. Cuadernos, mochilas, estuches y mucho más.'));
            $url      = get_theme_mod("ofipapel_hero_{$i}_url",      $i === 1 ? '/tienda/' : ($i === 2 ? '/categoria-producto/mobiliario-de-oficina/' : '/categoria-producto/escolar/'));
            $btn_text = $i === 1 ? 'Explorar productos' : ($i === 2 ? 'Ver mobiliario' : 'Ver material escolar');
            $img_id   = get_theme_mod("ofipapel_hero_{$i}_image", 0);
            $img_url  = $img_id ? wp_get_attachment_image_url($img_id, 'hero-banner') : '';

            $bg_colors = ['#1D7A22', '#0F5C5C', '#1A4A7A'];
            $bg = $bg_colors[$i - 1];
        ?>
        <div class="hero-slide <?php echo $i === 1 ? 'is-active' : ''; ?>"
             role="group"
             aria-label="Slide <?php echo $i; ?> de 3"
             <?php if ($img_url): ?>
             style="background-image: url('<?php echo esc_url($img_url); ?>')"
             <?php else: ?>
             style="background-color: <?php echo $bg; ?>"
             <?php endif; ?>>

            <div class="hero-slide__overlay"></div>

            <div class="container">
                <div class="hero-slide__content">
                    <?php if ($i === 1): ?>
                        <span class="hero-slide__tag">Tenerife y Canarias</span>
                    <?php endif; ?>
                    <h1 class="hero-slide__title"><?php echo esc_html($title); ?></h1>
                    <p class="hero-slide__subtitle"><?php echo esc_html($subtitle); ?></p>
                    <div class="hero-slide__ctas">
                        <a href="<?php echo esc_url($url); ?>" class="btn btn-cta btn-lg">
                            <?php echo esc_html($btn_text); ?>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                        </a>
                        <?php if ($i === 1): ?>
                        <a href="/catalogos/" class="btn btn-white btn-lg">Ver catálogos</a>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
        <?php endfor; ?>

    </div>

    <!-- Controles del slider -->
    <button class="hero-slider__btn hero-slider__btn--prev" id="hero-prev" aria-label="Slide anterior">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <button class="hero-slider__btn hero-slider__btn--next" id="hero-next" aria-label="Slide siguiente">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
    </button>

    <!-- Indicadores -->
    <div class="hero-slider__dots" role="tablist" aria-label="Seleccionar slide">
        <?php for ($i = 1; $i <= 3; $i++): ?>
        <button class="hero-slider__dot <?php echo $i === 1 ? 'is-active' : ''; ?>"
                data-slide="<?php echo $i - 1; ?>"
                role="tab"
                aria-label="Ir al slide <?php echo $i; ?>"
                aria-selected="<?php echo $i === 1 ? 'true' : 'false'; ?>">
        </button>
        <?php endfor; ?>
    </div>
</section>
