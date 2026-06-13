/**
 * Ofipapel Theme — catalog-viewer.js
 * Modal PDF viewer for catalog pages
 */
(function () {
    'use strict';

    // Crear modal una vez
    function createModal() {
        const modal = document.createElement('div');
        modal.id = 'catalog-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Visor de catálogo');
        modal.innerHTML = `
            <div class="catalog-modal__backdrop"></div>
            <div class="catalog-modal__dialog">
                <div class="catalog-modal__header">
                    <h3 class="catalog-modal__title" id="catalog-modal-title"></h3>
                    <button class="catalog-modal__close" aria-label="Cerrar visor">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="catalog-modal__body">
                    <iframe id="catalog-iframe" src="" title="Catálogo Ofipapel" allowfullscreen></iframe>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeBtn  = modal.querySelector('.catalog-modal__close');
        const backdrop  = modal.querySelector('.catalog-modal__backdrop');
        const iframe    = modal.querySelector('#catalog-iframe');
        const titleEl   = modal.querySelector('.catalog-modal__title');

        function closeModal() {
            modal.classList.remove('is-open');
            iframe.src = '';
            document.body.style.overflow = '';
            document.removeEventListener('keydown', trapFocus);
        }

        function trapFocus(e) {
            if (e.key === 'Escape') closeModal();
        }

        closeBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', closeModal);

        return { modal, iframe, titleEl };
    }

    let modalRefs = null;

    function openCatalog(url, title) {
        if (!modalRefs) modalRefs = createModal();

        modalRefs.iframe.src = url;
        modalRefs.titleEl.textContent = title || 'Catálogo';
        modalRefs.modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';

        document.addEventListener('keydown', function trapFocus(e) {
            if (e.key === 'Escape') {
                modalRefs.modal.classList.remove('is-open');
                modalRefs.iframe.src = '';
                document.body.style.overflow = '';
                document.removeEventListener('keydown', trapFocus);
            }
        });
    }

    // Vincular botones "Ver online"
    document.querySelectorAll('[data-catalog-id]').forEach(btn => {
        btn.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            const title = this.closest('.catalog-card')?.querySelector('.catalog-card__title')?.textContent?.trim() || 'Catálogo';

            if (href && (href.endsWith('.pdf') || href.includes('issuu') || href.includes('calameo') || href.includes('fliphtml5'))) {
                e.preventDefault();
                openCatalog(href, title);
            }
        });
    });

    // CSS del modal (inyectado dinámicamente)
    const style = document.createElement('style');
    style.textContent = `
    #catalog-modal {
        display: none;
        position: fixed; inset: 0; z-index: 9999;
    }
    #catalog-modal.is-open { display: flex; align-items: center; justify-content: center; }
    .catalog-modal__backdrop {
        position: absolute; inset: 0;
        background: rgba(0,0,0,.75);
    }
    .catalog-modal__dialog {
        position: relative; z-index: 1;
        background: #fff;
        border-radius: 12px;
        overflow: hidden;
        width: min(95vw, 1100px);
        height: min(90vh, 800px);
        display: flex; flex-direction: column;
        box-shadow: 0 24px 64px rgba(0,0,0,.4);
    }
    .catalog-modal__header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #E8F0E8;
        flex-shrink: 0;
    }
    .catalog-modal__title { font-size: 1rem; font-weight: 700; margin: 0; }
    .catalog-modal__close {
        width: 36px; height: 36px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: #F7FBF7; border: none; cursor: pointer;
        transition: background .15s;
    }
    .catalog-modal__close:hover { background: #E8F0E8; }
    .catalog-modal__body { flex: 1; overflow: hidden; }
    #catalog-iframe { width: 100%; height: 100%; border: none; display: block; }
    `;
    document.head.appendChild(style);

})();
