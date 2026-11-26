# Les cahiers du fond de la glotte

Ce qui nous reste en travers de la gorge, on le met par écrit : des enquêtes chiffrées et des coups de gueule. Un site en HTML et CSS, façon graffiti des années 90 sur cahier d’écolier, en noir et blanc, avec du rouge en seconde encre. Les enquêtes s’affichent en noir sur blanc sur une réglure de cahier, les coups de gueule en blanc sur noir.

Le site publié ne contient que du HTML et du CSS : aucun JavaScript, aucun cookie, aucune police ou ressource chargée depuis un autre site : les polices sont hébergées avec le site. Un petit script, `build.mjs`, assemble les pages à partir des fichiers de `contenu/`. Il n'a besoin d'aucune installation en dehors de Node.js.

## La voix des cahiers

Le site parle comme les notes de veille dont il est parti (dossier Drive « Les cahiers du fond de la glotte ») :

- **Un cahier, une question.** Chaque thème part d'une question qu'on entend partout (« Y a-t-il trop d'étudiants en France ? ») et ne la tranche pas d'avance.
- **On dit « on » et « nous ».** C'est un collectif qui écrit, pas une rédaction neutre.
- **Des chiffres, toujours sourcés.** Chaque donnée renvoie au rapport, à la statistique ou à l'article d'où elle sort. Chaque texte finit par une section « Nos sources ».
- **Deux voix séparées.** Une *enquête* (dossier `contenu/articles/`) rapporte ce qu'on a trouvé, chiffres à l'appui. Un *coup de gueule* (dossier `contenu/editos/`) dit ce qu'on en pense, sans détour.
- **Une langue parlée, directe et un peu crade.** Phrases courtes, questions posées au lecteur, ironie bienvenue. La colère vise des idées, des décisions et des rapports, pas des personnes.
- **Des titres qui interpellent.** Une question, une formule qui claque ; le résumé donne envie de lire la suite en une ou deux phrases.

Les deux textes du Thème 1 servent de modèles : `contenu/articles/y-a-t-il-trop-d-etudiants-en-france.html` pour une enquête, `contenu/editos/frais-d-inscription-fois-cinq.html` pour un coup de gueule. Les deux tutoriels `publier-un-texte.html` et `mettre-en-forme-un-texte.html` restent dans le dépôt comme aide-mémoire technique, en brouillon : ils ne sont pas publiés.

## Écrire depuis Google Docs

Le dossier `outils/` contient un kit qui relie des documents Google aux cadres de texte du site (enquêtes, coups de gueule, pages, blocs de l'accueil) : `node outils/docs.mjs`. Mode d'emploi : [`outils/LISEZMOI-docs.md`](outils/LISEZMOI-docs.md). Un modèle de document est rangé dans le dossier Drive du projet.

## Ce que contient le dépôt

```
site.config.json      réglages du site : nom, description, adresse, auteur, e-mail
contenu/
  accueil.json        les blocs de la page d'accueil, dans l'ordre d'affichage
  articles/           un fichier par article
  editos/             un fichier par édito
  pages/              les pages fixes (à propos, mentions légales)
  blocs/              les textes et intégrations utilisés par la page d'accueil
gabarits/page.html    le squelette commun à toutes les pages (en-tête, menu, pied de page)
public/               les fichiers copiés tels quels : styles.css, favicon.svg, images
  crayon/             les motifs dessinés (explosions, hachures, taches, gribouillis, grain)
  polices/            les trois polices du site et leurs licences (Sedgwick Ave Display, Permanent Marker, Special Elite)
build.mjs             le script qui assemble le site dans dist/
outils/docs.mjs       le kit qui importe des documents Google Docs dans contenu/
contenu/docs.json     la liste des documents Google reliés au site
```

## L'arborescence du site publié

```
/                         accueil
/publications/            « Les cahiers » : toutes les enquêtes et tous les coups de gueule
/articles/nom-du-fichier/ une enquête
/editos/nom-du-fichier/   un coup de gueule
/a-propos/                page fixe
/mentions-legales/        page fixe
/plan-du-site/            plan du site, généré automatiquement
/rss.xml  /sitemap.xml  /robots.txt
```

## Publier un texte

1. Créer un fichier `.html` dans `contenu/articles/` (une enquête) ou `contenu/editos/` (un coup de gueule). Son nom devient l'adresse de la page : minuscules sans accent, chiffres et tirets uniquement.
2. Commencer le fichier par l'en-tête :

   ```html
   <!--
   titre: Le titre du texte
   resume: Une phrase qui donne envie de lire la suite.
   date: 2026-11-24
   -->
   ```

   Lignes facultatives : `auteur: ...`, `maj: 2026-12-01` (date de mise à jour), `brouillon: oui` (le texte reste hors ligne).
3. Écrire le texte en dessous, en HTML : `<p>` pour un paragraphe, `<h2>` pour un intertitre, `<ul>` ou `<ol>` pour une liste, `<blockquote>` pour une citation. L'article « Mettre en forme un texte » sert de modèle.
4. Enregistrer le fichier dans le dépôt. L'accueil, la page « Les cahiers », le flux RSS et le plan du site se mettent à jour à la construction suivante.

Un lien vers une autre page du site s'écrit `href="{{racine}}a-propos/"`. Les apostrophes et les espaces avant `: ; ! ?` sont corrigées automatiquement selon l'usage français.

## Composer la page d'accueil

`contenu/accueil.json` liste les blocs dans l'ordre où ils s'affichent. Pour retirer un bloc sans le supprimer, lui ajouter `"actif": false`.

| Bloc          | Ce qu'il affiche                                             | Réglages                                             |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `une`         | Le texte le plus récent, en très grand                       | `publication` : `"articles/nom-du-fichier"` pour en choisir un autre |
| `duo`         | Les dernières enquêtes et les derniers coups de gueule, côte à côte    | `nombre` : combien de textes par colonne (3 par défaut) |
| `texte`       | Un texte libre, pris dans `contenu/blocs/`                   | `titre`, `fichier`, `ton` (`"blanc"` ou `"noir"`)    |
| `integration` | Le code fourni par un autre service (formulaire, vidéo, carte), inséré tel quel | `titre`, `fichier`, `ton`                            |

## Construire le site

```
node build.mjs               construit le site dans dist/
node build.mjs --brouillons  inclut aussi les brouillons
node build.mjs --reperes     construit dans reperes/ une copie où chaque zone de texte est entourée de sa couleur (jamais publiée)
```

Le script s'arrête avec un message explicite si un en-tête est mal rempli ou si un lien interne ne mène nulle part.

Chez l'hébergeur : commande de construction `node build.mjs`, dossier à publier `dist`.

## Avant la mise en ligne

Le script rappelle à chaque construction ce qui reste à remplir :

- `site.config.json` : nom du site, description, adresse définitive, auteur, e-mail ;
- `contenu/pages/a-propos.html` et `contenu/pages/mentions-legales.html` ;
- `contenu/blocs/presentation.html` et `contenu/blocs/integration-exemple.html` ;
- relire et valider les deux textes du Thème 1, écrits à partir des notes du dossier Drive.

Si un service extérieur est ajouté dans un bloc d'intégration (lettre d'information, vidéo, statistiques), mettre à jour le paragraphe « Données personnelles » des mentions légales.
