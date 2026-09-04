# FAST — Prototype : README technique (mis à jour)

Ce document fait suite à un premier audit. Beaucoup de points ont été
corrigés depuis — ce README reflète l'état **réel** du dépôt à ce jour et se
concentre sur les **actions restantes**.

---

## 1. Architecture du site

### Vue d'ensemble

Le site est une **app front-end 100% statique**, hébergée sur GitHub Pages,
sans backend. Toute la logique vit dans le navigateur :

- **`assets/app.js`** — logique métier centralisée (`window.FAST`) : i18n,
  profil, stepper de questions (texte libre ET structuré : choix unique/
  multiple, échelle, oui/non), stockage des réponses, brouillon persistant,
  synthèses IA, reconstruction de l'état en mode édition.
- **`assets/ai.js` / `assets/ai-config.js`** — appel IA multi-fournisseurs,
  avec bascule vers un relais serverless (voir section 3).
- **`assets/flow-config.js`** — `MODE_FINAL` : affichage direct de la
  réponse finale, ou redirection vers le parcours email.
- **`assets/fallback.js`** — copie miroir des traductions (repli `file://`).
- **`assets/i18n/{fr,en,es,ro}.xml`** — traductions officielles.
- **`assets/questions.xml`** — jeux de questions par langue, y compris le
  format structuré de Q10/Q5.
- **`assets/prompts.xml`** — les 4 coachs IA (voir section 3).
- **`<fast-header>`** — Web Component (menu + statut), utilisé par toutes
  les pages sauf `index.html` (toujours vrai, voir section 4).

### Parcours utilisateur (mis à jour)

**Parcours A — Diagnostic guidé, entièrement relié à l'IA :**
```
index.html → describe-process.html → q10.html
  → results.html            (IA #1 : synthèse Q10, coach "executive")
  → q5.html
  → results-even-better.html (IA #2 : synthèse Q10+Q5, coach "profile_deepening")
  → your-question.html       (question libre)
  → deepen-question.html     (IA #3 : génère 3 questions de clarification,
                               coach "deepen_questions_generator")
  → final-response.html      (IA #4 : réponse finale, coach "final_answer")
  → [selon MODE_FINAL] affichage ici, ou redirection email-sent.html
```

**Mémoire ajoutée depuis le premier audit :**
- `welcome-back.html` : si Q10+Q5 déjà complétés, `q10.html` y redirige au
  lieu de reposer les questions. Trois choix : continuer vers la question,
  modifier les réponses (`q10.html?edit=1`), ou tout refaire.
- `who-am-i.html` : affiche la synthèse IA Q10+Q5 (recalculée à l'ouverture
  si les réponses stockées ne correspondent plus au cache), avec un bouton
  "Modifier mes réponses de profil" qui relance le même mécanisme d'édition.
- Un brouillon par écran (Q10/Q5/deepen) survit à un retour en arrière ou un
  rechargement, et ne se réinitialise plus après complétion.

**Parcours B — Écrans annexes** (inchangé) : `articles.html`, `config.html`,
`marketplace.html`, `new-question.html`, `profile.html`, `subscription.html`,
`who-am-i.html`.

**Parcours C — "Engagement / coaching" : toujours un îlot isolé.**
```
email-backup.html ⇄ email-sent.html → engagement.html → finalize-account.html
  → coaching-hub.html ⇄ coaching-plan.html / diagnostic.html / new-question.html
```
Toujours **atteignable depuis aucune autre page** du site — non résolu
depuis le premier audit (voir TODO).

---

## 2. Fichiers en double, inutilisés ou orphelins — état des lieux

| Fichier | Statut |
|---|---|
| `app.js` (racine) | ✅ **Supprimé.** |
| `js/` (tout le dossier) | ✅ **Supprimé.** |
| `index_2pages.html`, `reponse.html` | ❌ **Toujours présents.** |
| `css/style.css` | ❌ **Toujours présent.** |
| `data/question.xml` | ❌ **Toujours présent.** |
| `prompts/agent_prompt.xml`, `prompts/prompts.xml` | ❌ **Toujours présents** (et `prompts/prompts.xml` reste désynchronisé — un seul coach au lieu de 4). |
| `README-1.md`, `README-2.md` | ❌ **Toujours présents** (nouvelles copies de l'ancien README, en plus de celui-ci). |
| `relais-ia/worker.js` | ⚠️ Présent dans ce dépôt — sans risque (aucune clé dedans), mais n'a aucune utilité ici : ce fichier tourne sur Cloudflare, pas sur GitHub Pages. À déplacer dans un dépôt séparé si vous voulez le garder en référence. |

**Toujours à faire** : supprimer `index_2pages.html`, `reponse.html`,
`css/`, `data/`, `prompts/`, `README-1.md`, `README-2.md`.

---

## 3. Mécanisme IA et gestion des clés API — état des lieux

### Les 4 coachs — ✅ tous présents dans `assets/prompts.xml`
1. `executive` (Q10 → synthèse intermédiaire)
2. `profile_deepening` (Q10+Q5 → synthèse affinée)
3. `deepen_questions_generator` (Q10+Q5+question libre → 3 questions de clarification)
4. `final_answer` (Q10+Q5+deepen+question libre → réponse finale)

Chaque appel précise maintenant explicitement la **langue de réponse**
attendue (celle actuellement sélectionnée sur le site), via
`construireConsigneIA()` dans `app.js` — corrige le fait que l'IA répondait
en français quelle que soit la langue de l'interface.

### Relais serverless — ✅ activé
```
UTILISER_RELAIS: true
URL_RELAIS: "https://bold-math-50b2-relais-ia-fast-project.b00830790.workers.dev"
```
Les clés API ne sont donc plus exposées côté client pour un usage courant.
**Point à vérifier** : les champs `ANTHROPIC.API_KEY` / `OPENAI.API_KEY`
contiennent encore des valeurs placeholder (`"DDDD"`, `"OOO"`) — sans danger
puisqu'ils sont ignorés tant que `UTILISER_RELAIS` est à `true`, mais à
nettoyer (remplacer par des chaînes vides) pour éviter toute confusion
future si quelqu'un repasse le flag à `false` par erreur.

### Cache — ✅ en place
`results.html`, `results-even-better.html`, `deepen-question.html` (questions
générées) et `final-response.html` vérifient chacun un cache local avant
d'appeler l'IA, évitant les appels redondants sur simple rafraîchissement.

---

## 4. Incohérences restantes

1. **"TEST" toujours présent** dans `index.html` (`home_lead`) :
   `"TEST Un espace confidentiel pour avancer sur votre carrière..."`.
   Sans impact si `fr.xml` se charge normalement, mais visible en cas
   d'échec du fetch. **Toujours à corriger.**

2. **Traductions des écrans de synthèse — ✅ résolu.** Toutes les clés
   utilisées dans le HTML (`results_*`, `final_*`, `reb_*`, `wb_*`,
   `deepen_generation`, `choix_possibles_*`, `oui_label`/`non_label`...)
   sont maintenant présentes dans les 4 fichiers `assets/i18n/*.xml`, pas
   seulement dans `fallback.js`.

3. **`index.html` duplique toujours le header** au lieu d'utiliser
   `<fast-header></fast-header>` comme toutes les autres pages. Toujours un
   risque de désynchronisation si le menu évolue dans `app.js`. **Toujours
   à corriger.**

4. **Coach `final_answer` manquant — ✅ résolu.** Les 4 coachs sont
   présents et à jour dans `assets/prompts.xml`.

5. **`assets/app.js` obsolète — ✅ résolu.** La version déployée contient
   bien la gestion d'erreur explicite de `loadCoachPrompt`, la
   reconstruction d'état en mode édition, et la consigne de langue.

6. **Parcours "engagement/coaching-hub" toujours déconnecté** — non résolu
   depuis le premier audit. Décision toujours en attente (voir TODO).

---

## 5. TODO

### Nettoyage (section 2)
- [x] Supprimer `app.js` (racine)
- [x] Supprimer `js/` (tout le dossier)
- [ ] Supprimer `index_2pages.html`, `reponse.html`
- [ ] Supprimer `css/style.css`, `data/question.xml`
- [ ] Supprimer `prompts/agent_prompt.xml`, `prompts/prompts.xml`
- [ ] Supprimer `README-1.md`, `README-2.md` (garder uniquement ce README)
- [ ] Déplacer `relais-ia/worker.js` hors de ce dépôt (aucune utilité sur GitHub Pages)

### Bugs / incohérences (section 4)
- [ ] Retirer "TEST" du `home_lead` dans `index.html`
- [x] Ajouter les clés `results_*`/`final_*`/`reb_*`/`wb_*`/etc. aux 4 `assets/i18n/*.xml`
- [ ] Remplacer le header dupliqué d'`index.html` par `<fast-header></fast-header>`
- [x] Restaurer les 4 coachs dans `assets/prompts.xml`
- [x] Mettre à jour `assets/app.js` (erreurs explicites, édition, langue)
- [ ] Décider si le parcours "engagement/coaching-hub" doit être relié au site, fusionné avec `final-response.html` (via `MODE_FINAL: "email"`), ou supprimé

### Sécurité IA (section 3)
- [x] Déployer le relais Cloudflare Worker et activer `UTILISER_RELAIS`
- [ ] Vider les champs `API_KEY` placeholder (`"DDDD"`, `"OOO"`) dans `ai-config.js` par des chaînes vides, par prudence
- [ ] Vérifier si l'historique Git du dépôt contient encore une ancienne clé exposée (sur l'ancien dépôt en tout cas — à vérifier aussi sur celui-ci si du contenu a été réimporté)

---

## 6. Annexe — autres remarques (NB)

- **NB — Nouveau dépôt** : si ce dépôt est bien le nouveau (recréé pour
  repartir propre), vérifiez qu'aucun historique Git de l'ancien dépôt n'a
  été réimporté avec lui (auquel cas l'ancienne clé exposée y serait aussi).
- **NB — `gemini-2.0-flash`** : toujours configuré manuellement, différent
  du défaut initial `gemini-1.5-flash` — vérifiez que c'est intentionnel.
- **NB — Consigne de langue et `deepen_questions_generator`** : ce coach
  doit répondre avec un format strict (3 lignes `"Q: ..."`). L'instruction
  de langue ajoutée pourrait, dans de rares cas, pousser le modèle à
  traduire jusqu'au préfixe `"Q:"` lui-même. À surveiller si des questions
  de clarification cessent d'apparaître dans une langue donnée.
- **Suggestion (hors périmètre)** : ajouter un identifiant de version dans
  `assets/questions.xml` et `assets/prompts.xml`, pour repérer plus vite
  une désynchronisation entre une copie déployée et la version de
  référence — exactement le type de régression qui avait touché le coach
  `final_answer` précédemment.
