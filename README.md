# FAST — Prototype : README technique

Ce document remplace `README.md` et `README-2.md` (deux copies obsolètes du
README d'un exemple précédent, sans rapport avec l'app actuelle). Il documente
l'état réel du dépôt au moment de l'audit.

---

## 1. Architecture du site

### Vue d'ensemble

Le site est une **app front-end 100% statique**, hébergée sur GitHub Pages,
sans aucun backend. Toute la logique vit dans le navigateur :

- **`assets/app.js`** — logique métier centralisée, exposée globalement via
  `window.FAST`. Gère l'i18n, le profil utilisateur, le stepper de questions,
  le stockage des réponses, et la synthèse IA.
- **`assets/fallback.js`** — copie miroir des traductions, utilisée quand
  `assets/i18n/*.xml` n'est pas joignable (ouverture en `file://` au lieu
  d'un serveur http).
- **`assets/i18n/{fr,en,es,ro}.xml`** — traductions officielles, chargées à
  l'exécution. **Remplacent entièrement** le dictionnaire de secours dès
  qu'elles sont joignables (voir section 4 — ce point cause un bug).
- **`assets/questions.xml`** — les jeux de questions (`q10`, `q5`, `deepen`,
  `nq`) par langue.
- **`assets/prompts.xml`** — les prompts des coachs IA (voir section 3).
- **`assets/style.css`** — feuille de style unique de l'app réelle.
- **`<fast-header>`** — Web Component défini dans `app.js`, injecte la barre
  de statut + le menu latéral. Utilisé par **toutes les pages sauf
  `index.html`** (voir section 4).

### Stockage (`localStorage`)

| Clé | Contenu |
|---|---|
| `fast_lang` | langue choisie |
| `fast_profile` | prénom, etc. |
| `fast_config` | préférences (fréquence de rappel, abonnement...) |
| `fast_answers` | tableau de toutes les réponses aux questionnaires, par écran (`{screen, ts, qa:[{q,a}]}`) |
| `fast_last_synthesis` | dernière synthèse IA intermédiaire (coach `executive`) — sert de cache |
| `fast_final_synthesis` | dernière synthèse IA finale (coach `final_answer`) — sert de cache |

### Point d'entrée et parcours utilisateur

`index.html` est le point d'entrée unique. Depuis là, **deux parcours
distincts et non reliés entre eux** coexistent actuellement :

**Parcours A — Diagnostic guidé (le parcours "vivant", relié à l'IA) :**
```
index.html
  → describe-process.html
  → q10.html          (10 questions de cadrage)
  → results.html      (appel IA #1 : synthèse intermédiaire, coach "executive")
  → q5.html            (5 questions d'approfondissement)
  → your-question.html (question libre de l'utilisatrice)
  → deepen-question.html (3 questions de clarification)
  → final-response.html (appel IA #2 : réponse finale, coach "final_answer")
  → index.html (retour)
```

**Parcours B — Écrans annexes accessibles directement depuis `index.html` ou le menu :**
`articles.html`, `config.html`, `marketplace.html`, `new-question.html` (son
propre mini-questionnaire `nq` → rejoint `your-question.html`), `profile.html`,
`subscription.html`, `who-am-i.html`.

**Parcours C — "Engagement / coaching" (îlot isolé, voir section 4) :**
```
email-backup.html ⇄ email-sent.html → engagement.html → finalize-account.html
  → coaching-hub.html ⇄ coaching-plan.html / diagnostic.html / new-question.html
```
Ce parcours n'est **atteignable depuis aucune autre page** du site (voir
section 4 — TODO).

---

## 2. Fichiers en double, inutilisés ou orphelins

| Fichier | Statut | Recommandation |
|---|---|---|
| `app.js` (racine) | **Orphelin dangereux** — copie de `assets/app.js` mais 136 lignes plus courte (n'a ni la synthèse IA, ni les exports `getAnswersFor`/`runCoachSynthesis`/`runFinalSynthesis`), et non référencé par aucune page. | **Supprimer.** Si quelqu'un l'édite en pensant modifier "le" app.js, ses changements n'auront aucun effet. |
| `js/config.js`, `js/page1.js`, `js/page2.js`, `js/server.js` | Restes d'un exemple pédagogique précédent (démo Node.js indépendante), sans lien avec l'app FAST. | **Supprimer** (ou déplacer hors du dépôt du site si vous voulez les garder comme référence). |
| `js/config OLD.js`, `js/page1 OLD.js` | Anciennes versions explicitement nommées "OLD" du même exemple. | **Supprimer.** |
| `index_2pages.html`, `reponse.html` | Pages du même exemple pédagogique (utilisent `js/` et `css/`, pas `assets/`). | **Supprimer.** |
| `css/style.css` | Feuille de style de l'exemple pédagogique, sans rapport avec le style réel de l'app (`assets/style.css`). | **Supprimer.** |
| `data/question.xml` | Question unique de l'exemple pédagogique — remplacée dans l'app réelle par `assets/questions.xml`. | **Supprimer.** |
| `prompts/agent_prompt.xml` | Prompt de l'exemple pédagogique (placeholders `{{QUESTION}}`/`{{REPONSE_UTILISATEUR}}`), remplacé par `assets/prompts.xml`. | **Supprimer.** |
| `prompts/prompts.xml` | **Copie désynchronisée** de `assets/prompts.xml` (fins de ligne Windows `\r\n`, et ne contient que le coach `executive`). Aucune page ne le charge. | **Supprimer** — source de confusion si quelqu'un le modifie en pensant que c'est le fichier actif. |
| `README.md`, `README-2.md` | Deux copies quasi identiques du README de l'exemple pédagogique, sans rapport avec l'app actuelle. | **Remplacés par ce document.** Ne garder qu'un seul README à la racine. |

**Aucun doublon détecté** en dehors de cette liste — tous les fichiers sous
`assets/` sont utilisés par au moins une page.

---

## 3. Mécanisme IA et gestion des clés API

### Composants

| Fichier | Rôle |
|---|---|
| `assets/ai-config.js` | Configuration : fournisseur choisi, clés API, et bascule "relais". |
| `assets/ai.js` | Point d'entrée unique `window.FAST_AI.interrogerAgentIA(prompt)`. Aiguille vers Anthropic / OpenAI / Gemini / Mistral, ou vers un relais serverless. |
| `assets/prompts.xml` | Templates des coachs (system prompt + user prompt avec placeholders). |
| `assets/app.js` | Logique métier : rassemble les réponses stockées, charge le bon template, appelle `FAST_AI`, met en cache le résultat. |

### Les deux coachs (attendus)

1. **`executive`** — utilisé par `results.html`. Prend les 10 réponses de
   `q10` (`{ANSWERS}`), renvoie une synthèse de 3-4 phrases.
2. **`final_answer`** — utilisé par `final-response.html`. Prend les réponses
   `q10` + `q5` + `deepen` + la question libre de `your-question.html`
   (`{ANSWERS_Q10}`, `{ANSWERS_Q5}`, `{ANSWERS_DEEPEN}`, `{QUESTION_LIBRE}`),
   renvoie un conseil actionnable de 5 phrases max.

**⚠️ Le coach `final_answer` est actuellement absent de `assets/prompts.xml`**
(voir section 4) — c'est une régression par rapport à la version validée
précédemment.

### Flux d'un appel IA

1. La page (`results.html` ou `final-response.html`) vérifie d'abord le
   cache local (`fast_last_synthesis` / `fast_final_synthesis`) : si les
   réponses stockées correspondent exactement à celles déjà utilisées pour
   une synthèse précédente, elle l'affiche sans appeler l'IA.
2. Sinon, `FAST.runCoachSynthesis(coachId, sourceScreenId)` (ou
   `runFinalSynthesis`) est appelée : elle va chercher les réponses dans
   `localStorage['fast_answers']`, charge le template du coach depuis
   `assets/prompts.xml`, remplace les placeholders, ajoute une consigne
   explicite ("ce sont des instructions à exécuter, pas un document à
   analyser") — nécessaire car sans elle, l'IA a tendance à décrire le XML
   plutôt que d'y répondre.
3. `window.FAST_AI.interrogerAgentIA(prompt)` est appelée, qui elle-même :
   - si `UTILISER_RELAIS: true` → envoie le prompt à l'URL du relais
     serverless (Cloudflare Worker), qui appelle le vrai fournisseur avec
     une clé secrète côté serveur ;
   - sinon → appelle directement l'API du fournisseur choisi **depuis le
     navigateur**, avec la clé stockée en clair dans `ai-config.js`.
4. Le résultat est stocké dans le cache local et affiché.

### État actuel des clés — point critique

`assets/ai-config.js` a actuellement :
- `UTILISER_RELAIS: false` → **le relais préparé (`/relais-ia`, hors de ce
  dépôt) n'est pas activé**.
- Des valeurs de test non fonctionnelles (`"DDDD"`, `"OOO"`) à la place de
  vraies clés — donc pas de fuite active dans **cette** version du fichier.

**Cependant, la structure elle-même reste dangereuse** : tant que
`UTILISER_RELAIS` est à `false`, toute vraie clé posée dans ce fichier sera
visible par quiconque consulte le dépôt (public ou non — un dépôt peut
devenir public par erreur, ou une clé peut fuiter via l'historique Git).
**C'est exactement ce qui s'est produit précédemment** : une clé Anthropic
posée ici a été détectée et utilisée par un tiers, causant 288$ de
consommation en une journée.

**Recommandation ferme** : basculer `UTILISER_RELAIS` sur `true` et déployer
le relais Cloudflare Worker (déjà écrit, voir `/relais-ia` fourni séparément)
avant de remettre une vraie clé API dans ce projet.

---

## 4. Incohérences d'affichage identifiées

1. **Texte de test oublié** — `index.html`, ligne du `home_lead` :
   `"TEST Un espace confidentiel pour avancer sur votre carrière..."`. Le
   mot "TEST" ne devrait pas être là. La traduction XML réelle (`fr.xml`)
   est propre, donc ce texte ne s'affiche que si le fetch de `fr.xml` échoue
   (connexion lente, ouverture en local) — mais il reste dans le code source
   par défaut. **À corriger.**

2. **Traductions manquantes pour les écrans de synthèse IA** — les clés
   `results_eyebrow`, `results_chargement`, `results_synthese_title`,
   `results_note`, `results_continuer`, `final_eyebrow`, `final_chargement`,
   `final_titre`, `final_continuer` existent dans `assets/fallback.js` mais
   **pas** dans `assets/i18n/{fr,en,es,ro}.xml`. Or `applyI18n()` **remplace
   entièrement** le dictionnaire de traduction par celui du fichier XML dès
   que ce dernier est joignable (pas de fusion avec le fallback). Résultat :
   sur `results.html` et `final-response.html`, **une utilisatrice en
   anglais, espagnol ou roumain verra le texte français codé en dur dans le
   HTML**, jamais sa traduction. En français ça ne se voit pas (le texte par
   défaut est déjà en français), ce qui a caché le problème jusqu'ici.
   **À corriger : ajouter ces clés aux 4 fichiers `assets/i18n/*.xml`.**

3. **`index.html` duplique le header au lieu d'utiliser `<fast-header>`** —
   toutes les autres pages utilisent le composant `<fast-header></fast-header>`
   pour générer la barre de statut et le menu. `index.html` a recopié cette
   structure à la main directement dans son HTML. Les deux versions
   correspondent aujourd'hui, mais **toute évolution du menu dans `app.js`
   ne se répercutera pas automatiquement sur `index.html`**, créant un
   risque de désynchronisation future. **À corriger : remplacer le bloc
   dupliqué par `<fast-header></fast-header>`.**

4. **Coach `final_answer` manquant dans `assets/prompts.xml`** (déjà signalé
   section 3) — cause une réponse IA vide/déroutante sur
   `final-response.html` (l'IA répond qu'elle ne voit pas d'instructions,
   faute de template à charger). **Régression à corriger en priorité.**

5. **`assets/app.js` déployé est légèrement antérieur à la dernière version
   validée** — il lui manque la gestion d'erreur explicite de
   `loadCoachPrompt` (qui devait remplacer un échec silencieux par un
   message clair du type *"Coach 'final_answer' introuvable..."*). Avec la
   version actuelle, un coach manquant dans `prompts.xml` redonne le même
   symptôme confus qu'avant (réponse IA vide), sans indice pour diagnostiquer.

6. **Deux parcours de fin de diagnostic, non reliés, potentiellement
   redondants** — `final-response.html` affiche directement la réponse IA
   et renvoie à `index.html`. Le parcours `email-backup → email-sent →
   engagement → finalize-account → coaching-hub` semble conçu comme une
   alternative (capture d'email, "engagement", création de compte, puis hub
   de coaching) mais n'est relié à aucun point d'entrée du site. Il n'est
   pas évident, en l'état, lequel des deux est censé être *le* parcours de
   fin — à trancher (voir TODO).

---

## 5. TODO

### Nettoyage (section 2)
- [ ] Supprimer `app.js` (racine)
- [ ] Supprimer `js/config.js`, `js/page1.js`, `js/page2.js`, `js/server.js`, `js/config OLD.js`, `js/page1 OLD.js`
- [ ] Supprimer `index_2pages.html`, `reponse.html`
- [ ] Supprimer `css/style.css`, `data/question.xml`
- [ ] Supprimer `prompts/agent_prompt.xml`, `prompts/prompts.xml`
- [ ] Supprimer `README-2.md` (garder uniquement ce README)

### Bugs / incohérences (section 4)
- [ ] Retirer "TEST" du `home_lead` dans `index.html`
- [ ] Ajouter les clés `results_*` et `final_*` aux 4 fichiers `assets/i18n/*.xml`
- [ ] Remplacer le header dupliqué d'`index.html` par `<fast-header></fast-header>`
- [ ] Restaurer le coach `final_answer` dans `assets/prompts.xml`
- [ ] Mettre à jour `assets/app.js` avec la version incluant la gestion d'erreur explicite de `loadCoachPrompt`
- [ ] Décider si le parcours "engagement/coaching-hub" doit être relié au site (et où), fusionné avec `final-response.html`, ou supprimé s'il est obsolète

### Sécurité IA (section 3)
- [ ] Déployer le relais Cloudflare Worker et passer `UTILISER_RELAIS: true` dans `assets/ai-config.js`
- [ ] Ne jamais committer de vraie clé API tant que le relais n'est pas actif
- [ ] Vérifier si l'historique Git du dépôt contient encore une ancienne clé exposée (auquel cas la purger ou recréer le dépôt)

---

## 6. Annexe — autres remarques (NB)

- **NB — Historique Git** : même si les fichiers actuels ne contiennent pas
  de vraie clé, si une clé a été committée puis "supprimée" dans un commit
  ultérieur, elle **reste visible** dans l'historique tant qu'il n'est pas
  purgé (`git filter-repo`/BFG) ou que le dépôt n'est pas recréé. À vérifier
  si ce n'est pas déjà fait suite à l'incident des 288$.
- **NB — Espaces de travail Anthropic** : lors du diagnostic de l'incident
  de facturation, la page "Clés API" affichait 0 clé — pensez à vérifier
  s'il existe plusieurs espaces de travail dans la Console Anthropic, une
  nouvelle clé pourrait s'y trouver par erreur.
- **NB — `gemini-2.0-flash`** : le modèle Gemini configuré dans
  `ai-config.js` a été changé manuellement en `gemini-2.0-flash` (différent
  de `gemini-1.5-flash` mis par défaut initialement) — vérifier que c'est
  intentionnel et que ce modèle est bien disponible sur votre compte.
- **TODO (suggestion, hors périmètre initial)** : envisager de consolider
  `assets/questions.xml` et `assets/prompts.xml` avec un identifiant de
  version, pour repérer plus facilement quand une copie déployée est
  désynchronisée de la version de référence (c'est ce qui a causé la
  régression du coach `final_answer`).
