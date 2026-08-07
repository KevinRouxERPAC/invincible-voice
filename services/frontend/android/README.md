# Build Android (APK)

L'app Android est générée via [Capacitor](https://capacitorjs.com/) à partir du frontend Next.js exporté en statique. La conversation intelligente passe par Cloud Run ; hors-ligne, SOS et phrases rapides utilisent le TTS natif Android.

## Prérequis

- Android Studio (Hedgehog ou supérieur).
- Node.js 20+ et pnpm.
- La variable `JAVA_HOME` pointe vers le JDK 21 (le wrapper Gradle utilise la toolchain JetBrains JBR 21).

## 1) Construire le frontend et synchroniser Capacitor

```bash
# Depuis services/frontend
cp .env.production.example .env.production.local   # URL Cloud Run (pas de /api)
pnpm build:android                                 # = next export + cap sync android
```

Le fichier `.env.android.local` peut aussi être utilisé ; sinon
`.env.production.local` est chargé automatiquement.

Pour le mode live-reload contre le dev server (développement uniquement) :

```bash
# Dans .env.android.local
CAPACITOR_SERVER_URL=http://192.168.1.42:3000
```

## 2) Compiler l'APK dans Android Studio

1. Ouvrir le dossier `services/frontend/android` dans Android Studio.
2. Laisser Gradle sync (téléchargement de la toolchain JDK 21 via foojay-resolver).
3. **Build → Make Project** (ou `./gradlew assembleDebug`).

Les ABI packagés sont `arm64-v8a` (téléphones) et `x86_64` (émulateur smoke).

## Architecture hors-ligne

- **Backend joignable** : WebSocket Cloud Run + Gradium STT/TTS (comme le web).
- **Backend injoignable** : écran `OfflineFallback` — SOS, phrases rapides et texte libre via TTS natif (`@capacitor-community/text-to-speech`). Pas de suggestions LLM locales.
- Snapshot settings/phrases : `localSettingsCache` + miroir `localUserData` sur native.

## Problèmes courants

- **`No module named fastrtc`** côté backend en mode `text_only` : normal, les deps audio sont optionnelles.
- **Symlinks sur Windows** : la build `next build` standalone échoue sous Windows sans "Developer Mode" ou droits admin. Utilisez `NEXT_OUTPUT=export` (le mode Capacitor) qui ne crée pas de symlinks.

---

## Publication Google Play (accès limité)

L'app impose déjà un contrôle d'accès côté backend : seuls les comptes
provisionnés par un administrateur peuvent se connecter (pas d'inscription
libre). Sur le Play Store, la piste **Test fermé** limite qui peut
**installer** l'app et reçoit les **mises à jour** automatiquement.

### Prérequis Play Console

- Compte développeur Google Play (25 $, paiement unique).
- Fiche store : captures d'écran, politique de confidentialité, formulaire
  « Sécurité des données » (microphone, données vocales).
- Backend déployé avec `GOOGLE_CLIENT_ID` renseigné si vous utilisez la
  connexion Google (recommandé sur Android).

### 1) Keystore de release (une seule fois)

Sous Windows, `keytool` n'est en général pas dans le PATH : utilisez le script
du projet (il détecte le JBR d'Android Studio) :

```bash
cd services/frontend
pnpm android:keystore
copy android\keystore.properties.example android\keystore.properties
# Éditez keystore.properties avec les mots de passe choisis.
```

Équivalent manuel si besoin (PowerShell) :

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
& "$env:JAVA_HOME\bin\keytool.exe" -genkey -v `
  -keystore keystore/invincible-release.keystore `
  -alias invincible -keyalg RSA -keysize 2048 -validity 10000
```

Conservez le keystore et `keystore.properties` en lieu sûr (non versionnés).

### 2) OAuth Google (connexion native Android)

```bash
cd services/frontend
pnpm android:sha1
```

Enregistrez l'empreinte **SHA-1** affichée dans Google Cloud Console :

- Client OAuth **Android** : package `com.invinciblevoice.app` + SHA-1.
- Client OAuth **Application Web** : son Client ID est la valeur de
  `GOOGLE_CLIENT_ID` sur Cloud Run.

Après la première publication, ajoutez aussi le SHA-1 du certificat **App signing**
(Play Console → Intégrité de l'application → Certificat de signature de l'app).

### 3) Provisionner les utilisateurs autorisés

Chaque testeur doit avoir un compte côté backend **avant** de pouvoir se
connecter :

```bash
cd services/backend
uv run python scripts/create_user.py testeur@exemple.com --google-only --language fr
```

Ou via **Paramètres → Administration** dans l'app. Alignez les emails des
testeurs Play Store avec les comptes provisionnés.

### 4) Construire l'AAB signé

```bash
cd services/frontend
cp .env.production.example .env.production.local   # URL Cloud Run
pnpm build:android:release
```

Le fichier à uploader est :

`android/app/build/outputs/bundle/release/app-release.aab`

Avant chaque nouvelle version Play Store, incrémentez `versionCode` dans
`android/version.properties` (entier strictement croissant).

### 5) Piste Test fermé sur Play Console

1. Créer l'application (`com.invinciblevoice.app`).
2. **Tests → Test fermé** → créer une version → uploader l'AAB.
3. Ajouter la liste de testeurs (adresses Gmail).
4. Partager le lien d'inscription ; les testeurs installent et mettent à jour
   via le Play Store.

L'app n'apparaît pas dans la recherche publique. Pour un déploiement plus
large tout en restant hors recherche, passez en **Production non répertoriée**
après validation.

### Mises à jour

| Composant | Action |
|-----------|--------|
| Backend | `gcloud run deploy` (inchangé) |
| App Android | Incrémenter `versionCode`, `pnpm build:android:release`, uploader l'AAB |
| Nouveaux utilisateurs | Provisionner le compte backend + ajouter l'email à la liste de testeurs Play |
