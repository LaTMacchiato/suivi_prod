(() => {
    const formatInt = new Intl.NumberFormat('fr-FR', {
        maximumFractionDigits: 0
    }).format;

    const formatFr1 = new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format;

    const formatFr2 = new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format;

    const formatFr3 = new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
    }).format;

    function initialiserModaleLegale() {
        const legalDialog = document.getElementById('legal-modal');
        const openBtn = document.getElementById('open-legal-modal');
        if (!legalDialog || !openBtn) return;

        // Fallback 100 % local si Invoker Commands (commandfor / command) n'est pas supporté
        if (!Object.hasOwn(HTMLButtonElement.prototype, 'commandForElement')) {
            openBtn.addEventListener('click', () => {
                legalDialog.showModal();
            });
        }

        // Fallback light-dismiss si closedby="any" n'est pas supporté
        if (!Object.hasOwn(HTMLDialogElement.prototype, 'closedBy')) {
            legalDialog.addEventListener('click', (event) => {
                if (event.target !== legalDialog) return;
                const rect = legalDialog.getBoundingClientRect();
                const estContenu = (
                    rect.top <= event.clientY &&
                    event.clientY <= rect.top + rect.height &&
                    rect.left <= event.clientX &&
                    event.clientX <= rect.left + rect.width
                );
                if (!estContenu) {
                    legalDialog.close();
                }
            });
        }
    }

    function afficherDateMaj(el, dateMajStr, horodatageIso) {
        if (!el) return;
        el.innerHTML = '';
        el.classList.remove('is-error');

        let estFrais = true;
        let infoAge = 'Données récentes';
        if (horodatageIso) {
            const dt = new Date(horodatageIso);
            if (!Number.isNaN(dt.getTime())) {
                const diffHeures = Math.max(0, (Date.now() - dt.getTime()) / 3600000);
                estFrais = diffHeures < 3;
                if (diffHeures < 1) {
                    infoAge = 'Mise à jour récente (< 1 h)';
                } else if (diffHeures < 24) {
                    infoAge = `Dernier relevé il y a environ ${Math.round(diffHeures)} h`;
                } else {
                    const diffJours = Math.floor(diffHeures / 24);
                    infoAge = `Dernier relevé datant de ${diffJours} j`;
                }
            }
        }

        const dot = document.createElement('span');
        dot.className = `freshness-dot ${estFrais ? 'freshness-ok' : 'freshness-stale'}`;
        dot.setAttribute('aria-hidden', 'true');

        const texte = document.createElement('span');
        texte.textContent = `Actualisé le : ${dateMajStr || 'Inconnu'}`;

        el.title = infoAge;
        el.appendChild(dot);
        el.appendChild(texte);
    }

    function creerUrl(cheminBase, paramsMap) {
        const params = new URLSearchParams();
        if (paramsMap) {
            Object.entries(paramsMap).forEach(([k, v]) => {
                if (v !== undefined && v !== null && String(v) !== '') {
                    params.set(k, String(v));
                }
            });
        }
        const query = params.toString();
        return query ? `${cheminBase}?${query}` : cheminBase;
    }

    window.ProdCommon = {
        formatInt,
        formatFr1,
        formatFr2,
        formatFr3,
        afficherDateMaj,
        creerUrl
    };

    initialiserModaleLegale();
})();
