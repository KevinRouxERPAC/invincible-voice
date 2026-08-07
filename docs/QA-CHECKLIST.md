# Checklist QA — InvincibleVoice

Checklist exécutable pour vérifier toute l’app (desktop PWA + Android si disponible).  
Cocher : `[x]` OK · `[ ]` à faire · `N/A` non applicable.

**Prérequis**

- [ ] Backend Cloud Run déployé (voir `DEPLOYMENT.md`)
- [ ] `services/frontend/.env.local` avec `NEXT_PUBLIC_BACKEND_URL=https://….run.app`
- [ ] Compte admin (panneau Admin ou `create_user.py` + `KYUTAI_USERS_DATA_PATH=gs://…`)

**Dernière exécution** : 2026-07-17  
**Environnement** :

- Suites auto : Frontend Jest **225 passed**, Backend pytest **74 passed**
- Backend local Docker : **supprimé** — API = Cloud Run uniquement
- QA navigateur live : configurer `.env.local` frontend puis `pnpm dev`

---



## 1. Auth & accès


| #   | Cas                                                 | Statut                                                        |
| --- | --------------------------------------------------- | ------------------------------------------------------------- |
| 1.1 | Login mot de passe OK                               | [x] auto (`test_provisioned_user_login_roundtrip`)            |
| 1.2 | Mauvais mot de passe → 401                          | [x] auto                                                      |
| 1.3 | Compte Google-only + login password → 401 (pas 500) | [x] auto (`test_google_only_user_password_login_returns_401`) |
| 1.4 | Google sign-in (si `GOOGLE_CLIENT_ID` configuré)    | [ ] manuel                                                    |
| 1.5 | CGU : premier login bloque jusqu’à acceptation      | [ ] manuel                                                    |
| 1.6 | Compte non provisionné → message clair              | [x] auto (Google 403) / [ ] manuel UI                         |


---



## 2. Paramètres desktop → UI (sans F5)


| #    | Réglage                       | Vérification                     | Statut                                         |
| ---- | ----------------------------- | -------------------------------- | ---------------------------------------------- |
| 2.1  | Nom                           | visible après save               | [ ] manuel                                     |
| 2.2  | Langue STT                    | verrou prompt + STT              | [x] auto prompt / [ ] manuel STT               |
| 2.3  | Voix + test                   | preview joue la voix             | [ ] manuel                                     |
| 2.4  | Débit vocal                   | TTS plus lent/rapide             | [x] auto (`playbackRate` / `ttsUtil.test.ts`)  |
| 2.5  | Thème / contraste / police    | classes `dark`/`contrast`/`--fz` | [x] auto (`uiSettings.test.ts`)                |
| 2.6  | Scan (off/auto/step/dwell)    | surlignage + sélection           | [x] auto (scan-engine)                         |
| 2.7  | Big targets                   | cibles agrandies                 | [x] auto partiel (scanSettings)                |
| 2.8  | AZERTY / QWERTY               | badges raccourcis live           | [x] auto (`keyboardLayout.test.tsx`)           |
| 2.9  | learn_style                   | sections prompt on/off           | [x] auto (`promptBuilderLanguage.test.ts`)     |
| 2.10 | Prompt / keywords / friends   | drawer mis à jour                | [x] friends auto / [ ] manuel prompt           |
| 2.11 | Quick phrases / RDV / docs    | liste / launcher                 | [x] phrases save→refresh auto / [ ] manuel RDV |
| 2.12 | Settings pendant conversation | bloqué + toast                   | [ ] manuel                                     |


---



## 3. Paramètres mobile


| #   | Cas                                                      | Statut                                                       |
| --- | -------------------------------------------------------- | ------------------------------------------------------------ |
| 3.1 | Nom, langue, débit, learn_style, accessibilité éditables | [x] render auto (`mobile-settings-render`) / [ ] manuel live |
| 3.2 | Message « more settings on desktop »                     | [x] auto render                                              |
| 3.3 | Quick phrases sheet en session                           | [ ] manuel                                                   |
| 3.4 | SOS offline utilise le snapshot                          | [x] auto (snapshot voix/langue)                              |


---



## 4. Conversation & TTS


| #   | Cas                                         | Statut                                         |
| --- | ------------------------------------------- | ---------------------------------------------- |
| 4.1 | Session → 3 réponses + keywords             | [x] auto handlers text-only / [ ] manuel audio |
| 4.2 | Sélection réponse → TTS                     | [x] auto stream util / [ ] manuel audio        |
| 4.3 | Taille XS–XL mid-session                    | [ ] manuel                                     |
| 4.4 | Mode « prendre la parole »                  | [ ] manuel                                     |
| 4.5 | Historique archive / désarchive / supprimer | [x] auto backend                               |
| 4.6 | Phrases rapides + runner RDV                | [x] composants auto / [ ] manuel TTS           |


---



## 5. Admin


| #   | Cas                                                  | Statut                                               |
| --- | ---------------------------------------------------- | ---------------------------------------------------- |
| 5.1 | Liste / créer (password + google-only)               | [x] auto create password / [ ] manuel google-only UI |
| 5.2 | Toggle admin / supprimer                             | [ ] manuel                                           |
| 5.3 | Pas de self-delete / self-revoke                     | [x] auto self-delete                                 |
| 5.4 | Bootstrap `ADMIN_EMAILS` puis révocation persistante | [x] auto                                             |


---



## 6. Offline / natif (Android)


| #   | Cas                                        | Statut                      |
| --- | ------------------------------------------ | --------------------------- |
| 6.1 | Toggle offline                             | [ ] manuel Android          |
| 6.2 | SOS / fallback backend down                | [x] auto composants         |
| 6.3 | Prefetch phrases avec voix/langue snapshot | [x] auto emergency snapshot |


---



## 7. Régressions connues


| #   | Cas                                                                                        | Statut                                                                                   |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 7.1 | `.env.production.local` gagne sur `.env.android.local`                                     | [x] code vérifié (`load-production-env.mjs` : android puis production puis `extraPaths`) |
| 7.2 | Phrases rapides utilisent `voiceName` ; réponses LLM online peuvent ignorer la voix client | [x] documenté (comportement actuel)                                                      |


---



## 8. Suite automatisée


| Suite          | Commande                               | Statut                      |
| -------------- | -------------------------------------- | --------------------------- |
| Frontend Jest  | `cd services/frontend && pnpm test`    | [x] 225 passed (2026-07-17) |
| Backend pytest | `cd services/backend && uv run pytest` | [x] 74 passed (2026-07-17)  |
| Frontend lint  | `pnpm lint`                            | [ ] optionnel               |
| Backend ruff   | `uv run ruff check`                    | [ ] optionnel               |


---



## Notes / bugs trouvés

- Aucun bug bloquant trouvé dans les nouveaux tests de réactivité paramètres.
- Backend local (docker compose / Traefik / API sur PC) retiré du projet.
- QA navigateur live : pointer le frontend vers Cloud Run via `.env.local`.
- Avertissements Jest préexistants (ScanProvider `act(...)`, `res.json` dans un mock TTS de `current-keywords`) — hors scope de cette passe.

