<?php
/*
 * Template Name: Página de Contacto
 */
defined('ABSPATH') || exit;
get_header();
?>

<div class="page-hero page-hero--sm" style="background: linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%);">
    <div class="container">
        <h1 class="page-hero__title">Contacto</h1>
        <p class="page-hero__subtitle">Estamos aquí para ayudarte. Cuéntanos qué necesitas.</p>
    </div>
</div>

<section class="contacto-page section">
    <div class="container">
        <div class="contacto-layout">

            <!-- Columna izquierda: Formulario -->
            <div class="contacto-form-col">
                <h2 class="contacto-section-title">Envíanos un mensaje</h2>
                <p class="contacto-section-subtitle">Te responderemos en menos de 24 horas en días laborables.</p>

                <?php
                // Si hay un shortcode de Contact Form 7 configurado
                $cf7_id = get_theme_mod('ofipapel_contact_form7_id', '');
                if ($cf7_id && function_exists('wpcf7_contact_form')): ?>
                    <?php echo do_shortcode("[contact-form-7 id='{$cf7_id}' title='Contacto']"); ?>
                <?php else: ?>
                <!-- Formulario de fallback HTML (se puede integrar con cualquier plugin) -->
                <form class="contacto-form" id="contacto-form" method="post" novalidate>
                    <?php wp_nonce_field('ofipapel_contact', 'ofipapel_contact_nonce'); ?>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="contact-name">Nombre y apellidos *</label>
                            <input type="text" id="contact-name" name="contact_name" required autocomplete="name" placeholder="Tu nombre">
                        </div>
                        <div class="form-group">
                            <label for="contact-email">Correo electrónico *</label>
                            <input type="email" id="contact-email" name="contact_email" required autocomplete="email" placeholder="tu@email.com">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="contact-phone">Teléfono</label>
                            <input type="tel" id="contact-phone" name="contact_phone" autocomplete="tel" placeholder="+34 600 000 000">
                        </div>
                        <div class="form-group">
                            <label for="contact-subject">Asunto *</label>
                            <select id="contact-subject" name="contact_subject" required>
                                <option value="">Selecciona un asunto</option>
                                <option value="pedido">Consulta sobre pedido</option>
                                <option value="presupuesto">Solicitar presupuesto</option>
                                <option value="catalogo">Solicitar catálogo</option>
                                <option value="empresa">Cuenta de empresa</option>
                                <option value="otro">Otro</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="contact-message">Mensaje *</label>
                        <textarea id="contact-message" name="contact_message" rows="5" required placeholder="Escribe tu consulta aquí..."></textarea>
                    </div>

                    <div class="form-group form-group--checkbox">
                        <label>
                            <input type="checkbox" name="contact_privacy" required>
                            He leído y acepto la <a href="/politica-de-privacidad/" target="_blank">política de privacidad</a> *
                        </label>
                    </div>

                    <button type="submit" class="btn btn-primary btn-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        Enviar mensaje
                    </button>
                </form>
                <?php endif; ?>
            </div>

            <!-- Columna derecha: Datos y mapa -->
            <div class="contacto-info-col">
                <h2 class="contacto-section-title">Nuestras tiendas</h2>

                <?php
                $stores = [
                    [
                        'name'    => get_theme_mod('ofipapel_store_1_name',    'Tienda Los Cristianos'),
                        'address' => get_theme_mod('ofipapel_store_1_address', 'Bulevar Chajofe, 4 — 38650 Los Cristianos, Tenerife'),
                        'phone'   => get_theme_mod('ofipapel_store_1_phone',   '+34 922 79 49 19'),
                        'hours'   => get_theme_mod('ofipapel_store_1_hours',   'Lun–Vie 9:00–14:00 / 16:00–19:30 · Sáb 9:00–14:00'),
                    ],
                    [
                        'name'    => get_theme_mod('ofipapel_store_2_name',    'Tienda Avenida Suecia'),
                        'address' => get_theme_mod('ofipapel_store_2_address', 'Av. de Suecia, 7 — 38650 Los Cristianos, Tenerife'),
                        'phone'   => get_theme_mod('ofipapel_store_2_phone',   '+34 922 79 49 20'),
                        'hours'   => get_theme_mod('ofipapel_store_2_hours',   'Lun–Vie 9:00–14:00 / 16:00–19:30 · Sáb 9:00–14:00'),
                    ],
                ];
                ?>

                <div class="store-cards">
                    <?php foreach ($stores as $store): ?>
                    <div class="store-card">
                        <div class="store-card__header">
                            <div class="store-card__icon" aria-hidden="true">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            </div>
                            <h3 class="store-card__name"><?php echo esc_html($store['name']); ?></h3>
                        </div>

                        <address class="store-card__details">
                            <div class="store-card__row">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                <span><?php echo esc_html($store['address']); ?></span>
                            </div>
                            <div class="store-card__row">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.38 2 2 0 0 1 3.58 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l1.97-1.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                <a href="tel:<?php echo esc_attr(preg_replace('/\s+/', '', $store['phone'])); ?>">
                                    <?php echo esc_html($store['phone']); ?>
                                </a>
                            </div>
                            <div class="store-card__row">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                <span><?php echo esc_html($store['hours']); ?></span>
                            </div>
                        </address>

                        <a href="https://maps.google.com/?q=<?php echo urlencode($store['address']); ?>"
                           class="btn btn-outline btn-sm store-card__map-btn"
                           target="_blank" rel="noopener noreferrer">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            Ver en Google Maps
                        </a>
                    </div>
                    <?php endforeach; ?>
                </div>

                <!-- Email directo -->
                <div class="contacto-email-card">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <div>
                        <strong>Email</strong>
                        <a href="mailto:info@ofipapel.net">info@ofipapel.net</a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>

<!-- Mapa Google Maps -->
<?php $maps_url = get_theme_mod('ofipapel_maps_embed', ''); if ($maps_url): ?>
<div class="contacto-map">
    <iframe
        src="<?php echo esc_url($maps_url); ?>"
        width="100%"
        height="420"
        style="border:0; display:block;"
        allowfullscreen=""
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        title="Localización de Ofipapel en Google Maps"
    ></iframe>
</div>
<?php endif; ?>

<?php get_footer(); ?>
