# Site d'articles et d'éditos

Un site en HTML et CSS, en noir et blanc de bande dessinée : aplats d’encre, trames de points, cases et explosions. Les articles s’affichent en noir sur blanc, les éditos en blanc sur noir.

Le site publié ne contient que du HTML et du CSS : aucun JavaScript, aucun cookie, aucune police ou ressource chargée depuis un autre site. Un petit script, `build.mjs`, assemble les pages à partir des fichiers de `contenu/`. Il n'a besoin d'aucune installation en dehors de Node.js.

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
build.mjs             le script qui assemble le site dans dist/
```

## L'arborescence du site publié

```
/                         accueil
/publications/            tous les articles et tous les éditos
/articles/nom-du-fichier/ un article
/editos/nom-du-fichier/   un édito
/a-propos/                page fixe
/mentions-legales/        page fixe
/plan-du-site/            plan du site, généré automatiquement
/rss.xml  /sitemap.xml  /robots.txt
```

## Publier un texte

1. Créer un fichier `.html` dans `contenu/articles/` ou `contenu/editos/`. Son nom devient l'adresse de la page : minuscules sans accent, chiffres et tirets uniquement.
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
4. Enregistrer le fichier dans le dépôt. L'accueil, la page « Articles et éditos », le flux RSS et le plan du site se mettent à jour à la construction suivante.

Un lien vers une autre page du site s'écrit `href="{{racine}}a-propos/"`. Les apostrophes et les espaces avant `: ; ! ?` sont corrigées automatiquement selon l'usage français.

## Composer la page d'accueil

`contenu/accueil.json` liste les blocs dans l'ordre où ils s'affichent. Pour retirer un bloc sans le supprimer, lui ajouter `"actif": false`.

| Bloc          | Ce qu'il affiche                                             | Réglages                                             |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `une`         | Le texte le plus récent, en très grand                       | `publication` : `"articles/nom-du-fichier"` pour en choisir un autre |
| `duo`         | Les derniers articles et les derniers éditos, côte à côte    | `nombre` : combien de textes par colonne (3 par défaut) |
| `texte`       | Un texte libre, pris dans `contenu/blocs/`                   | `titre`, `fichier`, `ton` (`"blanc"` ou `"noir"`)    |
| `integration` | Le code fourni par un autre service (formulaire, vidéo, carte), inséré tel quel | `titre`, `fichier`, `ton`                            |

## Construire le site

```
node build.mjs               construit le site dans dist/
node build.mjs --brouillons  inclut aussi les brouillons
```

Le script s'arrête avec un message explicite si un en-tête est mal rempli ou si un lien interne ne mène nulle part.

Chez l'hébergeur : commande de construction `node build.mjs`, dossier à publier `dist`.

## Avant la mise en ligne

Le script rappelle à chaque construction ce qui reste à remplir :

- `site.config.json` : nom du site, description, adresse définitive, auteur, e-mail ;
- `contenu/pages/a-propos.html` et `contenu/pages/mentions-legales.html` ;
- `contenu/blocs/presentation.html` et `contenu/blocs/integration-exemple.html` ;
- les deux articles et les deux éditos de démonstration, à remplacer par de vrais textes.

Si un service extérieur est ajouté dans un bloc d'intégration (lettre d'information, vidéo, statistiques), mettre à jour le paragraphe « Données personnelles » des mentions légales.
