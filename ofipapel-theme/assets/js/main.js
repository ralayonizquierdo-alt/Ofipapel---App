/**
 * Ofipapel Theme — main.js
 * Sticky header, hero slider, mobile nav, back to top
 */
(function () {
    'use strict';

    /* ── DOM refs ─────────────────────────────────────────────── */
    const header    = document.getElementById('site-header');
    const navToggle = document.getElementById('nav-toggle');
    const mainNav   = document.getElementById('primary-nav');
    const backToTop = document.getElementById('back-to-top');

    /* ── Sticky header + scroll effects ──────────────────────── */
    let lastScroll = 0;

    function onScroll() {
        const current = window.scrollY;

        if (header) {
            header.classList.toggle('is-scrolled', current > 60);
        }

        if (backToTop) {
            backToTop.hidden = current < 400;
        }

        lastScroll = current;
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    /* ── Mobile nav toggle ────────────────────────────────────── */
    if (navToggle && mainNav) {
        navToggle.addEventListener('click', function () {
            const expanded = navToggle.getAttribute('aria-expanded') === 'true';
            navToggle.setAttribute('aria-expanded', String(!expanded));
            mainNav.classList.toggle('is-open', !expanded);
            document.body.style.overflow = !expanded ? 'hidden' : '';
        });

        // Cerrar al pulsar fuera
        document.addEventListener('click', function (e) {
            if (mainNav.classList.contains('is-open') &&
                !mainNav.contains(e.target) &&
                !navToggle.contains(e.target)) {
                navToggle.setAttribute('aria-expanded', 'false');
                mainNav.classList.remove('is-open');
                document.body.style.overflow = '';
            }
        });

        // Cerrar con Escape
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && mainNav.classList.contains('is-open')) {
                navToggle.setAttribute('aria-expanded', 'false');
                mainNav.classList.remove('is-open');
                document.body.style.overflow = '';
                navToggle.focus();
            }
        });
    }

    /* ── Hero slider ──────────────────────────────────────────── */
    const track  = document.getElementById('hero-track');
    const dots   = document.querySelectorAll('.hero-slider__dot');
    const prevBtn = document.getElementById('hero-prev');
    const nextBtn = document.getElementById('hero-next');

    if (track) {
        const slides  = track.querySelectorAll('.hero-slide');
        const total   = slides.length;
        let current   = 0;
        let autoplay;

        function goTo(index) {
            slides[current].classList.remove('is-active');
            if (dots[current]) dots[current].classList.remove('is-active');
            if (dots[current]) dots[current].setAttribute('aria-selected', 'false');

            current = (index + total) % total;

            slides[current].classList.add('is-active');
            if (dots[current]) dots[current].classList.add('is-active');
            if (dots[current]) dots[current].setAttribute('aria-selected', 'true');

            track.style.transform = `translateX(-${current * 100}%)`;
        }

        function startAutoplay() {
            autoplay = setInterval(() => goTo(current + 1), 5500);
        }

        function stopAutoplay() { clearInterval(autoplay); }

        if (nextBtn) nextBtn.addEventListener('click', () => { stopAutoplay(); goTo(current + 1); startAutoplay(); });
        if (prevBtn) prevBtn.addEventListener('click', () => { stopAutoplay(); goTo(current - 1); startAutoplay(); });

        dots.forEach((dot, i) => {
            dot.addEventListener('click', () => { stopAutoplay(); goTo(i); startAutoplay(); });
        });

        // Touch/swipe
        let touchStartX = 0;
        track.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
        track.addEventListener('touchend', (e) => {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
                stopAutoplay();
                goTo(diff > 0 ? current + 1 : current - 1);
                startAutoplay();
            }
        }, { passive: true });

        startAutoplay();
    }

    /* ── Back to top ──────────────────────────────────────────── */
    if (backToTop) {
        backToTop.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* ── Smooth scroll para anclas internas ───────────────────── */
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', function (e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-total-h')) || 112;
                const top = target.getBoundingClientRect().top + window.scrollY - offset - 16;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        });
    });

    /* ── Submenús accesibles en desktop ──────────────────────── */
    document.querySelectorAll('.nav-menu > li').forEach(item => {
        const submenu = item.querySelector('.sub-menu');
        if (!submenu) return;

        item.addEventListener('mouseenter', () => {
            submenu.style.display = '';
        });

        item.addEventListener('mouseleave', () => {
            submenu.style.display = '';
        });
    });

})();
