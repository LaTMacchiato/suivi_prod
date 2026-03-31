import requests
import base64
import json
import os
from datetime import datetime, timedelta
import time 

CLIENT_ID = os.environ.get("RTE_CLIENT_ID")
CLIENT_SECRET = os.environ.get("RTE_CLIENT_SECRET")
CHEMIN_FICHIER = 'data_nucleaire_france.json'

# --- 1. IL MANQUAIT CETTE FONCTION ---
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

def extraire_donnees_live():
    annee_en_cours = datetime.now().year
    date_debut = datetime(annee_en_cours, 1, 1)
    production_par_reacteur = {}
    statut_actuel_reacteurs = {} 
    
    # 1. LECTURE DU CACHE (Pour la mise à jour incrémentale)
    if os.path.exists(CHEMIN_FICHIER):
        try:
            with open(CHEMIN_FICHIER, 'r', encoding='utf-8') as f:
                anciennes_donnees = json.load(f)
                
            marque_page = anciennes_donnees.get("horodatage_fin_recherche")
            if marque_page:
                date_debut = datetime.fromisoformat(marque_page)
                if date_debut.year == annee_en_cours:
                    print(f"✅ Reprise à partir du : {date_debut}")
                    production_par_reacteur = anciennes_donnees.get("cache_brut_mwh", {})
                    statut_actuel_reacteurs = anciennes_donnees.get("cache_statut", {})
                else:
                    date_debut = datetime(annee_en_cours, 1, 1)
        except Exception as e:
            print(f"⚠️ Impossible de lire le cache. Erreur: {e}")

    date_fin = datetime.now().replace(minute=0, second=0, microsecond=0)
    
    if date_debut >= date_fin:
        print("⏳ Les données sont déjà à jour.")
        return

    derniere_donnee_recue = date_debut

    print("Obtention du token d'accès...")
    token = obtenir_token(CLIENT_ID, CLIENT_SECRET)
    headers = {"Authorization": f"Bearer {token}"}
    url_api = "https://digital.iservices.rte-france.com/open_api/actual_generation/v1/actual_generations_per_unit"
    
    # 2. DÉCOUPAGE INTELLIGENT
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

    # 3. INTERROGATION DE L'API
    print(f"Extraction en cours...")
    for tranche in tranches:
        str_debut = tranche["api_debut"].strftime("%Y-%m-%dT%H:%M:%S+01:00")
        str_fin = tranche["api_fin"].strftime("%Y-%m-%dT%H:%M:%S+01:00")
        
        params = {"start_date": str_debut, "end_date": str_fin}
        response = requests.get(url_api, headers=headers, params=params)
        
        if response.status_code != 200:
            print(f"   [!] Erreur: {response.text}")
            continue
            
        data = response.json()
        
        for unite in data.get("actual_generations_per_unit", []):
            infos_unite = unite.get("unit", {})
            if infos_unite.get("production_type") == "NUCLEAR":
                nom_reacteur = infos_unite.get("name", "Inconnu")
                if nom_reacteur not in production_par_reacteur:
                    production_par_reacteur[nom_reacteur] = 0.0
                
                for releve in unite.get("values", []):
                    releve_dt = datetime.fromisoformat(releve["start_date"]).replace(tzinfo=None)
                    valeur_mw = releve.get("value", 0)
                    
                    # CORRECTION 1 : On met à jour notre marque-page avec la date réelle
                    if releve_dt > derniere_donnee_recue:
                        derniere_donnee_recue = releve_dt
                    
                    # CORRECTION 2 : Strictement supérieur (>) pour ne pas compter la même heure en double
                    if releve_dt > date_debut and releve_dt.timestamp() > tranche["vrai_debut"].timestamp():
                        if valeur_mw > 0:
                            production_par_reacteur[nom_reacteur] += valeur_mw
                    
                    # Le statut en direct prend toujours la dernière valeur lue
                    statut_actuel_reacteurs[nom_reacteur] = (valeur_mw > 0)
        time.sleep(0.5)

    # 4. REGROUPEMENT ET EXPORT
    production_par_centrale = {}
    for nom_reacteur, prod_mwh in production_par_reacteur.items():
        nom_centrale = nom_reacteur.rsplit(' ', 1)[0]
        if nom_centrale not in production_par_centrale:
            production_par_centrale[nom_centrale] = 0.0
        production_par_centrale[nom_centrale] += prod_mwh

    total_france_mwh = sum(production_par_reacteur.values())
    centrales_twh = {nom: round(prod / 1_000_000, 3) for nom, prod in production_par_centrale.items()}
    nb_en_production = sum(1 for en_marche in statut_actuel_reacteurs.values() if en_marche)

    data_export = {
        "derniere_mise_a_jour": derniere_donnee_recue.strftime("%d/%m/%Y à %H:%M"),
        "horodatage_fin_recherche": derniere_donnee_recue.isoformat(), # CORRECTION 3 : On utilise la vraie date
        "total_france_twh": round(total_france_mwh / 1_000_000, 3),
        "nombre_centrales_actives": len(centrales_twh),
        "nombre_reacteurs_total": len(production_par_reacteur),
        "nombre_reacteurs_en_production": nb_en_production, 
        "production_par_centrale_twh": dict(sorted(centrales_twh.items(), key=lambda item: item[1], reverse=True)), 
        "cache_brut_mwh": production_par_reacteur,
        "cache_statut": statut_actuel_reacteurs
    }
    
    with open(CHEMIN_FICHIER, 'w', encoding='utf-8') as f:
        json.dump(data_export, f, ensure_ascii=False, indent=4)
        
    print(f"\n✅ Terminé ! JSON généré avec succès. Marque-page placé à : {derniere_donnee_recue}")

if __name__ == "__main__":
    extraire_donnees_live()
