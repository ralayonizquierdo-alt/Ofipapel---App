</main><!-- /main-content -->

<!-- ══════════════════════════════════════════════════════════════════
     FOOTER
     ══════════════════════════════════════════════════════════════════ -->
<footer class="site-footer" role="contentinfo">

    <!-- Banda superior con propuesta de valor -->
    <div class="footer-top">
        <div class="container">
            <div class="footer-trust">
                <div class="footer-trust__item">
                    <div class="footer-trust__icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                    </div>
                    <div>
                        <strong>Envío rápido</strong>
                        <span>Entrega en 24–48 h en Canarias</span>
                    </div>
                </div>
                <div class="footer-trust__item">
                    <div class="footer-trust__icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </div>
                    <div>
                        <strong>Compra segura</strong>
                        <span>Pago cifrado SSL garantizado</span>
                    </div>
                </div>
                <div class="footer-trust__item">
                    <div class="footer-trust__icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.38 2 2 0 0 1 3.58 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l1.97-1.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    </div>
                    <div>
                        <strong>Atención personalizada</strong>
                        <span>Expertos a tu servicio</span>
                    </div>
                </div>
                <div class="footer-trust__item">
                    <div class="footer-trust__icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <div>
                        <strong>Recogida en tienda</strong>
                        <span>Los Cristianos, Tenerife</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Cuerpo del footer -->
    <div class="footer-main">
        <div class="container">
            <div class="footer-grid">

                <!-- Columna 1: Logo + sobre la empresa -->
                <div class="footer-col footer-col--brand">
                    <a href="<?php echo esc_url(home_url('/')); ?>" class="footer-logo" aria-label="Ofipapel — Inicio">
                        <?php if (has_custom_logo()):
                            the_custom_logo();
                        else: ?>
                            <span class="footer-logo-text">Ofipapel</span>
                        <?php endif; ?>
                    </a>
                    <p class="footer-about">
                        Suministros de oficina, papelería, informática y mobiliario en Tenerife y Canarias.
                        Más de 30 años acompañando a empresas y particulares.
                    </p>
                    <div class="footer-social">
                        <a href="https://www.facebook.com/OfipapelTenerife/" target="_blank" rel="noopener noreferrer" class="footer-social__link" aria-label="Ofipapel en Facebook">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                        </a>
                        <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" class="footer-social__link" aria-label="Ofipapel en Instagram">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                        </a>
                        <a href="https://wa.me/34922794919" target="_blank" rel="noopener noreferrer" class="footer-social__link" aria-label="Ofipapel en WhatsApp">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                        </a>
                    </div>
                </div>

                <!-- Columna 2: Categorías -->
                <div class="footer-col">
                    <h3 class="footer-col__title">Productos</h3>
                    <ul class="footer-links">
                        <li><a href="/categoria-producto/archivo-y-clasificacion/">Archivo y Clasificación</a></li>
                        <li><a href="/categoria-producto/papel-y-etiquetas/">Papel y Etiquetas</a></li>
                        <li><a href="/categoria-producto/escritura-y-correccion/">Escritura y Corrección</a></li>
                        <li><a href="/categoria-producto/informatica/">Informática y Tecnología</a></li>
                        <li><a href="/categoria-producto/mobiliario-de-oficina/">Mobiliario de Oficina</a></li>
                        <li><a href="/categoria-producto/embalaje/">Embalaje y Expedición</a></li>
                        <li><a href="/categoria-producto/escolar/">Material Escolar</a></li>
                        <li><a href="/tienda/">Ver todo el catálogo</a></li>
                    </ul>
                </div>

                <!-- Columna 3: Empresa -->
                <div class="footer-col">
                    <h3 class="footer-col__title">Empresa</h3>
                    <?php
                    wp_nav_menu([
                        'theme_location' => 'footer-1',
                        'menu_class'     => 'footer-links',
                        'container'      => false,
                        'fallback_cb'    => function () { ?>
                            <ul class="footer-links">
                                <li><a href="/sobre-nosotros/">Sobre nosotros</a></li>
                                <li><a href="/catalogos/">Catálogos</a></li>
                                <li><a href="/portal-de-transparencia/">Portal de transparencia</a></li>
                                <li><a href="/contacto/">Contacto</a></li>
                                <li><a href="/aviso-legal/">Aviso legal</a></li>
                                <li><a href="/politica-de-privacidad/">Política de privacidad</a></li>
                                <li><a href="/politica-de-cookies/">Política de cookies</a></li>
                            </ul>
                        <?php },
                    ]);
                    ?>
                </div>

                <!-- Columna 4: Contacto -->
                <div class="footer-col">
                    <h3 class="footer-col__title">Contacto</h3>
                    <address class="footer-contact">
                        <div class="footer-contact__item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            <span>Bulevar Chajofe, 4<br>38650 Los Cristianos, Tenerife</span>
                        </div>
                        <div class="footer-contact__item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.38 2 2 0 0 1 3.58 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l1.97-1.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            <a href="tel:+34922794919">+34 922 79 49 19</a>
                        </div>
                        <div class="footer-contact__item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                            <a href="mailto:info@ofipapel.net">info@ofipapel.net</a>
                        </div>
                        <div class="footer-contact__item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span>Lun–Vie 9:00–14:00 / 16:00–19:30<br>Sáb 9:00–14:00</span>
                        </div>
                    </address>
                </div>

            </div>
        </div>
    </div>

    <!-- Footer bottom -->
    <div class="footer-bottom">
        <div class="container">
            <div class="footer-bottom__inner">
                <p class="footer-copyright">
                    &copy; <?php echo date('Y'); ?> <?php bloginfo('name'); ?> — Suministros de Oficina, S.L. Todos los derechos reservados.
                </p>
                <div class="footer-legal">
                    <a href="/aviso-legal/">Aviso legal</a>
                    <a href="/politica-de-privacidad/">Privacidad</a>
                    <a href="/politica-de-cookies/">Cookies</a>
                </div>
            </div>
        </div>
    </div>

</footer>

<!-- Botón volver arriba -->
<button class="back-to-top" id="back-to-top" aria-label="Volver al inicio de la página" hidden>
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
</button>

<?php wp_footer(); ?>
</body>
</html>
