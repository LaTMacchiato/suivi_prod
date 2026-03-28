const formatNum = new Intl.NumberFormat('fr-FR').format;

// Fonction générique pour créer le HTML intérieur d'une carte centrale
function genererContenuCarte(nomCentrale, prodTwh, data, estPenly = false) {
    const unitesDeLaCentrale = Object.keys(data.cache_brut_mwh)
                                     .filter(nomReacteur => nomReacteur.startsWith(nomCentrale))
                                     .sort(); 

    let nbEnLigne = 0;
    let htmlUnites = ""; 

    unitesDeLaCentrale.forEach(nomReacteur => {
        const prodMwh = data.cache_brut_mwh[nomReacteur];
        const estEnLigne = data.cache_statut[nomReacteur];
        if (estEnLigne) nbEnLigne++;

        const classLigne = estPenly ? 'penly-unite-line' : 'unite-line';
        const classNom = estPenly ? 'penly-unite-nom' : 'unite-nom';
        const classProd = estPenly ? 'penly-unite-prod' : 'unite-prod';
        const classOn = estPenly ? 'status-on-penly' : 'status-on';
        const classOff = estPenly ? 'status-off-penly' : 'status-off';

        htmlUnites += `
            <div class="${classLigne}">
                <div class="unite-nom-grp">
                    <span class="status-dot ${estEnLigne ? classOn : classOff}"></span>
                    <span class="${classNom}">${nomReacteur}</span>
                </div>
                <span class="${classProd}">${formatNum(Math.round(prodMwh))} MWh</span>
            </div>
        `;
    });

    return { htmlUnites, nbUnites: unitesDeLaCentrale.length, nbEnLigne };
}

function chargerDonneesLive() {
    fetch('data_nucleaire_france.json?t=' + new Date().getTime())
        .then(response => {
            if (!response.ok) throw new Error("Fichier introuvable");
            return response.json();
        })
        .then(data => {
            // 1. Mise à jour des compteurs globaux
            document.getElementById('date-maj').innerText = "Actualisé le : " + data.derniere_mise_a_jour;
            document.getElementById('date-maj').style.color = "var(--text-main)";
            document.getElementById('total-france').innerHTML = formatNum(data.total_france_twh.toFixed(1)) + '<span class="kpi-unit">TWh</span>';
            document.getElementById('reacteurs-on').innerText = data.nombre_reacteurs_en_production;
            document.getElementById('reacteurs-total').innerText = data.nombre_reacteurs_total;

            const grid = document.getElementById('grid-centrales');
            const penlyContainer = document.getElementById('penly-container');
            grid.innerHTML = ""; 
            penlyContainer.innerHTML = "";

            // 2. Tri des centrales par production décroissante
            const listeCentrales = Object.entries(data.production_par_centrale_twh).sort((a, b) => b[1] - a[1]);

            // 3. Boucle sur toutes les centrales
            for (const [nomCentrale, prodTwh] of listeCentrales) {
                
                if (nomCentrale === "PENLY") {
                    const { htmlUnites, nbUnites, nbEnLigne } = genererContenuCarte(nomCentrale, prodTwh, data, true);
                    
                    const card = document.createElement('div');
                    card.className = 'penly-card';
                    card.innerHTML = `
                        <div class="penly-arrow">▼</div>
                        <div class="penly-header">
                            <div class="penly-nom-row">
                                <h4 class="penly-nom">${nomCentrale} <span class="penly-badge">Focus</span></h4>
                            </div>
                            <div class="penly-prod">${prodTwh.toFixed(3)} <span class="penly-prod-unite">TWh</span></div>
                            <div class="penly-stats-row">
                                <span>${nbUnites} unités</span>
                                <span style="color: ${nbEnLigne > 0 ? '#3fb950' : 'inherit'}">${nbEnLigne} en prod.</span>
                            </div>
                        </div>
                        <div class="penly-details">
                            ${htmlUnites}
                        </div>
                    `;
                    card.addEventListener('click', function(e) {
                        if (e.target.closest('.penly-unite-line')) return;
                        this.classList.toggle('active');
                    });
                    penlyContainer.appendChild(card);
                    continue;
                }

                const { htmlUnites, nbUnites, nbEnLigne } = genererContenuCarte(nomCentrale, prodTwh, data, false);
                if (nbUnites === 0) continue; 

                const card = document.createElement('div');
                card.className = 'centrale-card';
                card.innerHTML = `
                    <div class="icon-arrow">▼</div>
                    <div class="centrale-header">
                        <div class="centrale-nom-row">
                            <h4 class="centrale-nom">${nomCentrale}</h4>
                        </div>
                        <div class="centrale-prod">${prodTwh.toFixed(3)} <span class="centrale-prod-unite">TWh</span></div>
                        <div class="centrale-stats-row">
                            <span>${nbUnites} unités</span>
                            <span class="${nbEnLigne > 0 ? 'statut-marche' : ''}">${nbEnLigne} en prod.</span>
                        </div>
                    </div>
                    <div class="unites-details">
                        ${htmlUnites}
                    </div>
                `;
                card.addEventListener('click', function(e) {
                    if (e.target.closest('.unite-line')) return;
                    this.classList.toggle('active');
                });
                grid.appendChild(card);
            }
        })
        .catch(error => {
            console.error("Erreur de chargement:", error);
            document.getElementById('date-maj').innerText = "Signal perdu avec le serveur";
            document.getElementById('date-maj').style.color = "var(--safety-red)"; 
        });
}

// Lancement immédiat au chargement de la page
chargerDonneesLive();

// Actualisation toutes les 4 heures (14 400 000 ms) pour la version de production Github/Netlify
setInterval(chargerDonneesLive, 14400000);