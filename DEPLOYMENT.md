# Déploiement gratuit : PWA Firebase Hosting + backend Cloud Run

Ce guide décrit la méthode la plus simple et (quasi) gratuite pour héberger
InvincibleVoice pour **un utilisateur**, accessible depuis n'importe quel
appareil, y compris installable sur Android comme une application (PWA).

Architecture :

```
  PWA (Firebase Hosting, statique, gratuit)
        │   HTTPS + WebSocket (wss)
        ▼
  Backend (Cloud Run, conteneur Docker)
        │
        ├── LLM        → Cerebras (palier gratuit)
        ├── STT / TTS  → Gradium  (palier gratuit)
        ├── Redis      → Upstash  (palier gratuit)
        └── Données    → bucket Cloud Storage (persistant)
```

> 💡 **Astuce importante et urgente** : tant que l'utilisateur peut encore
> parler clairement, enregistrez un échantillon propre de sa voix et clonez-la
> dans l'application (réglages → « Cloner votre voix »). Les réponses pourront
> alors être prononcées avec sa propre voix.

---

## 0. Comptes à créer (gratuits)

| Service | Pour quoi | Variable(s) |
|---|---|---|
| [Cerebras](https://cloud.cerebras.ai/) | LLM (suggestions) | `KYUTAI_LLM_API_KEY` |
| [Gradium](https://gradium.ai/) | STT + TTS (+ clonage voix) | `GRADIUM_API_KEY` |
| [Upstash](https://upstash.com/) | Redis (verrous) | `REDIS_URL` |
| [Firebase / Google Cloud](https://console.firebase.google.com/) | Hébergement PWA + backend | — |

Sur Google Cloud, il faut activer la **facturation (plan Blaze)** pour utiliser
Cloud Run. À ce volume (un seul utilisateur), le coût reste proche de 0 €, mais
une carte bancaire est requise. Installez aussi les CLI :
[`gcloud`](https://cloud.google.com/sdk/docs/install) et
[`firebase`](https://firebase.google.com/docs/cli) (`npm i -g firebase-tools`).

---

## 1. Stockage persistant (bucket Cloud Storage)

Cloud Run est **sans état** : sans bucket, les réglages, la voix clonée et
l'historique seraient perdus à chaque redémarrage.

```bash
gcloud storage buckets create gs://VOTRE-PROJET-invincible-data --location=europe-west1
```

On le montera comme un volume dans Cloud Run à l'étape 2 (chemin `/users_data`).

---

## 2. Déployer le backend sur Cloud Run

Depuis la racine du dépôt. Cloud Build construit automatiquement l'étape
`cloudrun` du `services/backend/Dockerfile` (elle écoute sur `$PORT`).

```bash
gcloud run deploy invincible-backend \
  --source services/backend \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 3600 \
  --add-volume name=data,type=cloud-storage,bucket=VOTRE-PROJET-invincible-data \
  --add-volume-mount volume=data,mount-path=/users_data \
  --set-env-vars "^@^\
KYUTAI_LLM_URL=https://api.cerebras.ai/v1@\
KYUTAI_LLM_MODEL=gpt-oss-120b@\
KYUTAI_LLM_API_KEY=VOTRE_CLE_CEREBRAS@\
GRADIUM_API_KEY=VOTRE_CLE_GRADIUM@\
TTS_SERVER=https://eu.api.gradium.ai/api/@\
TTS_IS_GRADIUM=true@\
STT_IS_GRADIUM=true@\
KYUTAI_STT_URL=wss://eu.api.gradium.ai/api/speech/asr@\
REDIS_URL=rediss://default:MOT_DE_PASSE@VOTRE-HOST.upstash.io:6379@\
KYUTAI_USERS_DATA_PATH=/users_data@\
JWT_SECRET_KEY=UNE_LONGUE_CHAINE_ALEATOIRE@\
ALLOW_PASSWORD=true@\
METRICS_TOKEN=UN_AUTRE_SECRET_ALEATOIRE@\
GOOGLE_CLIENT_ID="
```

Notes :
- `--timeout 3600` : durée max d'une conversation WebSocket (1 h, le maximum).
- `--allow-unauthenticated` : le backend est public (protégé par mot de passe + JWT).
- `METRICS_TOKEN` : comme le backend est public, l'endpoint Prometheus `/metrics`
  ne doit pas être ouvert. Avec cette variable, `/metrics` exige l'en-tête
  `Authorization: Bearer <METRICS_TOKEN>` et renvoie 404 sinon. Laissez-la vide
  uniquement si vous ne scrapez pas les métriques publiquement.
- Les tentatives d'authentification sont limitées par IP (`AUTH_RATE_LIMIT_PER_MINUTE`,
  défaut 10/min) pour freiner la force brute.
- `GOOGLE_CLIENT_ID=` (vide) masque le bouton « Se connecter avec Google » :
  on utilise l'authentification par mot de passe, plus simple pour un seul
  utilisateur.
- Le `^@^` indique à gcloud d'utiliser `@` comme séparateur (car certaines
  valeurs contiennent des virgules / `://`).
- Pour rester toujours chaud (pas de démarrage à froid, petit coût) : ajoutez
  `--min-instances 1`. Pour rester gratuit : laissez à 0 (démarrage à froid de
  quelques secondes après inactivité).

À la fin, gcloud affiche l'**URL du service**, par ex.
`https://invincible-backend-xxxx.run.app`. Notez-la.

---

## 3. Construire et déployer la PWA sur Firebase Hosting

Le frontend est exporté en statique et appelle directement le backend Cloud Run.

```bash
cd services/frontend
pnpm install
```

Construire en pointant vers l'URL du backend (PowerShell) :

```powershell
$env:NEXT_OUTPUT='export'
$env:NEXT_PUBLIC_BACKEND_URL='https://invincible-backend-xxxx.run.app'
pnpm build
```

(En bash : `NEXT_OUTPUT=export NEXT_PUBLIC_BACKEND_URL=https://… pnpm build`.)

Cela génère le dossier `out/`. Renseignez votre projet dans
[`.firebaserc`](services/frontend/.firebaserc) puis déployez :

```bash
firebase login
firebase deploy --only hosting
```

Firebase affiche l'URL d'hébergement, par ex. `https://VOTRE-PROJET.web.app`.

---

## 4. Autoriser la PWA côté backend (CORS)

Le frontend (domaine Firebase) et le backend (domaine Cloud Run) sont sur des
origines différentes : il faut autoriser l'origine Firebase. Mettez à jour le
service Cloud Run :

```bash
gcloud run services update invincible-backend --region europe-west1 \
  --update-env-vars "CORS_ALLOW_ORIGINS=https://VOTRE-PROJET.web.app,https://VOTRE-PROJET.firebaseapp.com"
```

---

## 5. Créer le compte de l'utilisateur

Ouvrez `https://VOTRE-PROJET.web.app`, créez un compte (e-mail + mot de passe),
puis dans les réglages : renseignez son nom, ses amis, et **clonez sa voix**.

Sur Android : ouvrez le site dans Chrome → menu → « Ajouter à l'écran
d'accueil » → l'application s'installe avec une icône, en plein écran.

---

## Récapitulatif des variables d'environnement (backend)

| Variable | Exemple / valeur | Rôle |
|---|---|---|
| `KYUTAI_LLM_URL` | `https://api.cerebras.ai/v1` | API LLM |
| `KYUTAI_LLM_MODEL` | `gpt-oss-120b` | Modèle LLM |
| `KYUTAI_LLM_API_KEY` | *(secret Cerebras)* | Clé LLM |
| `GRADIUM_API_KEY` | *(secret Gradium)* | Clé STT/TTS |
| `TTS_SERVER` | `https://eu.api.gradium.ai/api/` | Serveur TTS |
| `TTS_IS_GRADIUM` | `true` | Utiliser Gradium TTS |
| `STT_IS_GRADIUM` | `true` | Utiliser Gradium STT |
| `KYUTAI_STT_URL` | `wss://eu.api.gradium.ai/api/speech/asr` | Serveur STT |
| `REDIS_URL` | `rediss://default:…@…upstash.io:6379` | Redis (verrous) |
| `KYUTAI_USERS_DATA_PATH` | `/users_data` | Données (bucket monté) |
| `JWT_SECRET_KEY` | *(chaîne aléatoire)* | Signature des jetons |
| `ALLOW_PASSWORD` | `true` | Connexion par mot de passe |
| `METRICS_TOKEN` | *(secret aléatoire)* | Protège `/metrics` (bearer requis) |
| `AUTH_RATE_LIMIT_PER_MINUTE` | `10` *(optionnel)* | Limite des tentatives d'auth par IP |
| `ALLOW_ANONYMOUS_USER` | `0` **(recommandé en public)** | `0` ferme `GET /v1/user/anonymous` et le WebSocket sans jeton : le compte anonyme partagé expose sinon profil + historique de conversations sans authentification |
| `MAX_PAST_CONVERSATIONS_IN_PROMPT` | `10` *(optionnel)* | Conversations passées injectées au LLM |
| `GOOGLE_CLIENT_ID` | *(vide)* | Masque le login Google |
| `CORS_ALLOW_ORIGINS` | `https://VOTRE-PROJET.web.app,…` | Autorise la PWA |
| `TTS_VOICE_ID` | `vMYQUSzm6GRkJX6d` *(Olivier, fr masculin)* | Voix par défaut |

## Mettre à jour l'application plus tard

- **Backend** : relancez la commande `gcloud run deploy` de l'étape 2.
- **Frontend** : refaites l'étape 3 (`pnpm build` + `firebase deploy`).
