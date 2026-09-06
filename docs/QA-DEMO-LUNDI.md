# QA InvincibleVoice — Rapport pré-démo lundi (06/09/26)

Compte de démonstration créé et validé de bout en bout sur le S25 Ultra.

## Compte de démo (prêt pour lundi)
- Email : `demo.lundi@invincible-test.fr`
- Mot de passe : `DemoLundi2026!`
- Langue : Français · pas d'admin · pas de Google-only
- CGU : acceptées pendant les tests — **le modal CGU ne se représentera plus lundi**.
  Si tu veux montrer le flux CGU au nouvel utilisateur, recrée un compte (Réglages →
  Administration → Créer un compte, 2 minutes) — les cases restent décochées par défaut.
- Historique du compte : 1 conversation « Nouvelle discussion » (nettoyable dans la corbeille
  ⋮ si tu veux un compte vierge).

## État du téléphone
- App connectée sur le compte démo, accueil affiché, batterie 77 %.
- Permission micro déjà accordée — lundi, le nouvel utilisateur n'aura PAS le dialogue
  de permission (il a été consommé par mes tests). Deux options : laisser tel quel
  (recommandé — moins de friction), ou `pm clear` + repasser par le login démo si tu tiens
  à montrer la demande de permission.

## Ce qui a été validé (zéro crash, zéro erreur bloquante)
1. Création de compte via panneau admin mobile (formulaire complet fonctionnel)
2. Déconnexion → écran login propre
3. Login email + mot de passe → modal CGU
4. **Refus des CGU** → déconnexion propre + retour login (comportement correct)
5. Ré-connexion + **acceptation des CGU** → accueil
6. Démarrage conversation → WebSocket connecté → suggestions initiales FR génériques
7. Sélection d'une suggestion → bulle bleue + TTS + renouvellement des suggestions
8. Mode Écrire : champ + clavier + bouton Envoyer → message envoyé + adaptation LLM
9. Historique : conversation enregistrée avec horodatage
10. Phrase rapide « J'ai soif. » → lecture TTS (bordure orange pendant la lecture)

## Défauts observés (non bloquants, classés)

### 1. Transcription parasite en cyrillique (MOYEN — à connaître pour lundi)
Le STT serveur a transcrit le son ambiant (TV) en russe : « Актим так, поколкуюсь… ».
Cause : Gradium auto-détecte la langue quand le réglage n'est pas verrouillé ou quand
l'audio est ambigu. Les suggestions ont rebasculé en français aussitôt.
**Parade lundi** : tester dans une pièce calme, ou vérifier Réglages → Langue = Français
(c'est déjà le cas sur le compte démo). Ne pas présenter l'app devant une TV allumée.

### 2. Cold start Cloud Run : 70 s mesurées (MOYEN — voir recommandation)
Premier appel après idle : **69,7 s** (test propre : 16 min d'extinction, puis un appel).
L'app abandonne son health check après 6 s → « Impossible de se connecter » si
l'instance est endormie.
**Fix déployé (commit 4fb9cd5, PWA redéployée)** : écran dédié « Le serveur démarre… »
avec 8 retries espacés (t=0 → 100 s). L'utilisateur voit que le serveur se réveille
et la page bascule toute seule une fois le serveur up. L'APK v0.1.4 embarque
l'ancien code — le fix sera actif sur Android au prochain build sur ta machine.
**Recommandation pour lundi (APK actuel)** : 2 min avant la démo, ouvrir l'app une
première fois (réveil de l'instance) OU me demander de réveiller le backend à distance.
Solution durable : min-instances=1 (coût idle permanent, à chiffrer) ou rebuild APK.

### 3. Erreur transitoire « Le serveur a rencontré une erreur » (FAIBLE)
Affichée 1 fois pendant les tests, l'app a continué sans crash. Le retry a fonctionné.
Comportement acceptable en démo — si ça arrive, refaire l'action.

### 4. Erreur console « Error injecting safe area CSS » (COSMÉTIQUE)
TypeError interne à l'injection CSS Capacitor, 3 occurrences au lancement, aucun
impact visible sur l'UI. À ignorer pour la démo, à investiguer plus tard.

### 5. Bouton Fin / positions variables (CONNUE)
Les positions des boutons bas (Envoyer/Écrire/Fin) bougent avec le clavier et les
suggestions. Un tap trop rapide peut cliquer à côté. Pas un bug — juste faire les
gestes posés pendant la démo.

## Checklist démo lundi (5 min avant)
- [ ] Réveiller le backend (ouvrir l'app une fois, attendre l'accueil)
- [ ] Vérifier WiFi du téléphone connecté
- [ ] Vérifier batterie > 30 %
- [ ] Pièce calme (pas de TV)
- [ ] Montrer : login démo → accueil → Démarrer → parler → choisir une suggestion →
      la voix clonée parle → Fin → historique
- [ ] Optionnel : montrer Phrases rapides (TTS instantané) et SOS
