(() => {
    const {
        formatInt,
        formatFr1,
        formatFr3,
        afficherDateMaj,
        creerUrl
    } = window.ProdCommon;

    let donneesLive = null;
    let anneeEnCours = new Date().getFullYear();
    let centraleFocus = 'PENLY';
    let filtreStatut = 'all'; // 'all' | 'full' | 'partial'
    let termeRecherche = '';
    let modeTri = 'prod'; // 'prod' | 'name' | 'avail'
    let controlesInitialises = false;

    function normaliserTexte(str) {
        return String(str || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    function extraireNomCentraleDepuisReacteur(nomReacteur) {
        const idx = nomReacteur.lastIndexOf(' ');
        return idx > 0 ? nomReacteur.slice(0, idx) : nomReacteur;
    }

    function obtenirUnitesCentrale(nomCentrale, data) {
        return Object.keys(data.cache_brut_mwh || {})
            .filter((nomReacteur) => extraireNomCentraleDepuisReacteur(nomReacteur) === nomCentrale)
            .sort((a, b) => a.localeCompare(b, 'fr'));
    }

    function mettreAJourFocusDansUrl(nomCentrale) {
        try {
            const url = new URL(window.location.href);
            if (nomCentrale && nomCentrale !== 'PENLY') {
                url.searchParams.set('focus', nomCentrale);
            } else {
                url.searchParams.delete('focus');
            }
            const query = url.searchParams.toString();
            const nouvelleUrl = query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`;
            window.history.replaceState(null, '', nouvelleUrl);
        } catch {
            // Ignorer si replaceState indisponible
        }
    }

    function synchroniserBoutonToutDeplier() {
        const grid = document.getElementById('grid-centrales');
        const btn = document.getElementById('btn-toggle-all');
        if (!grid || !btn) return;
        const items = grid.querySelectorAll(':scope > details.centrale-card');
        const toutOuvert = items.length > 0 && Array.prototype.every.call(items, (d) => d.open);
        btn.setAttribute('aria-expanded', String(toutOuvert));
    }

    function construireDetailsReacteurs(unites, data, estFocus) {
        const conteneur = document.createElement('div');
        conteneur.className = estFocus ? 'penly-details' : 'unites-details';

        const classLigne = estFocus ? 'penly-unite-line' : 'unite-line';
        const classNom = estFocus ? 'penly-unite-nom' : 'unite-nom';
        const classProd = estFocus ? 'penly-unite-prod' : 'unite-prod';
        const classOn = estFocus ? 'status-on-penly' : 'status-on';
        const classOff = estFocus ? 'status-off-penly' : 'status-off';

        const puissances = data.cache_puissance_mw || null;

        unites.forEach((nomReacteur) => {
            const prodMwh = data.cache_brut_mwh[nomReacteur] || 0;
            const estEnLigne = Boolean(data.cache_statut[nomReacteur]);

            const ligne = document.createElement('div');
            ligne.className = classLigne;

            const nomGrp = document.createElement('div');
            nomGrp.className = 'unite-nom-grp';

            const dot = document.createElement('span');
            dot.className = `status-dot ${estEnLigne ? classOn : classOff}`;
            dot.setAttribute('aria-hidden', 'true');

            const nomSpan = document.createElement('span');
            nomSpan.className = classNom;
            nomSpan.textContent = nomReacteur;

            const tagStatut = document.createElement('span');
            tagStatut.className = `unite-statut-tag ${estEnLigne ? 'is-on' : 'is-off'}`;
            tagStatut.textContent = estEnLigne ? 'En prod.' : "À l'arrêt";

            nomGrp.appendChild(dot);
            nomGrp.appendChild(nomSpan);
            nomGrp.appendChild(tagStatut);

            const valGrp = document.createElement('div');
            valGrp.className = 'unite-val-grp';

            const prodSpan = document.createElement('span');
            prodSpan.className = classProd;
            prodSpan.textContent = `${formatInt(Math.round(prodMwh))} MWh`;
            valGrp.appendChild(prodSpan);

            if (puissances && Object.hasOwn(puissances, nomReacteur)) {
                const mw = puissances[nomReacteur] || 0;
                const mwSpan = document.createElement('span');
                mwSpan.className = 'unite-mw';
                mwSpan.textContent = estEnLigne && mw > 0
                    ? `${formatInt(Math.round(mw))} MW en direct`
                    : '0 MW';
                valGrp.appendChild(mwSpan);
            }

            ligne.appendChild(nomGrp);
            ligne.appendChild(valGrp);
            conteneur.appendChild(ligne);
        });

        return conteneur;
    }

    function creerLienStatsCentrale(nomCentrale) {
        const footer = document.createElement('div');
        footer.className = 'card-details-footer';

        const lien = document.createElement('a');
        lien.className = 'card-stats-link';
        lien.href = creerUrl('statistiques.html', { centrale: nomCentrale });
        lien.textContent = `Statistiques annuelles (${nomCentrale}) →`;

        footer.appendChild(lien);
        return footer;
    }

    function creerBadgeStatutCentrale(nbEnLigne, nbUnites) {
        const badge = document.createElement('span');
        badge.className = 'card-status-pill';
        if (nbUnites > 0 && nbEnLigne > 0) {
            badge.classList.add(nbEnLigne === nbUnites ? 'is-full' : 'is-partial');
            badge.textContent = `${nbEnLigne}/${nbUnites} actif${nbEnLigne > 1 ? 's' : ''}`;
        } else {
            badge.classList.add('is-off');
            badge.textContent = 'Arrêt';
        }
        return badge;
    }

    function creerBarreDisponibilite(nbEnLigne, nbUnites) {
        const track = document.createElement('div');
        track.className = 'card-avail-track';
        track.setAttribute('aria-hidden', 'true');

        const bar = document.createElement('div');
        bar.className = 'card-avail-bar';
        const pct = nbUnites > 0 ? Math.round((nbEnLigne / nbUnites) * 100) : 0;
        if (pct > 0 && pct < 100) {
            bar.classList.add('is-partial');
        }
        bar.style.width = `${pct}%`;

        track.appendChild(bar);
        return track;
    }

    function creerCarteFocus(nomCentrale, prodTwh, data) {
        const unites = obtenirUnitesCentrale(nomCentrale, data);
        const nbEnLigne = unites.filter((r) => Boolean(data.cache_statut[r])).length;
        const nbUnites = unites.length;
        const totalFrance = data.total_france_twh || 0;
        const partPct = totalFrance > 0 ? (prodTwh / totalFrance) * 100 : 0;

        const details = document.createElement('details');
        details.className = 'penly-card';

        const summary = document.createElement('summary');

        const arrow = document.createElement('span');
        arrow.className = 'penly-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '▼';

        const header = document.createElement('div');
        header.className = 'penly-header';

        const nomRow = document.createElement('div');
        nomRow.className = 'penly-nom-row';

        const nomSpan = document.createElement('span');
        nomSpan.className = 'penly-nom';
        nomSpan.textContent = `${nomCentrale} `;

        const focusBadge = document.createElement('span');
        focusBadge.className = 'penly-badge';
        focusBadge.textContent = 'Focus';
        nomSpan.appendChild(focusBadge);

        const shareBadge = document.createElement('span');
        shareBadge.className = 'card-share-badge';
        shareBadge.textContent = `${formatFr1(partPct)} % du parc`;

        nomRow.appendChild(nomSpan);
        nomRow.appendChild(shareBadge);

        const prodDiv = document.createElement('div');
        prodDiv.className = 'penly-prod';
        prodDiv.textContent = `${formatFr3(prodTwh)} `;

        const uniteProd = document.createElement('span');
        uniteProd.className = 'penly-prod-unite';
        uniteProd.textContent = `TWh en ${anneeEnCours}`;
        prodDiv.appendChild(uniteProd);

        const statsRow = document.createElement('div');
        statsRow.className = 'penly-stats-row';

        const spanUnites = document.createElement('span');
        spanUnites.textContent = `${nbUnites} unité${nbUnites > 1 ? 's' : ''}`;

        const spanEnProd = document.createElement('span');
        if (nbEnLigne > 0) {
            spanEnProd.style.color = '#86EFAC';
        }
        spanEnProd.textContent = `${nbEnLigne} en prod.`;

        statsRow.appendChild(spanUnites);
        statsRow.appendChild(spanEnProd);

        header.appendChild(nomRow);
        header.appendChild(prodDiv);
        header.appendChild(statsRow);
        header.appendChild(creerBarreDisponibilite(nbEnLigne, nbUnites));

        summary.appendChild(arrow);
        summary.appendChild(header);

        const body = construireDetailsReacteurs(unites, data, true);
        body.appendChild(creerLienStatsCentrale(nomCentrale));

        details.appendChild(summary);
        details.appendChild(body);
        return details;
    }

    function creerCarteCentrale(nomCentrale, prodTwh, data, ouvrirAuto) {
        const unites = obtenirUnitesCentrale(nomCentrale, data);
        if (unites.length === 0) return null;

        const nbEnLigne = unites.filter((r) => Boolean(data.cache_statut[r])).length;
        const nbUnites = unites.length;
        const totalFrance = data.total_france_twh || 0;
        const partPct = totalFrance > 0 ? (prodTwh / totalFrance) * 100 : 0;

        const details = document.createElement('details');
        details.className = 'centrale-card';
        if (ouvrirAuto) {
            details.open = true;
        }

        const summary = document.createElement('summary');

        const arrow = document.createElement('span');
        arrow.className = 'icon-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '▼';

        const header = document.createElement('div');
        header.className = 'centrale-header';

        const nomRow = document.createElement('div');
        nomRow.className = 'centrale-nom-row';

        const nomSpan = document.createElement('span');
        nomSpan.className = 'centrale-nom';
        nomSpan.textContent = nomCentrale;

        nomRow.appendChild(nomSpan);
        nomRow.appendChild(creerBadgeStatutCentrale(nbEnLigne, nbUnites));

        const prodRow = document.createElement('div');
        prodRow.className = 'centrale-prod-row';

        const prodDiv = document.createElement('div');
        prodDiv.className = 'centrale-prod';
        prodDiv.textContent = `${formatFr3(prodTwh)} `;

        const uniteSpan = document.createElement('span');
        uniteSpan.className = 'centrale-prod-unite';
        uniteSpan.textContent = 'TWh';
        prodDiv.appendChild(uniteSpan);

        const shareSpan = document.createElement('span');
        shareSpan.className = 'card-share-badge';
        shareSpan.textContent = `${formatFr1(partPct)} %`;

        prodRow.appendChild(prodDiv);
        prodRow.appendChild(shareSpan);

        const statsRow = document.createElement('div');
        statsRow.className = 'centrale-stats-row';

        const spanUnites = document.createElement('span');
        spanUnites.textContent = `${nbUnites} unité${nbUnites > 1 ? 's' : ''}`;

        const spanEnProd = document.createElement('span');
        if (nbEnLigne > 0) {
            spanEnProd.className = 'statut-marche';
        }
        spanEnProd.textContent = `${nbEnLigne} en prod.`;

        statsRow.appendChild(spanUnites);
        statsRow.appendChild(spanEnProd);

        header.appendChild(nomRow);
        header.appendChild(prodRow);
        header.appendChild(statsRow);
        header.appendChild(creerBarreDisponibilite(nbEnLigne, nbUnites));

        summary.appendChild(arrow);
        summary.appendChild(header);

        const body = construireDetailsReacteurs(unites, data, false);
        body.appendChild(creerLienStatsCentrale(nomCentrale));

        details.appendChild(summary);
        details.appendChild(body);
        return details;
    }

    function afficherParc() {
        if (!donneesLive) return;
        const data = donneesLive;

        const focusContainer = document.getElementById('penly-container');
        const grid = document.getElementById('grid-centrales');
        const countEl = document.getElementById('parc-count');
        if (!focusContainer || !grid) return;

        focusContainer.innerHTML = '';
        grid.innerHTML = '';

        const centralesMap = data.production_par_centrale_twh || {};
        if (!Object.hasOwn(centralesMap, centraleFocus)) {
            const dispo = Object.keys(centralesMap);
            centraleFocus = dispo.includes('PENLY') ? 'PENLY' : (dispo[0] || '');
        }

        // 1. Affichage de la centrale mise en Focus
        if (centraleFocus && Object.hasOwn(centralesMap, centraleFocus)) {
            focusContainer.appendChild(creerCarteFocus(centraleFocus, centralesMap[centraleFocus], data));
        }

        // 2. Préparation, filtrage et tri du reste du parc
        const rechercheNorm = normaliserTexte(termeRecherche);

        const itemsGrille = Object.entries(centralesMap)
            .filter(([nom]) => nom !== centraleFocus)
            .map(([nom, prodTwh]) => {
                const unites = obtenirUnitesCentrale(nom, data);
                const nbEnLigne = unites.filter((r) => Boolean(data.cache_statut[r])).length;
                const nbUnites = unites.length;
                const ratioDispo = nbUnites > 0 ? nbEnLigne / nbUnites : 0;
                const matchReacteur = rechercheNorm.length > 0 && unites.some((r) => normaliserTexte(r).includes(rechercheNorm));
                const matchCentrale = rechercheNorm.length === 0 || normaliserTexte(nom).includes(rechercheNorm) || matchReacteur;

                return {
                    nom,
                    prodTwh,
                    unites,
                    nbEnLigne,
                    nbUnites,
                    ratioDispo,
                    matchCentrale,
                    ouvrirAuto: matchReacteur && !normaliserTexte(nom).includes(rechercheNorm)
                };
            })
            .filter((item) => {
                if (!item.matchCentrale) return false;
                if (filtreStatut === 'full') return item.nbUnites > 0 && item.nbEnLigne === item.nbUnites;
                if (filtreStatut === 'partial') return item.nbEnLigne < item.nbUnites;
                return true;
            })
            .sort((a, b) => {
                if (modeTri === 'name') {
                    return a.nom.localeCompare(b.nom, 'fr');
                }
                if (modeTri === 'avail') {
                    if (Math.abs(b.ratioDispo - a.ratioDispo) > 0.001) {
                        return b.ratioDispo - a.ratioDispo;
                    }
                    return b.prodTwh - a.prodTwh;
                }
                return b.prodTwh - a.prodTwh;
            });

        if (countEl) {
            countEl.textContent = `${itemsGrille.length} site${itemsGrille.length > 1 ? 's' : ''}`;
        }

        if (itemsGrille.length === 0) {
            const vide = document.createElement('div');
            vide.className = 'parc-empty-state';

            const msg = document.createElement('p');
            msg.textContent = 'Aucune centrale ne correspond aux filtres actifs.';

            const btnReset = document.createElement('button');
            btnReset.type = 'button';
            btnReset.className = 'btn-global-reset';
            btnReset.textContent = 'Réinitialiser les filtres';
            btnReset.addEventListener('click', () => {
                termeRecherche = '';
                filtreStatut = 'all';
                const searchEl = document.getElementById('search-centrale');
                if (searchEl) searchEl.value = '';
                document.querySelectorAll('.parc-filter-chips .filter-chip').forEach((chip) => {
                    const actif = chip.getAttribute('data-filter') === 'all';
                    chip.classList.toggle('active', actif);
                    chip.setAttribute('aria-pressed', String(actif));
                });
                afficherParc();
            });

            vide.appendChild(msg);
            vide.appendChild(btnReset);
            grid.appendChild(vide);
        } else {
            itemsGrille.forEach((item) => {
                const card = creerCarteCentrale(item.nom, item.prodTwh, data, item.ouvrirAuto);
                if (card) {
                    grid.appendChild(card);
                }
            });
        }

        synchroniserBoutonToutDeplier();
    }

    function peuplerSelectFocus(data) {
        const selectFocus = document.getElementById('select-focus');
        if (!selectFocus) return;

        const nomsCentrales = Object.keys(data.production_par_centrale_twh || {})
            .sort((a, b) => a.localeCompare(b, 'fr'));

        selectFocus.innerHTML = '';
        nomsCentrales.forEach((nom) => {
            const opt = document.createElement('option');
            opt.value = nom;
            opt.textContent = nom;
            if (nom === centraleFocus) opt.selected = true;
            selectFocus.appendChild(opt);
        });
    }

    function initialiserControles() {
        if (controlesInitialises) return;
        controlesInitialises = true;

        const selectFocus = document.getElementById('select-focus');
        if (selectFocus) {
            selectFocus.addEventListener('change', (e) => {
                centraleFocus = e.target.value;
                mettreAJourFocusDansUrl(centraleFocus);
                afficherParc();
            });
        }

        const searchEl = document.getElementById('search-centrale');
        if (searchEl) {
            searchEl.addEventListener('input', (e) => {
                termeRecherche = e.target.value || '';
                afficherParc();
            });
        }

        document.querySelectorAll('.parc-filter-chips .filter-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                filtreStatut = chip.getAttribute('data-filter') || 'all';
                document.querySelectorAll('.parc-filter-chips .filter-chip').forEach((c) => {
                    const actif = c === chip;
                    c.classList.toggle('active', actif);
                    c.setAttribute('aria-pressed', String(actif));
                });
                afficherParc();
            });
        });

        const sortEl = document.getElementById('sort-centrales');
        if (sortEl) {
            sortEl.addEventListener('change', (e) => {
                modeTri = e.target.value || 'prod';
                afficherParc();
            });
        }

        // Gestion de "Tout déplier / Tout replier" via Invoker Commands + fallback click
        const basculerTout = (sourceBtn) => {
            const grid = document.getElementById('grid-centrales');
            if (!grid) return;
            const expand = sourceBtn.getAttribute('aria-expanded') !== 'true';
            grid.querySelectorAll(':scope > details.centrale-card').forEach((details) => {
                details.open = expand;
            });
            sourceBtn.setAttribute('aria-expanded', String(expand));
        };

        document.addEventListener('command', (event) => {
            if (event.command !== '--toggle-all') return;
            basculerTout(event.source);
        }, { capture: true });

        if (!Object.hasOwn(HTMLButtonElement.prototype, 'commandForElement')) {
            const btnAll = document.getElementById('btn-toggle-all');
            if (btnAll) {
                btnAll.addEventListener('click', () => basculerTout(btnAll));
            }
        }

        // Synchronise aria-expanded dès qu'une carte individuelle est ouverte ou fermée
        const grid = document.getElementById('grid-centrales');
        if (grid) {
            grid.addEventListener('toggle', (event) => {
                if (event.target.matches('details.centrale-card')) {
                    synchroniserBoutonToutDeplier();
                }
            }, { capture: true });
        }
    }

    function chargerDonneesLive() {
        fetch(`data_nucleaire_france.json?t=${Date.now()}`)
            .then((response) => {
                if (!response.ok) throw new Error('Fichier introuvable');
                return response.json();
            })
            .then((data) => {
                donneesLive = data;
                anneeEnCours = data.annee_en_cours
                    || (data.horodatage_fin_recherche ? new Date(data.horodatage_fin_recherche).getFullYear() : new Date().getFullYear());

                if (!controlesInitialises) {
                    const paramFocus = new URLSearchParams(window.location.search).get('focus');
                    if (paramFocus && Object.hasOwn(data.production_par_centrale_twh || {}, paramFocus.toUpperCase())) {
                        centraleFocus = paramFocus.toUpperCase();
                    }
                }

                const titreAnneeEl = document.getElementById('titre-annee');
                if (titreAnneeEl) {
                    titreAnneeEl.textContent = `Prod. nucléaire en ${anneeEnCours}`;
                }
                document.title = `Suivi ${anneeEnCours} de la production nucléaire française par unités`;

                afficherDateMaj(
                    document.getElementById('date-maj'),
                    data.derniere_mise_a_jour,
                    data.horodatage_fin_recherche
                );

                const totalFranceEl = document.getElementById('total-france');
                if (totalFranceEl) {
                    totalFranceEl.innerHTML = `${formatFr1(data.total_france_twh)}<span class="kpi-unit">TWh</span>`;
                }

                const rOnEl = document.getElementById('reacteurs-on');
                const rTotEl = document.getElementById('reacteurs-total');
                if (rOnEl) rOnEl.textContent = formatInt(data.nombre_reacteurs_en_production);
                if (rTotEl) rTotEl.textContent = formatInt(data.nombre_reacteurs_total);

                const puissanceSubEl = document.getElementById('kpi-puissance-sub');
                if (puissanceSubEl) {
                    if (typeof data.puissance_totale_mw === 'number' && data.puissance_totale_mw > 0) {
                        puissanceSubEl.textContent = `${formatFr1(data.puissance_totale_mw / 1000)} GW injectés en direct`;
                        puissanceSubEl.hidden = false;
                    } else {
                        puissanceSubEl.hidden = true;
                    }
                }

                peuplerSelectFocus(data);
                initialiserControles();
                afficherParc();
            })
            .catch((error) => {
                console.error('Erreur de chargement:', error);
                const dateMajEl = document.getElementById('date-maj');
                if (dateMajEl) {
                    dateMajEl.textContent = 'Signal perdu avec le serveur';
                    dateMajEl.classList.add('is-error');
                }
            });
    }

    chargerDonneesLive();
    setInterval(chargerDonneesLive, 14400000);
})();
