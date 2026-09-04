# Exemple statique (GitHub Pages) — question → agent IA → réponse

Version du même exemple, adaptée pour être hébergée **entièrement gratuitement
sur GitHub Pages**, sans backend. Toute la logique (lecture des fichiers XML,
appel à l'IA, génération des fichiers de résultat) se fait dans le navigateur.

## Différences avec la version serveur (Node)

| | Version serveur (Node) | Version statique (GitHub Pages) |
|---|---|---|
| Où tourne le code | Sur un serveur (Node.js) | Dans le navigateur de l'utilisateur |
| Appel à l'IA | Fait par le serveur (clé cachée) | Fait par le navigateur (**clé visible**) |
| Stockage XML/TXT | Écrit automatiquement sur le serveur | **Téléchargé** dans le navigateur de l'utilisateur |
| Hébergement | Nécessite un service qui exécute Node | GitHub Pages suffit (gratuit) |

⚠️ **Important** : sur cette version, la clé API (`js/config.js`) est visible
par quiconque ouvre le code source de la page. Ne mettez jamais une clé de
production active dans un dépôt GitHub public. Pour un vrai déploiement,
utilisez plutôt une clé à usage limité/de test, ou passez par une fonction
serverless qui cache la clé (évolution possible de cet exemple).

## Arborescence

```
exemple-site-github-pages/
├── index.html              ← PAGE 1
├── reponse.html             ← PAGE 2
├── css/style.css
├── js/
│   ├── config.js            ← chemins des XML + clé API à renseigner
│   ├── page1.js              ← question, appel IA, génération XML/TXT
│   └── page2.js              ← affichage du résultat
├── data/
│   └── question.xml          ← question éditable
└── prompts/
    └── agent_prompt.xml       ← prompt de l'agent, éditable
```

## Déployer sur GitHub Pages

1. Créez un dépôt GitHub (public ou privé selon votre plan) et poussez-y
   tout le contenu de ce dossier, **sans sous-dossier `public/`** — les
   fichiers doivent être à la racine du dépôt (ou dans un dossier `/docs`,
   au choix).
2. Ouvrez `js/config.js` et remplacez `REMPLACEZ_PAR_VOTRE_CLE_API` par
   votre clé API (ou laissez tel quel pour tester sans appel IA réel — voir
   plus bas).
3. Sur GitHub : **Settings → Pages → Source**, choisissez la branche
   (`main`) et le dossier (`/root` ou `/docs` selon votre choix à l'étape 1).
4. GitHub vous donne une adresse du type
   `https://votre-utilisateur.github.io/votre-depot/`. Ouvrez-la : la page 1
   doit afficher la question.

## Choisir le fournisseur IA (Anthropic, OpenAI, Gemini, Mistral)

Un site statique n'a pas accès à de vraies variables d'environnement
(`process.env`) — c'est une limite du navigateur, pas de ce projet. Le choix
se fait donc dans `js/config.js` :

```js
FOURNISSEUR_IA: "anthropic",   // "anthropic" | "openai" | "gemini" | "mistral"
```

Renseignez ensuite la clé API et le modèle correspondants dans le même
fichier (`ANTHROPIC`, `OPENAI`, `GEMINI`, `MISTRAL`). Le reste du site
(stockage XML/TXT, page 2) fonctionne à l'identique quel que soit le
fournisseur choisi — seule la fonction d'appel change dans `js/page1.js`.

⚠️ **CORS** : Anthropic autorise explicitement les appels directs depuis un
navigateur (en-tête `anthropic-dangerous-direct-browser-access`) et Gemini
fonctionne aussi en direct. OpenAI et Mistral, en revanche, ne renvoient
généralement pas les en-têtes CORS nécessaires : un appel direct depuis
GitHub Pages a de bonnes chances d'échouer avec ces deux fournisseurs. Si
c'est le cas, il faudra passer par une petite fonction serverless relais
(voir la section suivante) qui elle n'est pas soumise à cette contrainte.

## Tester sans clé API

Si `ANTHROPIC_API_KEY` n'est pas remplie, l'appel à `interrogerAgentIA()`
échouera avec un message d'erreur affiché à l'écran — cela permet de vérifier
que le chargement des XML fonctionne avant de configurer une vraie clé.

## Pour aller plus loin (garder la clé cachée)

Si vous voulez migrer vers la solution où la clé API n'est pas exposée,
la structure de fichiers reste identique : seule la fonction
`interrogerAgentIA()` dans `js/page1.js` change, pour appeler une petite
fonction serverless (par exemple un Cloudflare Worker ou une fonction
Netlify) au lieu d'appeler directement `api.anthropic.com`. Cette fonction,
elle, garde la clé API secrète côté serveur. Dites-le-moi si vous voulez
cet exemple complémentaire.
