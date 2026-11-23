(() => {
    const {
        formatFr1,
        formatFr2,
        afficherDateMaj
    } = window.ProdCommon;

    const formatNumFr = formatFr2;
    const formatNum1 = formatFr1;

    const MOIS_LONGS = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    const MOIS_COURTS = [
        'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
        'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'
    ];

    let donneesGlobales = null;
    let anneeEnCoursDonnees = new Date().getFullYear();
    let anneeAnalysee = anneeEnCoursDonnees;
    let anneeReference = anneeEnCoursDonnees - 1;
    let centraleChoisie = '';
    let modeGraphique = 'mensuel'; // 'mensuel' | 'cumule' | 'ecarts'
    let selecteursInitialises = false;
    let contexteGraphique = null;

    function obtenirInfosTemporelles(data, annee) {
        const estAnneeEnCoursReelle = (Number(annee) === Number(anneeEnCoursDonnees));
        const horodatage = data.horodatage_fin_recherche;

        if (!estAnneeEnCoursReelle) {
            return {
                moisActifIdx: 11,
                dernierMoisRevoluIdx: 11,
                estAnneeComplete: true,
                joursDansMoisEnCours: 0
            };
        }

        if (!horodatage) {
            const now = new Date();
            const moisIdx = now.getMonth();
            return {
                moisActifIdx: moisIdx,
                dernierMoisRevoluIdx: moisIdx - 1,
                estAnneeComplete: false,
                joursDansMoisEnCours: now.getDate()
            };
        }

        const dt = new Date(horodatage);
        const moisIdx = dt.getMonth();
        const estComplet = (moisIdx === 11 && dt.getDate() === 31 && dt.getHours() >= 23);

        return {
            moisActifIdx: estComplet ? 11 : moisIdx,
            dernierMoisRevoluIdx: estComplet ? 11 : moisIdx - 1,
            estAnneeComplete: estComplet,
            joursDansMoisEnCours: dt.getDate(),
            heuresDansMoisEnCours: dt.getHours()
        };
    }

    function extraireSeriesMensuelles(data, anneeStr, nomCentrale) {
        const hist = data.historique_annuel && data.historique_annuel[String(anneeStr)];
        if (!hist) {
            return new Array(12).fill(0);
        }

        if (!nomCentrale) {
            return (hist.mensuel_france_twh || new Array(12).fill(0)).slice(0, 12);
        }

        const parCentrale = hist.mensuel_par_centrale_twh || {};
        const serie = parCentrale[nomCentrale];
        if (Array.isArray(serie)) {
            return serie.slice(0, 12).map((v) => Number(Number(v).toFixed(3)));
        }

        return new Array(12).fill(0);
    }

    function calculerSerieCumulee(serieMensuelle, dernierMoisInclus = 11) {
        const cumul = [];
        let somme = 0;
        for (let m = 0; m < 12; m++) {
            if (m <= dernierMoisInclus) {
                somme += (serieMensuelle[m] || 0);
                cumul.push(Number(somme.toFixed(3)));
            } else {
                cumul.push(null);
            }
        }
        return cumul;
    }

    function formaterEvolution(valN, valRef) {
        if (!valRef || valRef <= 0) {
            return { textePct: 'N/A', texteDiff: '--', classe: 'evol-neutral' };
        }
        const diff = valN - valRef;
        const pct = (diff / valRef) * 100;
        const signe = diff >= 0 ? '+' : '';
        const classe = diff > 0.001 ? 'evol-up' : (diff < -0.001 ? 'evol-down' : 'evol-neutral');
        return {
            textePct: `${signe}${formatNum1(pct)} %`,
            texteDiff: `${signe}${formatNumFr(diff)} TWh`,
            classe
        };
    }

    function libellePerimetre() {
        if (!centraleChoisie) {
            return 'France entière (Toutes les centrales)';
        }
        return `Centrale : ${centraleChoisie}`;
    }

    function synchroniserUrlStats() {
        try {
            const url = new URL(window.location.href);

            if (centraleChoisie) {
                url.searchParams.set('centrale', centraleChoisie);
            } else {
                url.searchParams.delete('centrale');
            }

            if (Number(anneeAnalysee) !== Number(anneeEnCoursDonnees)) {
                url.searchParams.set('annee', String(anneeAnalysee));
            } else {
                url.searchParams.delete('annee');
            }

            const refParDefaut = Number(anneeAnalysee) - 1;
            if (Number(anneeReference) !== refParDefaut) {
                url.searchParams.set('ref', String(anneeReference));
            } else {
                url.searchParams.delete('ref');
            }

            if (modeGraphique && modeGraphique !== 'mensuel') {
                url.searchParams.set('mode', modeGraphique);
            } else {
                url.searchParams.delete('mode');
            }

            const query = url.searchParams.toString();
            const nouvelleUrl = query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`;
            window.history.replaceState(null, '', nouvelleUrl);
        } catch {
            // Ignorer si replaceState indisponible
        }
    }

    function appliquerParamsUrlInitial(data, nomsCentrales, anneesDispos) {
        try {
            const params = new URLSearchParams(window.location.search);

            const paramCentrale = params.get('centrale');
            if (paramCentrale) {
                const candidate = paramCentrale.toUpperCase();
                if (nomsCentrales.includes(candidate)) {
                    centraleChoisie = candidate;
                }
            }

            const paramAnnee = Number(params.get('annee'));
            if (paramAnnee && anneesDispos.includes(paramAnnee)) {
                anneeAnalysee = paramAnnee;
            }

            const paramRef = Number(params.get('ref'));
            if (paramRef && anneesDispos.includes(paramRef) && paramRef !== anneeAnalysee) {
                anneeReference = paramRef;
            }

            const paramMode = params.get('mode');
            if (paramMode === 'mensuel' || paramMode === 'cumule' || paramMode === 'ecarts') {
                modeGraphique = paramMode;
            }
        } catch {
            // URLSearchParams indisponible
        }
    }

    function synchroniserBoutonsMode() {
        document.querySelectorAll('.mode-btn').forEach((btn) => {
            const actif = btn.getAttribute('data-mode') === modeGraphique;
            btn.classList.toggle('active', actif);
            btn.setAttribute('aria-pressed', String(actif));
        });
    }

    function initialiserSelecteurs(data) {
        const selectCentrale = document.getElementById('select-centrale');
        const selectAnneeAnalysee = document.getElementById('select-annee-analysee');
        const selectAnneeRef = document.getElementById('select-annee-ref');
        const btnReset = document.getElementById('btn-reset-global');

        if (!selectCentrale || !selectAnneeAnalysee || !selectAnneeRef) return;

        const histCours = (data.historique_annuel && data.historique_annuel[String(anneeAnalysee)]) || {};
        const centralesMap = data.production_par_centrale_twh || histCours.production_par_centrale_twh || {};
        const nomsCentrales = Object.keys(centralesMap).sort((a, b) => a.localeCompare(b, 'fr'));

        const anneesDispos = (data.annees_disponibles || Object.keys(data.historique_annuel || {}))
            .map(Number)
            .sort((a, b) => b - a);

        if (!selecteursInitialises) {
            appliquerParamsUrlInitial(data, nomsCentrales, anneesDispos);
        }

        if (!anneesDispos.includes(Number(anneeAnalysee))) {
            anneeAnalysee = anneesDispos[0] || new Date().getFullYear();
        }

        selectCentrale.innerHTML = '<option value="">⚡ France entière (Toutes les centrales)</option>';
        nomsCentrales.forEach((nom) => {
            const opt = document.createElement('option');
            opt.value = nom;
            opt.textContent = `Centrale de ${nom}`;
            selectCentrale.appendChild(opt);
        });
        selectCentrale.value = centraleChoisie;

        function rafraichirOptionsAnnees() {
            selectAnneeAnalysee.innerHTML = '';
            anneesDispos.forEach((an) => {
                const opt = document.createElement('option');
                opt.value = an;
                opt.textContent = `${an}${Number(an) === Number(anneeEnCoursDonnees) ? ' (en cours)' : ''}`;
                if (Number(an) === Number(anneeAnalysee)) opt.selected = true;
                selectAnneeAnalysee.appendChild(opt);
            });

            selectAnneeRef.innerHTML = '';
            const anneesComparables = anneesDispos.filter((an) => Number(an) !== Number(anneeAnalysee));

            if (!anneesComparables.includes(Number(anneeReference))) {
                const ideal = Number(anneeAnalysee) - 1;
                anneeReference = anneesComparables.includes(ideal)
                    ? ideal
                    : (anneesComparables[0] || ideal);
            }

            anneesComparables.forEach((an) => {
                const opt = document.createElement('option');
                opt.value = an;
                opt.textContent = `${an}`;
                if (Number(an) === Number(anneeReference)) opt.selected = true;
                selectAnneeRef.appendChild(opt);
            });
        }

        rafraichirOptionsAnnees();
        synchroniserBoutonsMode();

        if (!selecteursInitialises) {
            selecteursInitialises = true;

            selectCentrale.addEventListener('change', (e) => {
                centraleChoisie = e.target.value;
                mettreAJourAffichagePerimetre();
                synchroniserUrlStats();
                rafraichirVueStatistiques();
            });

            selectAnneeAnalysee.addEventListener('change', (e) => {
                anneeAnalysee = Number(e.target.value);
                rafraichirOptionsAnnees();
                mettreAJourAffichageTitres();
                synchroniserUrlStats();
                rafraichirVueStatistiques();
            });

            selectAnneeRef.addEventListener('change', (e) => {
                anneeReference = Number(e.target.value);
                mettreAJourAffichageTitres();
                synchroniserUrlStats();
                rafraichirVueStatistiques();
            });

            if (btnReset) {
                btnReset.addEventListener('click', () => {
                    centraleChoisie = '';
                    selectCentrale.value = '';
                    mettreAJourAffichagePerimetre();
                    synchroniserUrlStats();
                    rafraichirVueStatistiques();
                });
            }

            document.querySelectorAll('.mode-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    modeGraphique = btn.getAttribute('data-mode') || 'mensuel';
                    synchroniserBoutonsMode();
                    synchroniserUrlStats();
                    rafraichirVueStatistiques();
                });
            });

            const btnExportSvg = document.getElementById('btn-export-svg');
            if (btnExportSvg) {
                btnExportSvg.addEventListener('click', exporterSvg);
            }

            const btnExportCsv = document.getElementById('btn-export-csv');
            if (btnExportCsv) {
                btnExportCsv.addEventListener('click', exporterCsv);
            }
        }

        mettreAJourAffichagePerimetre();
        mettreAJourAffichageTitres();
    }

    function mettreAJourAffichagePerimetre() {
        const btnReset = document.getElementById('btn-reset-global');
        const badge = document.getElementById('perimetre-badge');
        const tableLabel = document.getElementById('table-perimetre-label');
        const texte = libellePerimetre();

        if (badge) badge.textContent = texte;
        if (tableLabel) tableLabel.textContent = texte;
        if (btnReset) {
            btnReset.classList.toggle('is-active', !centraleChoisie);
        }
    }

    function mettreAJourAffichageTitres() {
        const titre = `Statistiques ${anneeAnalysee} vs ${anneeReference}`;
        document.title = `${titre} — Production nucléaire française`;

        const h1El = document.getElementById('stats-titre-annee');
        if (h1El) h1El.textContent = titre;

        const thN = document.getElementById('th-annee-n');
        if (thN) thN.textContent = `${anneeAnalysee} (TWh)`;

        const thRef = document.getElementById('th-annee-n1');
        if (thRef) thRef.textContent = `${anneeReference} (TWh)`;

        mettreAJourLegende();
    }

    function mettreAJourLegende() {
        const legendeEl = document.getElementById('chart-legend');
        if (!legendeEl) return;

        if (modeGraphique === 'ecarts') {
            legendeEl.innerHTML = `
                <span class="legend-item">
                    <span class="legend-swatch-pos"></span>
                    <span>Surplus ${anneeAnalysee} vs ${anneeReference}</span>
                </span>
                <span class="legend-item">
                    <span class="legend-swatch-neg"></span>
                    <span>Déficit ${anneeAnalysee} vs ${anneeReference}</span>
                </span>
            `;
        } else {
            legendeEl.innerHTML = `
                <span class="legend-item">
                    <span class="legend-line legend-line-current"></span>
                    <span>Année ${anneeAnalysee}</span>
                </span>
                <span class="legend-item">
                    <span class="legend-line legend-line-prev"></span>
                    <span>Année ${anneeReference}</span>
                </span>
            `;
        }
    }

    function mettreAJourKPIs(serieN, serieRef, infosTemp) {
        const { moisActifIdx, dernierMoisRevoluIdx, estAnneeComplete, joursDansMoisEnCours } = infosTemp;
        const aMoisRevolu = (dernierMoisRevoluIdx >= 0);
        const limiteComparaison = aMoisRevolu ? dernierMoisRevoluIdx : moisActifIdx;

        let cumulNRevolu = 0;
        let cumulRefComparable = 0;
        for (let m = 0; m <= limiteComparaison; m++) {
            cumulNRevolu += (serieN[m] || 0);
            cumulRefComparable += (serieRef[m] || 0);
        }

        const total12MoisRef = serieRef.reduce((acc, v) => acc + (v || 0), 0);
        const evol = formaterEvolution(cumulNRevolu, cumulRefComparable);

        const labelPeriode = estAnneeComplete
            ? '12 mois complets'
            : (aMoisRevolu ? `Janv. – ${MOIS_COURTS[dernierMoisRevoluIdx]}` : 'Janvier en cours');

        document.getElementById('kpi-title-cumul-n').textContent = `Cumul ${anneeAnalysee} (${labelPeriode})`;
        document.getElementById('kpi-val-cumul-n').innerHTML = `${formatNumFr(cumulNRevolu)}<span class="kpi-unit">TWh</span>`;

        const evolPctEl = document.getElementById('kpi-evol-pct');
        evolPctEl.textContent = evol.textePct;
        evolPctEl.className = `evol-pill ${evol.classe}`;
        document.getElementById('kpi-evol-diff').textContent = `${evol.texteDiff} vs ${anneeReference} (même période)`;

        const extraOngoingEl = document.getElementById('kpi-extra-ongoing');
        if (extraOngoingEl) {
            if (!estAnneeComplete && moisActifIdx > dernierMoisRevoluIdx) {
                const valMoisEnCours = serieN[moisActifIdx] || 0;
                extraOngoingEl.textContent = `+ ${formatNumFr(valMoisEnCours)} TWh en cours en ${MOIS_LONGS[moisActifIdx]} (${joursDansMoisEnCours} j)`;
            } else {
                extraOngoingEl.textContent = '';
            }
        }

        // Projection indicative de fin d'année (année en cours avec >= 2 mois révolus)
        const nbMoisComplets = estAnneeComplete ? 12 : Math.max(0, dernierMoisRevoluIdx + 1);
        const projEl = document.getElementById('kpi-projection');
        if (projEl) {
            if (!estAnneeComplete && nbMoisComplets >= 2 && cumulRefComparable > 0 && total12MoisRef > 0) {
                const projection = total12MoisRef * (cumulNRevolu / cumulRefComparable);
                projEl.textContent = `Projection fin ${anneeAnalysee} : ~${formatNumFr(projection)} TWh (est.)`;
                projEl.hidden = false;
            } else {
                projEl.hidden = true;
            }
        }

        // Part de la centrale dans le parc national sur la période comparable
        const partBadgeEl = document.getElementById('perimetre-part-badge');
        if (partBadgeEl && donneesGlobales) {
            if (centraleChoisie) {
                const serieFranceN = extraireSeriesMensuelles(donneesGlobales, String(anneeAnalysee), '');
                let cumulFrance = 0;
                for (let m = 0; m <= limiteComparaison; m++) {
                    cumulFrance += (serieFranceN[m] || 0);
                }
                if (cumulFrance > 0) {
                    const partPct = (cumulNRevolu / cumulFrance) * 100;
                    partBadgeEl.textContent = `${formatNum1(partPct)} % du parc national`;
                    partBadgeEl.hidden = false;
                } else {
                    partBadgeEl.hidden = true;
                }
            } else {
                partBadgeEl.hidden = true;
            }
        }

        document.getElementById('kpi-title-ref-n1').textContent = `Référence ${anneeReference} (${labelPeriode})`;
        document.getElementById('kpi-val-comparable-n1').innerHTML = `${formatNumFr(cumulRefComparable)}<span class="kpi-unit">TWh</span>`;
        document.getElementById('kpi-val-total-n1').textContent = `Total annuel complet ${anneeReference} (12 mois) : ${formatNumFr(total12MoisRef)} TWh`;

        const pctTotalRef = total12MoisRef > 0 ? Math.min(100, (cumulNRevolu / total12MoisRef) * 100) : 0;
        const progressBar = document.getElementById('kpi-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${pctTotalRef.toFixed(1)}%`;
        }

        const diviseurMoyenne = Math.max(1, nbMoisComplets);
        const moyenneMensuelleN = cumulNRevolu / diviseurMoyenne;

        let maxVal = -1;
        let maxMoisIdx = 0;
        for (let m = 0; m <= limiteComparaison; m++) {
            if ((serieN[m] || 0) > maxVal) {
                maxVal = serieN[m] || 0;
                maxMoisIdx = m;
            }
        }

        document.getElementById('kpi-title-moyenne').textContent = `Moyenne mensuelle ${anneeAnalysee}`;
        document.getElementById('kpi-val-moyenne-n').innerHTML = `${formatNumFr(moyenneMensuelleN)}<span class="kpi-unit">TWh / mois</span>`;
        document.getElementById('kpi-sub-record').textContent =
            `Pic ${anneeAnalysee} : ${MOIS_LONGS[maxMoisIdx]} (${formatNumFr(maxVal)} TWh)`;
    }

    function mettreAJourBandeauSurvol(moisIdx, serieAfficheeN, serieAfficheeRef, infosTemp) {
        const banner = document.getElementById('chart-hover-banner');
        if (!banner) return;

        if (moisIdx === null || moisIdx < 0 || moisIdx > 11) {
            banner.innerHTML = `Survolez ou sélectionnez un mois pour comparer <strong>${anneeAnalysee}</strong> et <strong>${anneeReference}</strong>.`;
            return;
        }

        const nomMois = MOIS_LONGS[moisIdx];
        const valRef = serieAfficheeRef[moisIdx];
        const valN = serieAfficheeN[moisIdx];
        const typeLabel = modeGraphique === 'cumule'
            ? 'Cumul à fin'
            : (modeGraphique === 'ecarts' ? 'Écart mensuel' : 'Production');

        if (moisIdx > infosTemp.moisActifIdx || valN === null) {
            banner.innerHTML = `
                <strong>${nomMois}</strong> (${typeLabel}) —
                <span class="banner-n1">${anneeReference} : <strong>${formatNumFr(valRef)} TWh</strong></span> ·
                <span class="banner-future">${anneeAnalysee} : <em>Mois à venir</em></span>
            `;
            return;
        }

        const estMoisEnCoursPartiel = (!infosTemp.estAnneeComplete && moisIdx === infosTemp.moisActifIdx);
        if (estMoisEnCoursPartiel) {
            banner.innerHTML = `
                <strong>${nomMois}</strong> (${typeLabel}) —
                <span class="banner-n">${anneeAnalysee} : <strong>${formatNumFr(valN)} TWh</strong> (partiel, ${infosTemp.joursDansMoisEnCours} j)</span> ·
                <span class="banner-n1">${anneeReference} (mois complet) : <strong>${formatNumFr(valRef)} TWh</strong></span>
                <span class="evol-pill evol-neutral">Mois en cours de consolidation</span>
            `;
            return;
        }

        const evol = formaterEvolution(valN, valRef);
        banner.innerHTML = `
            <strong>${nomMois}</strong> (${typeLabel}) —
            <span class="banner-n">${anneeAnalysee} : <strong>${formatNumFr(valN)} TWh</strong></span> vs
            <span class="banner-n1">${anneeReference} : <strong>${formatNumFr(valRef)} TWh</strong></span>
            <span class="evol-pill ${evol.classe}">${evol.textePct} (${evol.texteDiff})</span>
        `;
    }

    function activerSurvolMois(moisIdx) {
        if (!contexteGraphique) return;
        const { xCoords, serieBandeauN, serieBandeauRef, infosTemp } = contexteGraphique;

        const guide = document.getElementById('svg-hover-guide');
        if (guide && xCoords[moisIdx] !== undefined) {
            const x = xCoords[moisIdx].toFixed(1);
            guide.setAttribute('x1', x);
            guide.setAttribute('x2', x);
            guide.setAttribute('visibility', 'visible');
        }

        const svg = document.querySelector('#chart-svg-wrapper svg');
        if (svg) {
            svg.querySelectorAll('.chart-dot-prev').forEach((dot) => {
                dot.setAttribute('r', Number(dot.getAttribute('data-month')) === moisIdx ? '6' : '4');
            });
            svg.querySelectorAll('.chart-dot-current').forEach((dot) => {
                dot.setAttribute('r', Number(dot.getAttribute('data-month')) === moisIdx ? '7' : '5');
            });
            svg.querySelectorAll('.chart-month-label').forEach((lbl) => {
                lbl.classList.toggle('is-active', Number(lbl.getAttribute('data-month')) === moisIdx);
            });
            svg.querySelectorAll('.chart-bar-item').forEach((bar) => {
                bar.classList.toggle('is-active', Number(bar.getAttribute('data-month')) === moisIdx);
            });
        }

        document.querySelectorAll('#stats-table-body tr[data-month]').forEach((tr) => {
            tr.classList.toggle('row-highlighted', Number(tr.getAttribute('data-month')) === moisIdx);
        });

        mettreAJourBandeauSurvol(moisIdx, serieBandeauN, serieBandeauRef, infosTemp);
    }

    function desactiverSurvolMois() {
        if (!contexteGraphique) return;
        const { serieBandeauN, serieBandeauRef, infosTemp, moisCibleDefaut } = contexteGraphique;

        const guide = document.getElementById('svg-hover-guide');
        if (guide) {
            guide.setAttribute('visibility', 'hidden');
        }

        const svg = document.querySelector('#chart-svg-wrapper svg');
        if (svg) {
            svg.querySelectorAll('.chart-dot-prev').forEach((dot) => dot.setAttribute('r', '4'));
            svg.querySelectorAll('.chart-dot-current').forEach((dot) => dot.setAttribute('r', '5'));
            svg.querySelectorAll('.chart-month-label').forEach((lbl) => lbl.classList.remove('is-active'));
            svg.querySelectorAll('.chart-bar-item').forEach((bar) => bar.classList.remove('is-active'));
        }

        document.querySelectorAll('#stats-table-body tr[data-month]').forEach((tr) => {
            tr.classList.remove('row-highlighted');
        });

        mettreAJourBandeauSurvol(moisCibleDefaut, serieBandeauN, serieBandeauRef, infosTemp);
    }

    function dessinerGraphiqueCourbes(serieMensuelleN, serieMensuelleRef, infosTemp) {
        const wrapper = document.getElementById('chart-svg-wrapper');
        if (!wrapper) return;

        const { moisActifIdx, dernierMoisRevoluIdx, estAnneeComplete } = infosTemp;

        const serieN = modeGraphique === 'cumule'
            ? calculerSerieCumulee(serieMensuelleN, moisActifIdx)
            : serieMensuelleN.map((v, i) => (i <= moisActifIdx ? v : null));

        const serieRef = modeGraphique === 'cumule'
            ? calculerSerieCumulee(serieMensuelleRef, 11)
            : serieMensuelleRef.slice(0, 12);

        const toutesValeurs = [
            ...serieN.filter((v) => v !== null),
            ...serieRef.filter((v) => v !== null)
        ];
        const maxBrut = Math.max(...toutesValeurs, 1);
        const maxY = Math.ceil(maxBrut * 1.12 * 10) / 10;

        const width = 920;
        const height = 340;
        const padLeft = 66;
        const padRight = 28;
        const padTop = 26;
        const padBottom = 46;
        const plotW = width - padLeft - padRight;
        const plotH = height - padTop - padBottom;

        const xCoord = (m) => padLeft + (m / 11) * plotW;
        const yCoord = (val) => padTop + plotH - (Math.max(0, val) / maxY) * plotH;
        const xCoords = Array.from({ length: 12 }, (_, m) => xCoord(m));

        let gridLinesHtml = '';
        const nbGraduations = 5;
        for (let i = 0; i <= nbGraduations; i++) {
            const ratio = i / nbGraduations;
            const valY = maxY * (1 - ratio);
            const y = padTop + ratio * plotH;
            gridLinesHtml += `
                <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" class="chart-grid-line" />
                <text x="${padLeft - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="chart-axis-label">${formatNum1(valY)} TWh</text>
            `;
        }

        const pointsRef = serieRef.map((v, m) => `${xCoords[m].toFixed(1)},${yCoord(v).toFixed(1)}`);
        const pathRef = `M ${pointsRef.join(' L ')}`;

        const limiteSolide = estAnneeComplete ? 11 : dernierMoisRevoluIdx;
        const coordsSolides = [];
        for (let m = 0; m <= limiteSolide; m++) {
            if (serieN[m] !== null && m >= 0) {
                coordsSolides.push({ m, x: xCoords[m], y: yCoord(serieN[m]) });
            }
        }

        let pathNSolide = '';
        let areaNSolide = '';
        if (coordsSolides.length > 0) {
            const pts = coordsSolides.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
            pathNSolide = `M ${pts.join(' L ')}`;
            const firstX = coordsSolides[0].x.toFixed(1);
            const lastX = coordsSolides[coordsSolides.length - 1].x.toFixed(1);
            const baseLineY = (padTop + plotH).toFixed(1);
            areaNSolide = `M ${firstX},${baseLineY} L ${pts.join(' L ')} L ${lastX},${baseLineY} Z`;
        }

        let pathNEnCours = '';
        if (!estAnneeComplete && moisActifIdx > dernierMoisRevoluIdx && coordsSolides.length > 0) {
            const dernierSolide = coordsSolides[coordsSolides.length - 1];
            const ptActif = `${xCoords[moisActifIdx].toFixed(1)},${yCoord(serieN[moisActifIdx]).toFixed(1)}`;
            pathNEnCours = `M ${dernierSolide.x.toFixed(1)},${dernierSolide.y.toFixed(1)} L ${ptActif}`;
        }

        let pointsHtml = `<line id="svg-hover-guide" x1="0" y1="${padTop}" x2="0" y2="${padTop + plotH}" class="chart-hover-guide" visibility="hidden" />`;
        let hitZonesHtml = '';
        const stepW = plotW / 11;

        for (let m = 0; m < 12; m++) {
            const cx = xCoords[m];
            const cyRef = yCoord(serieRef[m]);

            pointsHtml += `<circle cx="${cx.toFixed(1)}" cy="${cyRef.toFixed(1)}" r="4" class="chart-dot-prev" data-month="${m}" />`;

            if (m <= moisActifIdx && serieN[m] !== null) {
                const cyN = yCoord(serieN[m]);
                const estMoisCourant = (!estAnneeComplete && m === moisActifIdx);
                const classePoint = estMoisCourant ? 'chart-dot-current is-ongoing' : 'chart-dot-current';
                pointsHtml += `<circle cx="${cx.toFixed(1)}" cy="${cyN.toFixed(1)}" r="5" class="${classePoint}" data-month="${m}" />`;
            }

            pointsHtml += `<text x="${cx.toFixed(1)}" y="${height - 14}" text-anchor="middle" class="chart-month-label" data-month="${m}">${MOIS_COURTS[m]}</text>`;

            const zoneX = Math.max(padLeft - stepW / 2, cx - stepW / 2);
            hitZonesHtml += `
                <rect
                    x="${zoneX.toFixed(1)}"
                    y="${padTop}"
                    width="${stepW.toFixed(1)}"
                    height="${plotH}"
                    class="chart-hit-zone"
                    data-month="${m}"
                    tabindex="0"
                    role="button"
                    aria-label="${MOIS_LONGS[m]} : ${serieN[m] !== null ? `${formatNumFr(serieN[m])} TWh en ${anneeAnalysee}` : 'Mois à venir'} contre ${formatNumFr(serieRef[m])} TWh en ${anneeReference}"
                />
            `;
        }

        wrapper.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" class="stats-svg" role="img" aria-label="Courbe comparative de production sur 12 mois entre ${anneeAnalysee} et ${anneeReference}">
                <defs>
                    <linearGradient id="edfAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#005BBB" stop-opacity="0.24" />
                        <stop offset="100%" stop-color="#005BBB" stop-opacity="0.01" />
                    </linearGradient>
                </defs>
                ${gridLinesHtml}
                ${areaNSolide ? `<path d="${areaNSolide}" fill="url(#edfAreaGrad)" />` : ''}
                <path d="${pathRef}" class="chart-path-prev" fill="none" />
                ${pathNSolide ? `<path d="${pathNSolide}" class="chart-path-current" fill="none" />` : ''}
                ${pathNEnCours ? `<path d="${pathNEnCours}" class="chart-path-ongoing-dash" fill="none" />` : ''}
                ${pointsHtml}
                ${hitZonesHtml}
            </svg>
        `;

        const moisCibleDefaut = (estAnneeComplete || dernierMoisRevoluIdx < 0)
            ? moisActifIdx
            : dernierMoisRevoluIdx;

        contexteGraphique = {
            xCoords,
            serieBandeauN: serieN,
            serieBandeauRef: serieRef,
            infosTemp,
            moisCibleDefaut
        };
    }

    function dessinerGraphiqueEcarts(serieMensuelleN, serieMensuelleRef, infosTemp) {
        const wrapper = document.getElementById('chart-svg-wrapper');
        if (!wrapper) return;

        const { moisActifIdx, dernierMoisRevoluIdx, estAnneeComplete } = infosTemp;

        const ecarts = [];
        for (let m = 0; m < 12; m++) {
            const estRevolu = estAnneeComplete || m <= dernierMoisRevoluIdx;
            if (estRevolu) {
                ecarts.push(Number(((serieMensuelleN[m] || 0) - (serieMensuelleRef[m] || 0)).toFixed(3)));
            } else {
                ecarts.push(null);
            }
        }

        const absVals = ecarts.filter((v) => v !== null).map(Math.abs);
        const maxAbs = Math.max(...absVals, 0.2);
        const maxBound = Math.ceil(maxAbs * 1.2 * 10) / 10;

        const width = 920;
        const height = 340;
        const padLeft = 72;
        const padRight = 28;
        const padTop = 32;
        const padBottom = 46;
        const plotW = width - padLeft - padRight;
        const plotH = height - padTop - padBottom;

        const stepW = plotW / 12;
        const xCoord = (m) => padLeft + stepW * (m + 0.5);
        const xCoords = Array.from({ length: 12 }, (_, m) => xCoord(m));
        const yCoord = (val) => padTop + ((maxBound - val) / (2 * maxBound)) * plotH;
        const yZero = yCoord(0);

        let gridLinesHtml = '';
        const graduations = [maxBound, maxBound / 2, 0, -maxBound / 2, -maxBound];
        graduations.forEach((valY) => {
            const y = yCoord(valY);
            const estZero = Math.abs(valY) < 0.0001;
            const signe = valY > 0 ? '+' : '';
            gridLinesHtml += `
                <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" class="${estZero ? 'chart-zero-line' : 'chart-grid-line'}" />
                <text x="${padLeft - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="chart-axis-label">${signe}${formatNum1(valY)} TWh</text>
            `;
        });

        let barsHtml = `<line id="svg-hover-guide" x1="0" y1="${padTop}" x2="0" y2="${padTop + plotH}" class="chart-hover-guide" visibility="hidden" />`;
        let hitZonesHtml = '';
        const barW = Math.min(34, stepW * 0.54);

        for (let m = 0; m < 12; m++) {
            const cx = xCoords[m];
            const delta = ecarts[m];

            if (delta !== null) {
                const yVal = yCoord(delta);
                const rectY = delta >= 0 ? yVal : yZero;
                const rectH = Math.max(2, Math.abs(yZero - yVal));
                const classeBar = delta >= 0 ? 'chart-bar-item chart-bar-pos' : 'chart-bar-item chart-bar-neg';
                const labelY = delta >= 0 ? rectY - 6 : rectY + rectH + 13;
                const signe = delta >= 0 ? '+' : '';

                barsHtml += `
                    <rect x="${(cx - barW / 2).toFixed(1)}" y="${rectY.toFixed(1)}" width="${barW.toFixed(1)}" height="${rectH.toFixed(1)}" rx="4" class="${classeBar}" data-month="${m}" />
                    <text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" class="chart-bar-label">${signe}${formatNum1(delta)}</text>
                `;
            } else if (!estAnneeComplete && m === moisActifIdx) {
                barsHtml += `
                    <rect x="${(cx - barW / 2).toFixed(1)}" y="${(yZero - 4).toFixed(1)}" width="${barW.toFixed(1)}" height="8" rx="3" class="chart-bar-item chart-bar-ongoing" data-month="${m}" />
                `;
            }

            barsHtml += `<text x="${cx.toFixed(1)}" y="${height - 14}" text-anchor="middle" class="chart-month-label" data-month="${m}">${MOIS_COURTS[m]}</text>`;

            const zoneX = padLeft + stepW * m;
            const ariaVal = delta !== null
                ? `${delta >= 0 ? '+' : ''}${formatNumFr(delta)} TWh`
                : (!estAnneeComplete && m === moisActifIdx ? 'Mois en cours non clos' : 'Mois à venir');
            hitZonesHtml += `
                <rect
                    x="${zoneX.toFixed(1)}"
                    y="${padTop}"
                    width="${stepW.toFixed(1)}"
                    height="${plotH}"
                    class="chart-hit-zone"
                    data-month="${m}"
                    tabindex="0"
                    role="button"
                    aria-label="${MOIS_LONGS[m]} : écart ${ariaVal}"
                />
            `;
        }

        wrapper.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" class="stats-svg" role="img" aria-label="Écarts mensuels de production entre ${anneeAnalysee} et ${anneeReference}">
                ${gridLinesHtml}
                ${barsHtml}
                ${hitZonesHtml}
            </svg>
        `;

        const serieBandeauN = serieMensuelleN.map((v, i) => (i <= moisActifIdx ? v : null));
        const serieBandeauRef = serieMensuelleRef.slice(0, 12);
        const moisCibleDefaut = (estAnneeComplete || dernierMoisRevoluIdx < 0)
            ? moisActifIdx
            : dernierMoisRevoluIdx;

        contexteGraphique = {
            xCoords,
            serieBandeauN,
            serieBandeauRef,
            infosTemp,
            moisCibleDefaut
        };
    }

    function dessinerGraphiqueSVG(serieMensuelleN, serieMensuelleRef, infosTemp) {
        mettreAJourLegende();

        if (modeGraphique === 'ecarts') {
            dessinerGraphiqueEcarts(serieMensuelleN, serieMensuelleRef, infosTemp);
        } else {
            dessinerGraphiqueCourbes(serieMensuelleN, serieMensuelleRef, infosTemp);
        }

        const wrapper = document.getElementById('chart-svg-wrapper');
        if (!wrapper || !contexteGraphique) return;

        wrapper.querySelectorAll('.chart-hit-zone').forEach((zone) => {
            const m = Number(zone.getAttribute('data-month'));
            zone.addEventListener('mouseenter', () => activerSurvolMois(m));
            zone.addEventListener('focus', () => activerSurvolMois(m));
            zone.addEventListener('click', () => activerSurvolMois(m));
        });

        wrapper.querySelector('svg')?.addEventListener('mouseleave', desactiverSurvolMois);

        mettreAJourBandeauSurvol(
            contexteGraphique.moisCibleDefaut,
            contexteGraphique.serieBandeauN,
            contexteGraphique.serieBandeauRef,
            contexteGraphique.infosTemp
        );
    }

    function remplirTableauMensuel(serieN, serieRef, infosTemp) {
        const tableEl = document.getElementById('stats-table');
        const tbody = document.getElementById('stats-table-body');
        const tfoot = document.getElementById('stats-table-foot');
        if (!tbody || !tfoot) return;

        if (tableEl) {
            tableEl.style.setProperty('--label-2', JSON.stringify(`${anneeReference} (TWh)`));
            tableEl.style.setProperty('--label-3', JSON.stringify(`${anneeAnalysee} (TWh)`));
            tableEl.style.setProperty('--label-4', '"Écart (TWh)"');
            tableEl.style.setProperty('--label-5', '"Évolution (%)"');
        }

        const { moisActifIdx, dernierMoisRevoluIdx, estAnneeComplete, joursDansMoisEnCours } = infosTemp;
        let htmlLignes = '';
        let totalNRevolu = 0;
        let totalRefComparable = 0;
        let totalRefComplet = 0;
        let totalNTotal = 0;

        for (let m = 0; m < 12; m++) {
            const valRef = serieRef[m] || 0;
            totalRefComplet += valRef;

            const estFutur = m > moisActifIdx;
            const estEnCoursPartiel = (!estAnneeComplete && m === moisActifIdx);
            const estRevolu = (m <= dernierMoisRevoluIdx);

            if (estFutur) {
                htmlLignes += `
                    <tr class="row-future" data-month="${m}">
                        <th scope="row"><span class="month-name">${MOIS_LONGS[m]}</span></th>
                        <td class="num-col">${formatNumFr(valRef)}</td>
                        <td class="num-col text-muted-italic">À venir</td>
                        <td class="num-col text-muted-italic">—</td>
                        <td class="num-col text-muted-italic">—</td>
                    </tr>
                `;
            } else if (estEnCoursPartiel) {
                const valN = serieN[m] || 0;
                totalNTotal += valN;

                htmlLignes += `
                    <tr class="row-ongoing" data-month="${m}">
                        <th scope="row"><span class="month-name">${MOIS_LONGS[m]}</span> <span class="badge-ongoing">En cours (${joursDansMoisEnCours} j)</span></th>
                        <td class="num-col">${formatNumFr(valRef)}</td>
                        <td class="num-col font-strong">${formatNumFr(valN)}</td>
                        <td class="num-col text-muted-italic">Mois non clos</td>
                        <td class="num-col"><span class="evol-pill evol-neutral">En cours</span></td>
                    </tr>
                `;
            } else {
                const valN = serieN[m] || 0;
                totalNTotal += valN;
                if (estRevolu) {
                    totalNRevolu += valN;
                    totalRefComparable += valRef;
                }

                const evol = formaterEvolution(valN, valRef);
                htmlLignes += `
                    <tr data-month="${m}">
                        <th scope="row"><span class="month-name">${MOIS_LONGS[m]}</span></th>
                        <td class="num-col">${formatNumFr(valRef)}</td>
                        <td class="num-col font-strong">${formatNumFr(valN)}</td>
                        <td class="num-col ${evol.classe}-text">${evol.texteDiff}</td>
                        <td class="num-col"><span class="evol-pill ${evol.classe}">${evol.textePct}</span></td>
                    </tr>
                `;
            }
        }

        tbody.innerHTML = htmlLignes;

        tbody.querySelectorAll('tr[data-month]').forEach((tr) => {
            const m = Number(tr.getAttribute('data-month'));
            tr.addEventListener('mouseenter', () => activerSurvolMois(m));
            tr.addEventListener('mouseleave', desactiverSurvolMois);
        });

        const labelCumulRevolu = estAnneeComplete
            ? 'Total annuel complet (12 mois)'
            : (dernierMoisRevoluIdx >= 0 ? `Total cumulé (Mois révolus : Janv. – ${MOIS_COURTS[dernierMoisRevoluIdx]})` : 'Janvier en cours');

        const evolTotal = formaterEvolution(totalNRevolu, totalRefComparable);
        let htmlFoot = `
            <tr class="tfoot-row">
                <th scope="row">${labelCumulRevolu}</th>
                <td class="num-col">${formatNumFr(totalRefComparable)}</td>
                <td class="num-col font-strong">${formatNumFr(totalNRevolu)}</td>
                <td class="num-col ${evolTotal.classe}-text">${evolTotal.texteDiff}</td>
                <td class="num-col"><span class="evol-pill ${evolTotal.classe}">${evolTotal.textePct}</span></td>
            </tr>
        `;

        if (!estAnneeComplete && moisActifIdx > dernierMoisRevoluIdx) {
            htmlFoot += `
                <tr class="tfoot-row-secondary">
                    <th scope="row">Total provisoire ${anneeAnalysee} (avec mois en cours)</th>
                    <td class="num-col">${formatNumFr(totalRefComplet)}</td>
                    <td class="num-col font-mono font-strong">${formatNumFr(totalNTotal)}</td>
                    <td class="num-col text-muted-italic" colspan="2">Inclut ${MOIS_LONGS[moisActifIdx]} non clos</td>
                </tr>
            `;
        } else {
            htmlFoot += `
                <tr class="tfoot-row-secondary">
                    <th scope="row">Total annuel complet ${anneeReference} (12 mois)</th>
                    <td class="num-col">${formatNumFr(totalRefComplet)}</td>
                    <td class="num-col font-strong">${formatNumFr(totalNTotal)}</td>
                    <td class="num-col text-muted-italic" colspan="2">12 mois complets comparés</td>
                </tr>
            `;
        }

        tfoot.innerHTML = htmlFoot;
    }

    function slugPerimetre() {
        return centraleChoisie
            ? centraleChoisie.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            : 'france-entiere';
    }

    function declencherTelechargement(blob, nomFichier) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomFichier;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exporterCsv() {
        if (!donneesGlobales) return;

        const infosTemp = obtenirInfosTemporelles(donneesGlobales, anneeAnalysee);
        const serieN = extraireSeriesMensuelles(donneesGlobales, String(anneeAnalysee), centraleChoisie);
        const serieRef = extraireSeriesMensuelles(donneesGlobales, String(anneeReference), centraleChoisie);

        const lignes = [
            ['Mois', `${anneeReference} (TWh)`, `${anneeAnalysee} (TWh)`, 'Ecart (TWh)', 'Evolution (%)', 'Statut'].join(';')
        ];

        let totalN = 0;
        let totalRef = 0;

        for (let m = 0; m < 12; m++) {
            const valRef = serieRef[m] || 0;
            const estFutur = m > infosTemp.moisActifIdx;
            const estPartiel = (!infosTemp.estAnneeComplete && m === infosTemp.moisActifIdx);

            if (estFutur) {
                lignes.push([MOIS_LONGS[m], formatNumFr(valRef), '', '', '', 'A venir'].join(';'));
            } else if (estPartiel) {
                lignes.push([MOIS_LONGS[m], formatNumFr(valRef), formatNumFr(serieN[m] || 0), '', '', `En cours (${infosTemp.joursDansMoisEnCours} j)`].join(';'));
            } else {
                const valN = serieN[m] || 0;
                totalN += valN;
                totalRef += valRef;
                const evol = formaterEvolution(valN, valRef);
                lignes.push([MOIS_LONGS[m], formatNumFr(valRef), formatNumFr(valN), evol.texteDiff.replace(' TWh', ''), evol.textePct, 'Clos'].join(';'));
            }
        }

        const evolTot = formaterEvolution(totalN, totalRef);
        lignes.push(['Total mois revolus', formatNumFr(totalRef), formatNumFr(totalN), evolTot.texteDiff.replace(' TWh', ''), evolTot.textePct, 'Comparaison periode'].join(';'));

        const contenu = `\uFEFF${lignes.join('\n')}`;
        const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8;' });
        declencherTelechargement(blob, `production-nucleaire-${slugPerimetre()}-${anneeAnalysee}-vs-${anneeReference}.csv`);
    }

    function exporterSvg() {
        const svgOriginal = document.querySelector('#chart-svg-wrapper svg');
        if (!svgOriginal) return;

        const clone = svgOriginal.cloneNode(true);
        const styles = getComputedStyle(document.documentElement);

        const bg = '#FFFFFF';
        const border = styles.getPropertyValue('--border').trim() || '#E5E7EB';
        const textLight = styles.getPropertyValue('--text-light').trim() || '#6B7280';
        const textMain = styles.getPropertyValue('--text-main').trim() || '#1F2937';
        const blue = styles.getPropertyValue('--edf-blue').trim() || '#001A70';
        const midBlue = styles.getPropertyValue('--edf-mid-blue').trim() || '#005BBB';
        const prev = styles.getPropertyValue('--chart-prev').trim() || '#94A3B8';
        const orange = styles.getPropertyValue('--edf-orange').trim() || '#FE5800';
        const green = styles.getPropertyValue('--env-green').trim() || '#15803d';
        const red = styles.getPropertyValue('--safety-red').trim() || '#DC2626';

        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('width', '100%');
        bgRect.setAttribute('height', '100%');
        bgRect.setAttribute('fill', bg);
        clone.insertBefore(bgRect, clone.firstChild);

        const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleEl.textContent = `
            text { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
            .chart-grid-line { stroke: ${border}; stroke-width: 1; stroke-dasharray: 3 3; }
            .chart-zero-line { stroke: ${textLight}; stroke-width: 1.5; }
            .chart-axis-label { fill: ${textLight}; font-size: 11px; font-weight: 600; }
            .chart-month-label { fill: ${textLight}; font-size: 12px; font-weight: 700; }
            .chart-month-label.is-active { fill: ${blue}; font-weight: 800; }
            .chart-path-prev { stroke: ${prev}; stroke-width: 2.5; stroke-dasharray: 6 5; stroke-linecap: round; stroke-linejoin: round; }
            .chart-path-current { stroke: ${midBlue}; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
            .chart-path-ongoing-dash { stroke: ${orange}; stroke-width: 2.5; stroke-dasharray: 4 4; stroke-linecap: round; }
            .chart-dot-prev { fill: ${bg}; stroke: ${prev}; stroke-width: 2.2; }
            .chart-dot-current { fill: ${midBlue}; stroke: ${bg}; stroke-width: 2.2; }
            .chart-dot-current.is-ongoing { fill: ${orange}; stroke: ${bg}; stroke-width: 2.5; }
            .chart-bar-pos { fill: ${green}; }
            .chart-bar-neg { fill: ${red}; }
            .chart-bar-ongoing { fill: ${orange}; opacity: 0.5; }
            .chart-bar-label { fill: ${textMain}; font-size: 10.5px; font-weight: 700; }
            .chart-hit-zone { fill: transparent; }
        `;
        clone.insertBefore(styleEl, bgRect.nextSibling);

        const xml = new XMLSerializer().serializeToString(clone);
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        declencherTelechargement(blob, `courbe-nucleaire-${slugPerimetre()}-${anneeAnalysee}-vs-${anneeReference}.svg`);
    }

    function rafraichirVueStatistiques() {
        if (!donneesGlobales) return;

        const infosTemp = obtenirInfosTemporelles(donneesGlobales, anneeAnalysee);
        const serieMensuelleN = extraireSeriesMensuelles(donneesGlobales, String(anneeAnalysee), centraleChoisie);
        const serieMensuelleRef = extraireSeriesMensuelles(donneesGlobales, String(anneeReference), centraleChoisie);

        mettreAJourKPIs(serieMensuelleN, serieMensuelleRef, infosTemp);
        dessinerGraphiqueSVG(serieMensuelleN, serieMensuelleRef, infosTemp);
        remplirTableauMensuel(serieMensuelleN, serieMensuelleRef, infosTemp);
    }

    function chargerStatistiques() {
        fetch(`data_nucleaire_france.json?t=${Date.now()}`)
            .then((response) => {
                if (!response.ok) throw new Error('Fichier JSON introuvable');
                return response.json();
            })
            .then((data) => {
                donneesGlobales = data;
                anneeEnCoursDonnees = data.annee_en_cours
                    || (data.horodatage_fin_recherche ? new Date(data.horodatage_fin_recherche).getFullYear() : new Date().getFullYear());

                if (!selecteursInitialises) {
                    anneeAnalysee = anneeEnCoursDonnees;
                    anneeReference = data.annee_precedente || (anneeEnCoursDonnees - 1);
                }

                afficherDateMaj(
                    document.getElementById('date-maj'),
                    data.derniere_mise_a_jour,
                    data.horodatage_fin_recherche
                );

                initialiserSelecteurs(data);
                rafraichirVueStatistiques();
            })
            .catch((err) => {
                console.error('Erreur de chargement des statistiques:', err);
                const majEl = document.getElementById('date-maj');
                if (majEl) {
                    majEl.textContent = 'Signal perdu avec le serveur';
                    majEl.classList.add('is-error');
                }
            });
    }

    chargerStatistiques();
    setInterval(chargerStatistiques, 14400000);
})();
