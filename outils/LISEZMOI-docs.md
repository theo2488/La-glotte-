# Écrire dans Google Docs, publier sur le site

Le kit relie un document Google à un cadre de texte du site : une enquête, un coup de gueule, une page ou un bloc de l'accueil. On écrit et on se corrige à plusieurs dans Google Docs ; une commande recopie le texte dans `contenu/`, puis `node build.mjs` reconstruit le site.

## 1. Écrire le document

Partir du modèle « Modèle — un texte pour les cahiers » rangé dans le dossier Drive *Les cahiers du fond de la glotte* (Fichier > Créer une copie). Le document suit cette forme :

```
Titre du texte                      ← style « Titre 1 »
Résumé : une ou deux phrases qui donnent envie de lire.
Type : enquête                      ← ou : coup de gueule, page, bloc
Date : 25/11/2026                   ← ou 2026-11-25
Signature : qui signe               ← facultatif
Brouillon : oui                     ← facultatif : le texte reste hors ligne
────────────────
Le texte, en paragraphes.
Intertitre                          ← style « Titre 2 » (« Titre 3 » pour une sous-partie)
```

Ce que le site reconnaît dans le texte :

| Dans Google Docs | Sur le site |
| --- | --- |
| Titre 2, Titre 3 | Intertitres |
| **Gras** | Chiffre ou mot surligné |
| *Italique* | Italique |
| ~~Barré~~ (Format > Texte > Barré) | Rature visible, comme sur la feuille |
| Liste à puces ou numérotée | Liste |
| Lien (Ctrl+K) | Lien |
| Tableau | Tableau |
| Paragraphe qui commence par `Citation :` | Citation en bulle |
| Paragraphe qui commence par `Marge :` | Note dans la marge (une source, un nom, un renvoi) |
| Maj+Entrée | Retour à la ligne dans le même paragraphe |
| Paragraphe qui commence par `Note :` | Rien : c'est une note interne, jamais publiée |

Les images ne passent pas : les ajouter à la main dans `public/`.

## Le code couleur

Chaque zone de texte a sa couleur. Dans le modèle Google Docs, chaque ligne est surlignée de la couleur de sa zone : on remplace le texte, on garde la couleur comme repère (elle ne part pas sur le site).

| Couleur | Zone | Dans le document | Sur le site |
| --- | --- | --- | --- |
| Jaune | Titre | Première ligne, style « Titre 1 » (ou précédée de `#`) | Le grand titre tagué |
| Orange | Résumé | `Résumé : …` | La bande collée sous le titre |
| Gris | Infos | `Type :`, `Date :`, `Signature :`, `Brouillon :` | La ligne « publié le … par … » |
| Bleu | Texte | Paragraphes en style normal | Le texte courant |
| Vert | Intertitre | Style « Titre 2 » (ou précédé de `##`) | Intertitre au feutre |
| Rose | Note de marge | `Marge : …` | Note rouge à côté du texte |
| Violet | Citation | `Citation : …` | Bulle |
| Turquoise | Sources | Intertitre « Nos sources » puis une liste | La liste des sources |

Pour voir ces zones en couleur sur le site lui-même :

```
node build.mjs --reperes            construit une copie du site dans reperes/, zones entourées et étiquetées
node build.mjs --reperes --brouillons   la même, avec les brouillons
npx serve reperes                   pour l'ouvrir dans le navigateur
```

Cette copie n'est jamais publiée (`reperes/` est ignoré par Git, et l'hébergeur ne publie que `dist/`). Elle contient aussi la page `code-couleur/` : le tableau ci-dessus et deux blocs prêts à copier-coller, l'un pour un document Google, l'autre pour un fichier du site.

Un texte collé tel quel dans un document Google, avec ses `#`, `##`, `-` et ses lignes « Résumé : », « Marge : », « Citation : », est reconnu sans autre mise en forme.

## 2. Relier le document au site

Deux façons de faire.

**Par le lien (automatique).** Dans Google Docs : Partager > Accès général > « Tous les utilisateurs qui ont le lien », en *lecteur*. Puis ajouter le document à `contenu/docs.json` :

```json
{
  "documents": [
    { "nom": "Cahier 1 — enquête", "doc": "https://docs.google.com/document/d/…/edit" },
    { "nom": "Présentation de l'accueil", "doc": "https://docs.google.com/document/d/…/edit", "fichier": "blocs/presentation.html" }
  ]
}
```

`fichier` est facultatif pour une enquête ou un coup de gueule : le nom vient du titre et le dossier du « Type ». Il sert à relier un document à un cadre précis, par exemple un bloc de l'accueil. `"actif": false` met une ligne en pause.

Ensuite :

```
node outils/docs.mjs        récupère tous les documents de la liste
node build.mjs              reconstruit le site
```

**Sans partage public (à la main).** Dans Google Docs : Fichier > Télécharger > Markdown (.md). Puis :

```
node outils/docs.mjs --fichier ~/Téléchargements/mon-texte.md
```

Options utiles : `--essai` affiche le résultat sans rien écrire ; `--vers editos/mon-texte` choisit le fichier ; `--doc <lien>` n'importe qu'un document.

## 3. Ce que le kit protège

- Chaque fichier importé garde le lien de son document (`doc:` dans son en-tête). Une nouvelle importation met à jour ce fichier-là, et seulement lui.
- Un fichier écrit à la main n'est jamais écrasé, sauf avec `--forcer`.
- Si le document ne suit pas le modèle (titre, résumé, type, date), le script dit ce qui manque, en français.
