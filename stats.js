const formatNumFr = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format;

const formatNum1 = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
}).format;

const MOIS_LONGS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const MOIS_COURTS = [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
    "Juil", "Août", "Sep", "Oct", "Nov", "Déc"
];

let donneesGlobales = null;
let anneeEnCoursDonnees = new Date().getFullYear();
let anneeAnalysee = anneeEnCoursDonnees;
let anneeReference = anneeEnCoursDonnees - 1;
let centraleChoisie = ""; // "" = France entière (Toutes les centrales)
let modeGraphique = "mensuel"; // "mensuel" | "cumule"
let moisSurvoleIdx = null;

function nombreJoursDansMois(annee, moisIndex0) {
    return new Date(annee, moisIndex0 + 1, 0).getDate();
}

function obtenirInfosTemporelles(data, annee) {
    const estAnneeEnCoursReelle = (Number(annee) === Number(anneeEnCoursDonnees));
    const horodatage = data.horodatage_fin_recherche;

    if (!estAnneeEnCoursReelle) {
        // Année passée archivée : 12 mois complets révolus
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
        return serie.slice(0, 12).map(v => Number(v.toFixed(3)));
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
        return { textePct: "N/A", texteDiff: "--", classe: "evol-neutral" };
    }
    const diff = valN - valRef;
    const pct = (diff / valRef) * 100;
    const signe = diff >= 0 ? "+" : "";
    const classe = diff > 0.001 ? "evol-up" : (diff < -0.001 ? "evol-down" : "evol-neutral");
    return {
        textePct: `${signe}${formatNum1(pct)} %`,
        texteDiff: `${signe}${formatNumFr(diff)} TWh`,
        classe
    };
}

function libellePerimetre() {
    if (!centraleChoisie) {
        return "France entière (Toutes les centrales)";
    }
    return `Centrale : ${centraleChoisie}`;
}

function initialiserSelecteurs(data) {
    const selectCentrale = document.getElementById("select-centrale");
    const selectAnneeAnalysee = document.getElementById("select-annee-analysee");
    const selectAnneeRef = document.getElementById("select-annee-ref");
    const btnReset = document.getElementById("btn-reset-global");

    if (!selectCentrale || !selectAnneeAnalysee || !selectAnneeRef) return;

    // 1. Liste des centrales disponibles
    const histCours = (data.historique_annuel && data.historique_annuel[String(anneeAnalysee)]) || {};
    const centralesMap = data.production_par_centrale_twh || histCours.production_par_centrale_twh || {};
    const nomsCentrales = Object.keys(centralesMap).sort((a, b) => a.localeCompare(b, "fr"));

    selectCentrale.innerHTML = '<option value="">⚡ France entière (Toutes les centrales)</option>';
    nomsCentrales.forEach(nom => {
        const opt = document.createElement("option");
        opt.value = nom;
        opt.textContent = `Centrale de ${nom}`;
        selectCentrale.appendChild(opt);
    });

    selectCentrale.value = centraleChoisie;
    selectCentrale.addEventListener("change", (e) => {
        centraleChoisie = e.target.value;
        mettreAJourAffichagePerimetre();
        rafraichirVueStatistiques();
    });

    // 2. Années disponibles
    const anneesDispos = (data.annees_disponibles || Object.keys(data.historique_annuel || {}))
        .map(Number)
        .sort((a, b) => b - a);

    if (!anneesDispos.includes(Number(anneeAnalysee))) {
        anneeAnalysee = anneesDispos[0] || new Date().getFullYear();
    }

    function rafraichirOptionsAnnees() {
        selectAnneeAnalysee.innerHTML = "";
        anneesDispos.forEach(an => {
            const opt = document.createElement("option");
            opt.value = an;
            opt.textContent = `${an}${Number(an) === Number(anneeEnCoursDonnees) ? " (en cours)" : ""}`;
            if (Number(an) === Number(anneeAnalysee)) opt.selected = true;
            selectAnneeAnalysee.appendChild(opt);
        });

        selectAnneeRef.innerHTML = "";
        const anneesComparables = anneesDispos.filter(an => Number(an) !== Number(anneeAnalysee));

        if (!anneesComparables.includes(Number(anneeReference))) {
            anneeReference = anneesComparables[0] || (Number(anneeAnalysee) - 1);
        }

        anneesComparables.forEach(an => {
            const opt = document.createElement("option");
            opt.value = an;
            opt.textContent = `${an}`;
            if (Number(an) === Number(anneeReference)) opt.selected = true;
            selectAnneeRef.appendChild(opt);
        });
    }

    rafraichirOptionsAnnees();

    selectAnneeAnalysee.addEventListener("change", (e) => {
        anneeAnalysee = Number(e.target.value);
        rafraichirOptionsAnnees();
        mettreAJourAffichageTitres();
        rafraichirVueStatistiques();
    });

    selectAnneeRef.addEventListener("change", (e) => {
        anneeReference = Number(e.target.value);
        mettreAJourAffichageTitres();
        rafraichirVueStatistiques();
    });

    if (btnReset) {
        btnReset.onclick = () => {
            centraleChoisie = "";
            selectCentrale.value = "";
            mettreAJourAffichagePerimetre();
            rafraichirVueStatistiques();
        };
    }

    mettreAJourAffichagePerimetre();
    mettreAJourAffichageTitres();
}

function mettreAJourAffichagePerimetre() {
    const btnReset = document.getElementById("btn-reset-global");
    const badge = document.getElementById("perimetre-badge");
    const tableLabel = document.getElementById("table-perimetre-label");
    const texte = libellePerimetre();

    if (badge) badge.textContent = texte;
    if (tableLabel) tableLabel.textContent = texte;
    if (btnReset) {
        btnReset.classList.toggle("is-active", !centraleChoisie);
    }
}

function mettreAJourAffichageTitres() {
    const titre = `Statistiques ${anneeAnalysee} vs ${anneeReference}`;
    document.title = `${titre} — Production nucléaire française`;

    const h2El = document.getElementById("stats-titre-annee");
    if (h2El) h2El.textContent = titre;

    const legN = document.getElementById("legend-label-n");
    if (legN) legN.textContent = `Année ${anneeAnalysee}`;

    const legRef = document.getElementById("legend-label-n1");
    if (legRef) legRef.textContent = `Année ${anneeReference}`;

    const thN = document.getElementById("th-annee-n");
    if (thN) thN.textContent = `${anneeAnalysee} (TWh)`;

    const thRef = document.getElementById("th-annee-n1");
    if (thRef) thRef.textContent = `${anneeReference} (TWh)`;
}

function mettreAJourKPIs(serieN, serieRef, infosTemp) {
    const { moisActifIdx, dernierMoisRevoluIdx, estAnneeComplete, joursDansMoisEnCours } = infosTemp;
    const aMoisRevolu = (dernierMoisRevoluIdx >= 0);
    const limiteComparaison = aMoisRevolu ? dernierMoisRevoluIdx : moisActifIdx;

    // Cumul Année analysée sur les mois révolus (ou en cours si début d'année)
    let cumulNRevolu = 0;
    for (let m = 0; m <= limiteComparaison; m++) {
        cumulNRevolu += (serieN[m] || 0);
    }

    // Cumul Année de référence strictement sur la même période de mois révolus
    let cumulRefComparable = 0;
    for (let m = 0; m <= limiteComparaison; m++) {
        cumulRefComparable += (serieRef[m] || 0);
    }

    const total12MoisRef = serieRef.reduce((acc, v) => acc + (v || 0), 0);
    const evol = formaterEvolution(cumulNRevolu, cumulRefComparable);

    // Titres dynamiques selon si l'année est terminée ou en cours
    const labelPeriode = estAnneeComplete
        ? "12 mois complets"
        : (aMoisRevolu ? `Janv. – ${MOIS_COURTS[dernierMoisRevoluIdx]}` : `Janvier en cours`);

    document.getElementById("kpi-title-cumul-n").textContent = `Cumul ${anneeAnalysee} (${labelPeriode})`;
    document.getElementById("kpi-val-cumul-n").innerHTML = `${formatNumFr(cumulNRevolu)}<span class="kpi-unit">TWh</span>`;

    const evolPctEl = document.getElementById("kpi-evol-pct");
    evolPctEl.textContent = evol.textePct;
    evolPctEl.className = `evol-pill ${evol.classe}`;
    document.getElementById("kpi-evol-diff").textContent = `${evol.texteDiff} vs ${anneeReference} (même période)`;

    // Information discrète sur le mois partiel en cours s'il y en a un
    const extraOngoingEl = document.getElementById("kpi-extra-ongoing");
    if (extraOngoingEl) {
        if (!estAnneeComplete && moisActifIdx > dernierMoisRevoluIdx) {
            const valMoisEnCours = serieN[moisActifIdx] || 0;
            extraOngoingEl.innerHTML = `+ ${formatNumFr(valMoisEnCours)} TWh en cours en ${MOIS_LONGS[moisActifIdx]} (${joursDansMoisEnCours} j)`;
        } else {
            extraOngoingEl.textContent = "";
        }
    }

    document.getElementById("kpi-title-ref-n1").textContent = `Référence ${anneeReference} (${labelPeriode})`;
    document.getElementById("kpi-val-comparable-n1").innerHTML = `${formatNumFr(cumulRefComparable)}<span class="kpi-unit">TWh</span>`;
    document.getElementById("kpi-val-total-n1").textContent = `Total annuel complet ${anneeReference} (12 mois) : ${formatNumFr(total12MoisRef)} TWh`;

    const pctTotalRef = total12MoisRef > 0 ? Math.min(100, (cumulNRevolu / total12MoisRef) * 100) : 0;
    const progressBar = document.getElementById("kpi-progress-bar");
    if (progressBar) {
        progressBar.style.width = `${pctTotalRef.toFixed(1)}%`;
    }

    // Moyenne mensuelle basée sur les mois révolus
    const nbMoisComplets = estAnneeComplete ? 12 : Math.max(1, dernierMoisRevoluIdx + 1);
    const moyenneMensuelleN = cumulNRevolu / nbMoisComplets;

    let maxVal = -1;
    let maxMoisIdx = 0;
    for (let m = 0; m <= limiteComparaison; m++) {
        if ((serieN[m] || 0) > maxVal) {
            maxVal = serieN[m] || 0;
            maxMoisIdx = m;
        }
    }

    document.getElementById("kpi-title-moyenne").textContent = `Moyenne mensuelle ${anneeAnalysee}`;
    document.getElementById("kpi-val-moyenne-n").innerHTML = `${formatNumFr(moyenneMensuelleN)}<span class="kpi-unit">TWh / mois</span>`;
    document.getElementById("kpi-sub-record").textContent =
        `Pic ${anneeAnalysee} : ${MOIS_LONGS[maxMoisIdx]} (${formatNumFr(maxVal)} TWh)`;
}

function mettreAJourBandeauSurvol(moisIdx, serieAfficheeN, serieAfficheeRef, infosTemp) {
    const banner = document.getElementById("chart-hover-banner");
    if (!banner) return;

    if (moisIdx === null || moisIdx < 0 || moisIdx > 11) {
        banner.innerHTML = `Survolez ou sélectionnez un mois sur la courbe pour comparer <strong>${anneeAnalysee}</strong> et <strong>${anneeReference}</strong>.`;
        return;
    }

    const nomMois = MOIS_LONGS[moisIdx];
    const valRef = serieAfficheeRef[moisIdx];
    const valN = serieAfficheeN[moisIdx];
    const typeLabel = modeGraphique === "cumule" ? "Cumul à fin" : "Production";

    // Cas 1 : Mois à venir
    if (moisIdx > infosTemp.moisActifIdx || valN === null) {
        banner.innerHTML = `
            <strong>${nomMois}</strong> (${typeLabel}) —
            <span class="banner-n1">${anneeReference} : <strong>${formatNumFr(valRef)} TWh</strong></span> ·
            <span class="banner-future">${anneeAnalysee} : <em>Mois à venir</em></span>
        `;
        return;
    }

    // Cas 2 : Mois en cours (incomplet / non clos) -> On n'affiche PAS un pourcentage négatif trompeur
    const estMoisEnCoursPartiel = (!infosTemp.estAnneeComplete && moisIdx === infosTemp.moisActifIdx);
    if (estMoisEnCoursPartiel) {
        banner.innerHTML = `
            <strong>${nomMois}</strong> (${typeLabel}) —
            <span class="banner-n">${anneeAnalysee} : <strong>${formatNumFr(valN)} TWh</strong> (partiel, ${infosTemp.joursDansMoisEnCours} jours)</span> ·
            <span class="banner-n1">${anneeReference} (mois complet) : <strong>${formatNumFr(valRef)} TWh</strong></span>
            <span class="evol-pill evol-neutral">Mois en cours de consolidation</span>
        `;
        return;
    }

    // Cas 3 : Mois révolu complet -> Calcul de l'évolution réelle
    const evol = formaterEvolution(valN, valRef);
    banner.innerHTML = `
        <strong>${nomMois}</strong> (${typeLabel}) —
        <span class="banner-n">${anneeAnalysee} : <strong>${formatNumFr(valN)} TWh</strong></span> vs
        <span class="banner-n1">${anneeReference} : <strong>${formatNumFr(valRef)} TWh</strong></span>
        <span class="evol-pill ${evol.classe}">${evol.textePct} (${evol.texteDiff})</span>
    `;
}

function dessinerGraphiqueSVG(serieMensuelleN, serieMensuelleRef, infosTemp) {
    const wrapper = document.getElementById("chart-svg-wrapper");
    if (!wrapper) return;

    const { moisActifIdx, dernierMoisRevoluIdx, estAnneeComplete } = infosTemp;

    // En cumulé : on trace le cumul jusqu'au mois actif (avec distinction du mois partiel)
    const serieN = modeGraphique === "cumule"
        ? calculerSerieCumulee(serieMensuelleN, moisActifIdx)
        : serieMensuelleN.map((v, i) => (i <= moisActifIdx ? v : null));

    const serieRef = modeGraphique === "cumule"
        ? calculerSerieCumulee(serieMensuelleRef, 11)
        : serieMensuelleRef.slice(0, 12);

    const toutesValeurs = [
        ...serieN.filter(v => v !== null),
        ...serieRef.filter(v => v !== null)
    ];
    const maxBrut = Math.max(...toutesValeurs, 1);
    const maxY = Math.ceil(maxBrut * 1.12 * 10) / 10;

    const width = 920;
    const height = 340;
    const padLeft = 64;
    const padRight = 28;
    const padTop = 26;
    const padBottom = 46;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const xCoord = (m) => padLeft + (m / 11) * plotW;
    const yCoord = (val) => padTop + plotH - (Math.max(0, val) / maxY) * plotH;

    let gridLinesHtml = "";
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

    // Courbe de référence (12 mois)
    const pointsRef = serieRef.map((v, m) => `${xCoord(m).toFixed(1)},${yCoord(v).toFixed(1)}`);
    const pathRef = `M ${pointsRef.join(" L ")}`;

    // Courbe de l'année analysée :
    // 1. Portion révolue (solide)
    const limiteSolide = estAnneeComplete ? 11 : dernierMoisRevoluIdx;
    const coordsSolides = [];
    for (let m = 0; m <= limiteSolide; m++) {
        if (serieN[m] !== null && m >= 0) {
            coordsSolides.push({ m, x: xCoord(m), y: yCoord(serieN[m]), v: serieN[m] });
        }
    }

    let pathNSolide = "";
    let areaNSolide = "";
    if (coordsSolides.length > 0) {
        const pts = coordsSolides.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        pathNSolide = `M ${pts.join(" L ")}`;
        const firstX = coordsSolides[0].x.toFixed(1);
        const lastX = coordsSolides[coordsSolides.length - 1].x.toFixed(1);
        const baseLineY = (padTop + plotH).toFixed(1);
        areaNSolide = `M ${firstX},${baseLineY} L ${pts.join(" L ")} L ${lastX},${baseLineY} Z`;
    }

    // 2. Portion en cours (rejoignant le mois actif en pointillé si mois en cours partiel)
    let pathNEnCours = "";
    if (!estAnneeComplete && moisActifIdx > dernierMoisRevoluIdx && coordsSolides.length > 0) {
        const dernierSolide = coordsSolides[coordsSolides.length - 1];
        const ptActif = `${xCoord(moisActifIdx).toFixed(1)},${yCoord(serieN[moisActifIdx]).toFixed(1)}`;
        pathNEnCours = `M ${dernierSolide.x.toFixed(1)},${dernierSolide.y.toFixed(1)} L ${ptActif}`;
    }

    let pointsHtml = "";
    let hitZonesHtml = "";
    const stepW = plotW / 11;

    for (let m = 0; m < 12; m++) {
        const cx = xCoord(m);
        const cyRef = yCoord(serieRef[m]);
        const estActifHover = (moisSurvoleIdx === m);

        if (estActifHover) {
            pointsHtml += `<line x1="${cx.toFixed(1)}" y1="${padTop}" x2="${cx.toFixed(1)}" y2="${padTop + plotH}" class="chart-hover-guide" />`;
        }

        // Point de référence
        pointsHtml += `
            <circle cx="${cx.toFixed(1)}" cy="${cyRef.toFixed(1)}" r="${estActifHover ? 6 : 4}" class="chart-dot-prev" />
        `;

        // Point année analysée
        if (m <= moisActifIdx && serieN[m] !== null) {
            const cyN = yCoord(serieN[m]);
            const estMoisCourant = (!estAnneeComplete && m === moisActifIdx);
            const classePoint = estMoisCourant ? "chart-dot-current is-ongoing" : "chart-dot-current";
            pointsHtml += `
                <circle cx="${cx.toFixed(1)}" cy="${cyN.toFixed(1)}" r="${estActifHover ? 7 : 5}" class="${classePoint}" />
            `;
        }

        pointsHtml += `
            <text x="${cx.toFixed(1)}" y="${height - 14}" text-anchor="middle" class="chart-month-label ${estActifHover ? 'is-active' : ''}">${MOIS_COURTS[m]}</text>
        `;

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
                aria-label="${MOIS_LONGS[m]} : ${serieN[m] !== null ? formatNumFr(serieN[m]) + ' TWh en ' + anneeAnalysee : 'Mois à venir'} contre ${formatNumFr(serieRef[m])} TWh en ${anneeReference}"
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
            ${areaNSolide ? `<path d="${areaNSolide}" fill="url(#edfAreaGrad)" />` : ""}
            <path d="${pathRef}" class="chart-path-prev" fill="none" />
            ${pathNSolide ? `<path d="${pathNSolide}" class="chart-path-current" fill="none" />` : ""}
            ${pathNEnCours ? `<path d="${pathNEnCours}" class="chart-path-ongoing-dash" fill="none" />` : ""}
            ${pointsHtml}
            ${hitZonesHtml}
        </svg>
    `;

    wrapper.querySelectorAll(".chart-hit-zone").forEach(zone => {
        const m = Number(zone.getAttribute("data-month"));
        const activerMois = () => {
            moisSurvoleIdx = m;
            mettreAJourBandeauSurvol(m, serieN, serieRef, infosTemp);
        };
        zone.addEventListener("mouseenter", activerMois);
        zone.addEventListener("focus", activerMois);
        zone.addEventListener("click", activerMois);
    });

    // Par défaut : on se cale sur le dernier mois RÉVOLU pour ne pas afficher un mois partiel négatif
    const moisCibleDefaut = (estAnneeComplete || dernierMoisRevoluIdx < 0)
        ? moisActifIdx
        : dernierMoisRevoluIdx;

    wrapper.querySelector("svg")?.addEventListener("mouseleave", () => {
        moisSurvoleIdx = null;
        mettreAJourBandeauSurvol(moisCibleDefaut, serieN, serieRef, infosTemp);
    });

    const moisAffiche = moisSurvoleIdx !== null ? moisSurvoleIdx : moisCibleDefaut;
    mettreAJourBandeauSurvol(moisAffiche, serieN, serieRef, infosTemp);
}

function remplirTableauMensuel(serieN, serieRef, infosTemp) {
    const tbody = document.getElementById("stats-table-body");
    const tfoot = document.getElementById("stats-table-foot");
    if (!tbody || !tfoot) return;

    const { moisActifIdx, dernierMoisRevoluIdx, estAnneeComplete, joursDansMoisEnCours } = infosTemp;
    let htmlLignes = "";
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
                <tr class="row-future">
                    <td><span class="month-name">${MOIS_LONGS[m]}</span></td>
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
                <tr class="row-ongoing">
                    <td><span class="month-name">${MOIS_LONGS[m]}</span> <span class="badge-ongoing">En cours (${joursDansMoisEnCours} j)</span></td>
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
                <tr>
                    <td><span class="month-name">${MOIS_LONGS[m]}</span></td>
                    <td class="num-col">${formatNumFr(valRef)}</td>
                    <td class="num-col font-strong">${formatNumFr(valN)}</td>
                    <td class="num-col ${evol.classe}-text">${evol.texteDiff}</td>
                    <td class="num-col"><span class="evol-pill ${evol.classe}">${evol.textePct}</span></td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = htmlLignes;

    // Pied de tableau : cumul sur les mois révolus
    const labelCumulRevolu = estAnneeComplete
        ? `Total annuel complet (12 mois)`
        : (dernierMoisRevoluIdx >= 0 ? `Total cumulé (Mois révolus : Janv. – ${MOIS_COURTS[dernierMoisRevoluIdx]})` : `Janvier en cours`);

    const evolTotal = formaterEvolution(totalNRevolu, totalRefComparable);
    let htmlFoot = `
        <tr class="tfoot-row">
            <td>${labelCumulRevolu}</td>
            <td class="num-col">${formatNumFr(totalRefComparable)}</td>
            <td class="num-col font-strong">${formatNumFr(totalNRevolu)}</td>
            <td class="num-col ${evolTotal.classe}-text">${evolTotal.texteDiff}</td>
            <td class="num-col"><span class="evol-pill ${evolTotal.classe}">${evolTotal.textePct}</span></td>
        </tr>
    `;

    if (!estAnneeComplete && moisActifIdx > dernierMoisRevoluIdx) {
        htmlFoot += `
            <tr class="tfoot-row-secondary">
                <td>Total provisoire ${anneeAnalysee} (avec mois en cours)</td>
                <td class="num-col font-mono">${formatNumFr(totalNTotal)} TWh</td>
                <td class="num-col" colspan="3">Référence 12 mois complet ${anneeReference} : ${formatNumFr(totalRefComplet)} TWh</td>
            </tr>
        `;
    } else {
        htmlFoot += `
            <tr class="tfoot-row-secondary">
                <td>Total annuel complet ${anneeReference} (12 mois)</td>
                <td class="num-col">${formatNumFr(totalRefComplet)}</td>
                <td class="num-col" colspan="3">Référence annuelle complète ${anneeReference}</td>
            </tr>
        `;
    }

    tfoot.innerHTML = htmlFoot;
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
    fetch("data_nucleaire_france.json?t=" + new Date().getTime())
        .then(response => {
            if (!response.ok) throw new Error("Fichier JSON introuvable");
            return response.json();
        })
        .then(data => {
            donneesGlobales = data;
            anneeEnCoursDonnees = data.annee_en_cours
                || (data.horodatage_fin_recherche ? new Date(data.horodatage_fin_recherche).getFullYear() : new Date().getFullYear());
            anneeAnalysee = anneeEnCoursDonnees;
            anneeReference = data.annee_precedente || (anneeEnCoursDonnees - 1);

            document.getElementById("date-maj").textContent = "Actualisé le : " + data.derniere_mise_a_jour;

            initialiserSelecteurs(data);
            rafraichirVueStatistiques();
        })
        .catch(err => {
            console.error("Erreur de chargement des statistiques:", err);
            const majEl = document.getElementById("date-maj");
            if (majEl) {
                majEl.textContent = "Signal perdu avec le serveur";
                majEl.style.color = "var(--safety-red)";
            }
        });
}

// Commutateur Mensuel / Cumulé
document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        modeGraphique = btn.getAttribute("data-mode") || "mensuel";
        rafraichirVueStatistiques();
    });
});

// Modale Mentions légales & Confidentialité (100 % locale)
(function initialiserModaleLegale() {
    const legalDialog = document.getElementById("legal-modal");
    const openBtn = document.getElementById("open-legal-modal");
    if (!legalDialog || !openBtn) return;

    if (!("commandForElement" in HTMLButtonElement.prototype)) {
        openBtn.addEventListener("click", () => {
            legalDialog.showModal();
        });
    }

    if (!("closedBy" in HTMLDialogElement.prototype)) {
        legalDialog.addEventListener("click", (event) => {
            if (event.target !== legalDialog) return;
            const rect = legalDialog.getBoundingClientRect();
            const isDialogContent = (
                rect.top <= event.clientY &&
                event.clientY <= rect.top + rect.height &&
                rect.left <= event.clientX &&
                event.clientX <= rect.left + rect.width
            );
            if (isDialogContent) return;
            legalDialog.close();
        });
    }
})();

chargerStatistiques();
setInterval(chargerStatistiques, 14400000);
