# Les cahiers du fond de la glotte — mémoire du projet

Site statique (HTML/CSS, aucun JavaScript) d'un collectif qui écrit sur ce qui lui reste en travers de la gorge. `node build.mjs` construit `dist/` à partir de `contenu/`. Les textes peuvent venir de Google Docs via `node outils/docs.mjs` (voir `outils/LISEZMOI-docs.md`). Le README décrit le fonctionnement technique ; ce fichier garde ce qui ne se voit pas dans le code : les voix du collectif et la direction artistique.

Toujours écrire en français, avec la typographie française (le script corrige apostrophes et espaces avant `: ; ! ?`).

## Les profils d'écriture

Établis à partir de six photos de pages manuscrites (novembre 2026) et des notes de veille du dossier Drive « Les cahiers du fond de la glotte ». Les deux plumes manuscrites ne sont pas encore nommées : les appeler par leur nom dès que le collectif le donne.

### Plume A — « la cursive » (écriture penchée, stylo bleu, beaucoup de ratures)

L'interpellation. Elle parle *à* quelqu'un : un étudiant, un lycéen, « vous » puis « tu ».

- **Adresse directe** : « Et vous, les… ! Vous vous lancez bras ballants, mal armés, dans un système qui va vous broyer. » Passe du « vous » collectif au « tu » qui vise une personne.
- **Questions rhétoriques et ironie** : « Le système actuel, tu crois qu'il fonctionne ? » ; « Mais l'État vis-à-vis de l'éducation, tu crois qu'il prend des décisions fortes ? »
- **Slogans retournés** : reprend une injonction officielle pour la vider (« Faites des études ! », « Grimper l'ascenseur social, tout est permis »).
- **Registre parlé** : « tu brailles tes revendications », « tu gémis », « 900 balles pour aller à la fac », « j'suis », « le hic, c'est que… ».
- **Témoignage à la première personne** pour asseoir la légitimité : « J'suis un peu sensibilisé à ces sujets, j'suis moi-même un produit de l'université. » ; « Moi, j'aime bien analyser les chiffres qu'on me donne. »
- **Chiffres comme coups de poing** : un pourcentage, une somme (CVEC de 250 à 900 € l'année de licence, taux de chômage selon le diplôme), puis le retournement (« Mais le hic… »). Toujours vérifier et sourcer ces chiffres avant publication : sur les brouillons, ils sont notés de mémoire.
- **Chute courte** qui élargit : « Notre société est orientée vers le tertiaire. »
- **Écrit en se corrigeant** : phrases reprises, mots barrés, tournures resserrées. Les ratures font partie du style (voir la DA).

Rubrique naturelle : le **coup de gueule** argumenté, ou l'ouverture d'une **enquête**.

### Plume B — « les capitales » (écriture en majuscules d'imprimerie, régulière)

L'incantation. Un texte-manifeste, presque un poème en prose.

- **Anaphores** qui rythment : « C'EST LE TEMPS DE LA COLÈRE, DE LA RÉACTION…, DE SE LEVER… » ; « C'EST LE TEMPS DE LA COLÈRE, DE LA JUSTICE SOCIALE… » ; « LE TEMPS DE NOURRIR L'ARBRE ÉTERNEL… ».
- **Lexique soutenu et rare** : tocsin, linceul, outre-tombe, obscurantisme, désincarnées, terra preta.
- **Images organiques et corporelles** : poumons, mâchoire béante, bouches édentées, cri animal ; l'arbre (« LES RACINES SONT SAINES, LES BRANCHES POREUSES, LES FEUILLES TOMBÉES »).
- **Feu et apocalypse** : brasier, explosion, dernier râle, « UNE APOCALYPSE THÉRAPEUTIQUE » (oxymores assumés).
- **Jeux de mots et de sons** : « CULTURE DE LA TERRA PRETA FACE AUX CULTURES TOUTES-PRÊTES, TOUT PRÊTS-À-PORTER » ; « DES ACTIONS EXTRÊMES CONTRE LES EXTRÊMES… ».
- **Indignation morale et « nous » de responsabilité** : « CAR NOUS DEVONS ÊTRE TENUS RESPONSABLES DE NOS ERREURS ET MALVEILLANCES » ; écriture inclusive simple (« TOUS ET TOUTES »).
- **Références en marge** : un nom de sociologue noté à côté du texte (« (PASSERON) »). Sur le site, ces renvois vont dans une note de marge.
- Phrases longues, ponctuées par des phrases-sentences très courtes (« CAR ILS LE MÉRITENT. »).

Rubrique naturelle : le **coup de gueule** lyrique, les ouvertures et les chutes, les textes de présentation.

Garde-fou de publication : la Plume B manie des images violentes (« brasier sanglant », « goûteront le pavé », bouches « édentées »). Les garder comme images visant un système, des idées ou des décisions, jamais une personne ou un groupe nommément désigné ; c'est aussi ce qui les met à l'abri en droit de la presse.

### La voix de veille — le collectif qui prend des notes

Les notes du dossier Drive (Thème 1) : listes de contexte, questions ouvertes (« Et nous on se pose plein de questions »), bibliographie commentée, chiffres relevés avec leur lien, jugements à chaud en langage familier (« Ptdr », « très à droite »). C'est la matière première des **enquêtes** : sur le site, on garde les chiffres, les sources et les questions ; on retire les insultes, on garde l'ironie.

### Règles communes

- Un cahier part d'une question qu'on entend partout, et ne la tranche pas d'avance.
- On dit « on » et « nous » (la Plume A passe au « tu » pour interpeller).
- Enquête = faits sourcés, section « Nos sources » à la fin. Coup de gueule = ce qu'on en pense, sans détour.
- La colère vise des décisions, des rapports, des systèmes ; pas des personnes.
- Ne jamais publier une donnée personnelle (nom, numéro de téléphone) vue sur un brouillon ou une photo.

## La direction artistique (d'après les photos)

Des feuilles volantes posées sur une table en bois, sous une lampe : copies simples à grands interlignes bleu-gris et marge rouge, encre bleue de stylo bille, mots barrés, bords arrachés, gribouillis dans la marge (lettres creuses, visage, boucles). Le graffiti y est présent comme griffonnage au Bic, pas comme bombe.

- Encre : bleu stylo bille ; rouge réservé à la marge et aux corrections.
- Papier : blanc cassé, réglure horizontale bleu-gris, marge rouge à gauche.
- Les cadres de texte sont des feuilles : légèrement de travers, ombre portée, un bord arraché.
- Ratures visibles (`<del>`), notes de marge (`<aside class="marge">`), soulignés à main levée.
- Deux écritures : cursive penchée (Plume A, enquêtes) et capitales d'imprimerie (Plume B, coups de gueule).
