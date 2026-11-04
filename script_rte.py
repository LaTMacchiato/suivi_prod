import requests
import base64
import json
import os
from datetime import datetime, timedelta
import time

CLIENT_ID = os.environ.get("RTE_CLIENT_ID")
CLIENT_SECRET = os.environ.get("RTE_CLIENT_SECRET")
CHEMIN_FICHIER = 'data_nucleaire_france.json'
URL_API_RTE = "https://digital.iservices.rte-france.com/open_api/actual_generation/v1/actual_generations_per_unit"


def obtenir_token(client_id, client_secret):
    if not client_id or not client_secret:
        raise ValueError("Les identifiants RTE_CLIENT_ID ou RTE_CLIENT_SECRET sont introuvables dans l'environnement.")

    credentials = f"{client_id}:{client_secret}"
    b64_credentials = base64.b64encode(credentials.encode()).decode()

    url = "https://digital.iservices.rte-france.com/token/oauth/"
    headers = {
        "Authorization": f"Basic {b64_credentials}",
        "Content-Type": "application/x-www-form-urlencoded"
    }

    response = requests.post(url, headers=headers)
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        raise Exception(f"Erreur d'authentification RTE: {response.text}")


def construire_tranches(date_debut, date_fin):
    tranches = []
    courant = date_debut
    while courant < date_fin:
        prochain = min(courant + timedelta(days=6), date_fin)
        api_debut = courant
        api_fin = prochain

        if (api_fin - api_debut).total_seconds() < 259200:
            api_debut = api_fin - timedelta(days=3)

        tranches.append({"api_debut": api_debut, "api_fin": api_fin, "vrai_debut": courant})
        courant = prochain
    return tranches


def interroger_periode_rte(
    headers,
    date_debut,
    date_fin,
    annee_cible,
    cache_brut_mensuel_mwh,
    statut_actuel_reacteurs=None,
    inclure_borne_debut=False
):
    tranches = construire_tranches(date_debut, date_fin)
    derniere_donnee_recue = date_debut

    for idx, tranche in enumerate(tranches):
        str_debut = tranche["api_debut"].strftime("%Y-%m-%dT%H:%M:%S+01:00")
        str_fin = tranche["api_fin"].strftime("%Y-%m-%dT%H:%M:%S+01:00")

        params = {"start_date": str_debut, "end_date": str_fin}
        response = requests.get(URL_API_RTE, headers=headers, params=params)

        if response.status_code != 200:
            print(f"   [!] Erreur API ({str_debut} -> {str_fin}): {response.text}")
            continue

        data = response.json()
        vrai_debut_ts = tranche["vrai_debut"].timestamp()
        api_fin_ts = tranche["api_fin"].timestamp()
        autoriser_egalite_debut = inclure_borne_debut and (idx == 0)

        for unite in data.get("actual_generations_per_unit", []):
            infos_unite = unite.get("unit", {})
            if infos_unite.get("production_type") == "NUCLEAR":
                nom_reacteur = infos_unite.get("name", "Inconnu")
                if nom_reacteur not in cache_brut_mensuel_mwh:
                    cache_brut_mensuel_mwh[nom_reacteur] = [0.0] * 12

                for releve in unite.get("values", []):
                    releve_dt = datetime.fromisoformat(releve["start_date"]).replace(tzinfo=None)
                    valeur_mw = releve.get("value", 0)

                    if releve_dt.year != annee_cible:
                        continue

                    releve_ts = releve_dt.timestamp()
                    if releve_ts > api_fin_ts:
                        continue

                    condition_debut = (
                        (releve_ts >= vrai_debut_ts)
                        if autoriser_egalite_debut
                        else (releve_ts > date_debut.timestamp() and releve_ts > vrai_debut_ts)
                    )

                    if condition_debut:
                        if releve_dt > derniere_donnee_recue:
                            derniere_donnee_recue = releve_dt
                        if valeur_mw > 0:
                            mois_idx = releve_dt.month - 1
                            cache_brut_mensuel_mwh[nom_reacteur][mois_idx] += valeur_mw

                    if statut_actuel_reacteurs is not None and releve_dt >= derniere_donnee_recue:
                        statut_actuel_reacteurs[nom_reacteur] = (valeur_mw > 0)

        time.sleep(0.5)

    return derniere_donnee_recue


def construire_resume_annuel(
    cache_brut_mensuel_mwh,
    dernier_horodatage,
    complet=False,
    backfill_q1_complet=True
):
    production_par_reacteur = {}
    mensuel_par_centrale_mwh = {}
    mensuel_france_mwh = [0.0] * 12

    for nom_reacteur, mois_vals in cache_brut_mensuel_mwh.items():
        vals = [round(float(v), 2) for v in (mois_vals + [0.0] * 12)[:12]]
        cache_brut_mensuel_mwh[nom_reacteur] = vals
        total_r = round(sum(vals), 2)
        production_par_reacteur[nom_reacteur] = total_r

        nom_centrale = nom_reacteur.rsplit(' ', 1)[0]
        if nom_centrale not in mensuel_par_centrale_mwh:
            mensuel_par_centrale_mwh[nom_centrale] = [0.0] * 12

        for m in range(12):
            mensuel_par_centrale_mwh[nom_centrale][m] += vals[m]
            mensuel_france_mwh[m] += vals[m]

    mensuel_par_centrale_twh = {
        centrale: [round(v / 1_000_000, 3) for v in sorted_vals]
        for centrale, sorted_vals in sorted(mensuel_par_centrale_mwh.items())
    }
    production_par_centrale_twh = {
        centrale: round(sum(vals) / 1_000_000, 3)
        for centrale, vals in mensuel_par_centrale_mwh.items()
    }
    production_par_centrale_twh = dict(
        sorted(production_par_centrale_twh.items(), key=lambda item: item[1], reverse=True)
    )
    total_france_mwh = sum(production_par_reacteur.values())

    return {
        "complet": complet,
        "backfill_q1_complet": backfill_q1_complet,
        "dernier_horodatage": dernier_horodatage,
        "total_france_twh": round(total_france_mwh / 1_000_000, 3),
        "mensuel_france_twh": [round(v / 1_000_000, 3) for v in mensuel_france_mwh],
        "production_par_centrale_twh": production_par_centrale_twh,
        "mensuel_par_centrale_twh": mensuel_par_centrale_twh,
        "cache_brut_mwh": production_par_reacteur,
        "cache_brut_mensuel_mwh": cache_brut_mensuel_mwh
    }


def extraire_donnees_live():
    maintenant = datetime.now().replace(minute=0, second=0, microsecond=0)
    annee_en_cours = maintenant.year
    annee_precedente = annee_en_cours - 1
    str_annee_cours = str(annee_en_cours)
    str_annee_prec = str(annee_precedente)

    anciennes_donnees = {}
    historique_annuel = {}
    statut_actuel_reacteurs = {}

    if os.path.exists(CHEMIN_FICHIER):
        try:
            with open(CHEMIN_FICHIER, 'r', encoding='utf-8') as f:
                anciennes_donnees = json.load(f)
            historique_annuel = anciennes_donnees.get("historique_annuel", {})
            statut_actuel_reacteurs = anciennes_donnees.get("cache_statut", {})
        except Exception as e:
            print(f"⚠️ Impossible de lire le cache. Erreur: {e}")

    marque_page_str = anciennes_donnees.get("horodatage_fin_recherche")
    date_debut = datetime.fromisoformat(marque_page_str) if marque_page_str else datetime(annee_en_cours, 1, 1)

    besoin_backfill_prec = (
        str_annee_prec not in historique_annuel
        or not historique_annuel[str_annee_prec].get("complet", False)
    )
    besoin_backfill_q1_cours = (
        str_annee_cours in historique_annuel
        and not historique_annuel[str_annee_cours].get("backfill_q1_complet", True)
    )
    changement_annee = (date_debut.year < annee_en_cours)

    if date_debut >= maintenant and not besoin_backfill_prec and not besoin_backfill_q1_cours and not changement_annee:
        print("⏳ Les données sont déjà à jour.")
        return

    print("Obtention du token d'accès RTE...")
    token = obtenir_token(CLIENT_ID, CLIENT_SECRET)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. GESTION DU PASSAGE D'UNE ANNÉE À LA SUIVANTE (ex: 31/12/2026 -> 01/01/2027)
    if date_debut.year == annee_precedente and str_annee_prec in historique_annuel:
        fin_annee_prec = datetime(annee_en_cours, 1, 1)
        print(f"🔄 Clôture automatique de l'année {annee_precedente} ({date_debut} -> {fin_annee_prec})...")
        cache_mensuel_prec = historique_annuel[str_annee_prec].get("cache_brut_mensuel_mwh", {})
        dernier_dt_prec = interroger_periode_rte(
            headers,
            date_debut,
            fin_annee_prec,
            annee_precedente,
            cache_mensuel_prec,
            statut_actuel_reacteurs=statut_actuel_reacteurs,
            inclure_borne_debut=False
        )
        historique_annuel[str_annee_prec] = construire_resume_annuel(
            cache_mensuel_prec,
            dernier_dt_prec.isoformat(),
            complet=True,
            backfill_q1_complet=True
        )
        date_debut = datetime(annee_en_cours, 1, 1)

    # 2. BACKFILL COMPLET DE L'ANNÉE PRÉCÉDENTE SI ELLE N'EST PAS ENCORE COMPLÈTE (ex: 2025)
    if str_annee_prec not in historique_annuel or not historique_annuel[str_annee_prec].get("complet", False):
        print(f"📊 Récupération de l'historique complet de l'année précédente ({annee_precedente})...")
        cache_mensuel_prec = {r: [0.0] * 12 for r in statut_actuel_reacteurs.keys()}
        debut_prec = datetime(annee_precedente, 1, 1)
        fin_prec = datetime(annee_en_cours, 1, 1)
        dernier_dt_prec = interroger_periode_rte(
            headers,
            debut_prec,
            fin_prec,
            annee_precedente,
            cache_mensuel_prec,
            statut_actuel_reacteurs=None,
            inclure_borne_debut=True
        )
        historique_annuel[str_annee_prec] = construire_resume_annuel(
            cache_mensuel_prec,
            dernier_dt_prec.isoformat(),
            complet=True,
            backfill_q1_complet=True
        )
        print(f"✅ Historique {annee_precedente} consolidé : {historique_annuel[str_annee_prec]['total_france_twh']} TWh")

    # 3. PRÉPARATION DE L'ANNÉE EN COURS (ex: 2026 ou 2027)
    if str_annee_cours not in historique_annuel or date_debut.year != annee_en_cours:
        date_debut = datetime(annee_en_cours, 1, 1)
        cache_mensuel_cours = {r: [0.0] * 12 for r in statut_actuel_reacteurs.keys()}
        inclure_debut_cours = True
        backfill_q1_ok = True
    else:
        cache_mensuel_cours = historique_annuel[str_annee_cours].get("cache_brut_mensuel_mwh", {})
        inclure_debut_cours = False
        backfill_q1_ok = historique_annuel[str_annee_cours].get("backfill_q1_complet", True)

    # 3b. CONSOLIDATION EXACTE DU T1 DE L'ANNÉE EN COURS SI NÉCESSAIRE
    if not backfill_q1_ok:
        print(f"🔎 Consolidation exacte Janvier-Mars {annee_en_cours} depuis l'API RTE...")
        cache_q1 = {r: [0.0] * 12 for r in cache_mensuel_cours.keys()}
        interroger_periode_rte(
            headers,
            datetime(annee_en_cours, 1, 1),
            datetime(annee_en_cours, 4, 1),
            annee_en_cours,
            cache_q1,
            statut_actuel_reacteurs=None,
            inclure_borne_debut=True
        )
        for nom_r, vals_q1 in cache_q1.items():
            if nom_r not in cache_mensuel_cours:
                cache_mensuel_cours[nom_r] = [0.0] * 12
            cache_mensuel_cours[nom_r][0] = vals_q1[0]
            cache_mensuel_cours[nom_r][1] = vals_q1[1]
            cache_mensuel_cours[nom_r][2] = vals_q1[2]
        backfill_q1_ok = True

    # 4. MISE À JOUR INCRÉMENTALE DE L'ANNÉE EN COURS
    derniere_donnee_recue = date_debut
    if date_debut < maintenant:
        print(f"⚡ Extraction incrémentale {annee_en_cours} ({date_debut} -> {maintenant})...")
        derniere_donnee_recue = interroger_periode_rte(
            headers,
            date_debut,
            maintenant,
            annee_en_cours,
            cache_mensuel_cours,
            statut_actuel_reacteurs=statut_actuel_reacteurs,
            inclure_borne_debut=inclure_debut_cours
        )

    resume_cours = construire_resume_annuel(
        cache_mensuel_cours,
        derniere_donnee_recue.isoformat(),
        complet=False,
        backfill_q1_complet=backfill_q1_ok
    )
    historique_annuel[str_annee_cours] = resume_cours

    # On conserve l'historique complet des années disponibles (jusqu'à 5 ans)
    historique_trie = dict(sorted(historique_annuel.items()))

    nb_en_production = sum(1 for en_marche in statut_actuel_reacteurs.values() if en_marche)

    data_export = {
        "annee_en_cours": annee_en_cours,
        "annee_precedente": annee_precedente,
        "annees_disponibles": list(historique_trie.keys()),
        "derniere_mise_a_jour": derniere_donnee_recue.strftime("%d/%m/%Y à %H:%M"),
        "horodatage_fin_recherche": derniere_donnee_recue.isoformat(),
        "total_france_twh": resume_cours["total_france_twh"],
        "nombre_centrales_actives": len(resume_cours["production_par_centrale_twh"]),
        "nombre_reacteurs_total": len(resume_cours["cache_brut_mwh"]),
        "nombre_reacteurs_en_production": nb_en_production,
        "production_par_centrale_twh": resume_cours["production_par_centrale_twh"],
        "cache_brut_mwh": resume_cours["cache_brut_mwh"],
        "cache_statut": statut_actuel_reacteurs,
        "historique_annuel": historique_trie
    }

    with open(CHEMIN_FICHIER, 'w', encoding='utf-8') as f:
        json.dump(data_export, f, ensure_ascii=False, indent=4)

    print(f"\n✅ Terminé ! JSON généré avec succès ({annee_en_cours}). Marque-page placé à : {derniere_donnee_recue}")


if __name__ == "__main__":
    extraire_donnees_live()
