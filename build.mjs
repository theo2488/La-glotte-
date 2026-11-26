// Assemble le site : lit contenu/, gabarits/ et public/, puis écrit le site prêt à publier dans dist/.
// Aucune dépendance à installer : seul Node.js est nécessaire.
//
//   node build.mjs               construit le site
//   node build.mjs --brouillons  inclut aussi les textes marqués « brouillon: oui »

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const AVEC_BROUILLONS = process.argv.includes('--brouillons');
// Mode repères : le site est construit dans reperes/ (jamais publié), avec chaque zone de texte
// entourée de sa couleur. Sert à voir où va chaque texte qu'on colle dans un document.
const AVEC_REPERES = process.argv.includes('--reperes');
const SORTIE = path.join(RACINE, AVEC_REPERES ? 'reperes' : 'dist');

// Le code couleur des zones de texte. Les couleurs elles-mêmes sont dans public/styles.css
// (classes .zone-…) et dans le modèle Google Docs ; voir outils/LISEZMOI-docs.md.
const ZONES = [
  { cle: 'titre', nom: 'Titre', couleur: 'jaune', doc: 'La première ligne, en style « Titre 1 » (ou précédée de « # »).', site: 'Le grand titre tagué, et le titre dans les listes de l’accueil.' },
  { cle: 'resume', nom: 'Résumé', couleur: 'orange', doc: 'La ligne « Résumé : … », une ou deux phrases.', site: 'La bande collée sous le titre, et le résumé dans les listes.' },
  { cle: 'infos', nom: 'Infos', couleur: 'gris', doc: 'Les lignes « Type : », « Date : », « Signature : », « Brouillon : ».', site: 'La ligne « publié le … par … », et le classement en enquête ou coup de gueule.' },
  { cle: 'texte', nom: 'Texte', couleur: 'bleu', doc: 'Les paragraphes, en style normal. Gras = surligné, barré = rature.', site: 'Le texte courant.' },
  { cle: 'intertitre', nom: 'Intertitre', couleur: 'vert', doc: 'Une ligne en style « Titre 2 » (ou précédée de « ## »).', site: 'Un intertitre au feutre, souligné d’un gribouillis.' },
  { cle: 'marge', nom: 'Note de marge', couleur: 'rose', doc: 'Un paragraphe qui commence par « Marge : ».', site: 'Une note rouge, de travers, à côté du texte.' },
  { cle: 'citation', nom: 'Citation', couleur: 'violet', doc: 'Un paragraphe qui commence par « Citation : » (ou par « > »).', site: 'Une bulle.' },
  { cle: 'sources', nom: 'Sources', couleur: 'turquoise', doc: 'L’intertitre « Nos sources », suivi d’une liste de liens.', site: 'La liste des sources, en fin de texte.' },
];

// Les deux familles de textes. Le ton (blanc ou noir) et la voix (typographie) en découlent.
// Les dossiers gardent leur nom technique (articles, editos) ; les libellés affichés sont ceux du site :
// les enquêtes fouillent les chiffres, les coups de gueule crachent ce qui coince.
const TYPES = {
  article: {
    dossier: 'articles',
    nom: 'Enquête',
    pluriel: 'Enquêtes',
    publie: 'Enquête publiée',
    aucun: 'Pas encore d’enquête dans ce cahier.',
    tous: 'Toutes les enquêtes',
    ton: 'blanc',
    schema: 'Article',
  },
  edito: {
    dossier: 'editos',
    nom: 'Coup de gueule',
    pluriel: 'Coups de gueule',
    publie: 'Coup de gueule poussé',
    aucun: 'Pas encore de coup de gueule. Ça ne va pas durer.',
    tous: 'Tous les coups de gueule',
    ton: 'noir',
    schema: 'OpinionNewsArticle',
  },
};

const CAHIERS = 'Les cahiers';

const MENU = [
  { chemin: '', libelle: 'Accueil' },
  { chemin: 'publications', libelle: CAHIERS },
  { chemin: 'a-propos', libelle: 'À propos' },
];

const TONS = ['blanc', 'noir'];

// Erreur due au contenu (fichier mal rempli) : affichée sans jargon, puis le build s'arrête.
class ErreurContenu extends Error {}

// ---------- Outils ----------

function echapper(texte) {
  return String(texte)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const formatDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function dateFr(date) {
  // « 1er novembre », pas « 1 novembre ».
  return formatDate.format(date).replace(/^1 /, '1er ');
}

// Typographie française : apostrophes courbes, espaces insécables avant : ; ! ? et à l'intérieur des guillemets.
function typographier(texte) {
  return texte
    .replace(/(\p{L})'(?=[\p{L}«])/gu, '$1’')
    .replace(/ ([;!?])/g, ' $1')
    .replace(/ :/g, ' :')
    .replace(/« /g, '« ')
    .replace(/ »/g, ' »');
}

// Même traitement pour du HTML : les balises et les exemples de code restent intacts.
function typographierHtml(html) {
  let protege = 0;
  return html
    .split(/(<[^>]*>)/)
    .map((morceau) => {
      if (morceau.startsWith('<')) {
        const balise = morceau.match(/^<(\/?)(pre|code|kbd|samp|script|style)\b/i);
        if (balise) protege = Math.max(0, protege + (balise[1] ? -1 : 1));
        return morceau;
      }
      return protege > 0 ? morceau : typographier(morceau);
    })
    .join('');
}

// La section « Nos sources » (l'intertitre et la liste qui le suit) forme une zone à part.
function marquerSources(html) {
  return html.replace(
    /<h2>((?:nos )?sources)<\/h2>\s*(<(ul|ol)>[\s\S]*?<\/\3>)/i,
    '<div class="sources">\n<h2>$1</h2>\n$2\n</div>',
  );
}

function lireDate(valeur, fichier, cle) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? new Date(`${valeur}T00:00:00Z`) : new Date(NaN);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== valeur) {
    throw new ErreurContenu(`${fichier} : « ${cle}: ${valeur} » n'est pas une date valide (format attendu : 2026-11-25).`);
  }
  return date;
}

function lireOuiNon(valeur, fichier, cle) {
  if (valeur === undefined || valeur === 'non') return false;
  if (valeur === 'oui') return true;
  throw new ErreurContenu(`${fichier} : « ${cle}: ${valeur} » doit valoir « oui » ou « non ».`);
}

// En-tête d'un fichier de contenu : un commentaire HTML en haut du fichier, une ligne « clé: valeur » par information.
function lireEntete(source, fichier) {
  const trouve = source.match(/^\s*<!--([\s\S]*?)-->/);
  if (!trouve) {
    throw new ErreurContenu(`${fichier} : il manque l'en-tête <!-- ... --> tout en haut du fichier.`);
  }
  const meta = {};
  for (const brute of trouve[1].split('\n')) {
    const ligne = brute.trim();
    if (!ligne) continue;
    const separateur = ligne.indexOf(':');
    if (separateur === -1) {
      throw new ErreurContenu(`${fichier} : ligne d'en-tête illisible « ${ligne} » (attendu « clé: valeur »).`);
    }
    meta[ligne.slice(0, separateur).trim().toLowerCase()] = ligne.slice(separateur + 1).trim();
  }
  return { meta, corps: source.slice(trouve[0].length).trim() };
}

async function lireJson(relatif) {
  const source = await readFile(path.join(RACINE, relatif), 'utf8');
  try {
    return JSON.parse(source);
  } catch (erreur) {
    throw new ErreurContenu(`${relatif} : le fichier n'est pas un JSON valide (${erreur.message}).`);
  }
}

async function lireHtmlDe(dossier) {
  const complet = path.join(RACINE, dossier);
  if (!existsSync(complet)) return [];
  const noms = (await readdir(complet)).filter((nom) => nom.endsWith('.html')).sort();
  const fichiers = [];
  for (const nom of noms) {
    const identifiant = nom.replace(/\.html$/, '');
    const relatif = `${dossier}/${nom}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identifiant)) {
      throw new ErreurContenu(
        `${relatif} : le nom du fichier sert d'adresse à la page. Il ne doit contenir que des minuscules sans accent, des chiffres et des tirets.`,
      );
    }
    const source = await readFile(path.join(complet, nom), 'utf8');
    fichiers.push({ identifiant, relatif, ...lireEntete(source, relatif) });
  }
  return fichiers;
}

function exiger(meta, cles, fichier) {
  for (const cle of cles) {
    if (!meta[cle]) throw new ErreurContenu(`${fichier} : l'en-tête doit contenir une ligne « ${cle}: ... ».`);
  }
}

// ---------- Lecture du contenu ----------

async function lireSite() {
  const site = await lireJson('site.config.json');
  for (const cle of ['nom', 'description', 'url', 'auteur', 'email', 'langue']) {
    if (typeof site[cle] !== 'string' || !site[cle].trim()) {
      throw new ErreurContenu(`site.config.json : la clé « ${cle} » est obligatoire.`);
    }
  }
  let adresse;
  try {
    adresse = new URL(site.url);
  } catch {
    throw new ErreurContenu(`site.config.json : « url » doit être une adresse complète, par exemple https://mon-site.pages.dev.`);
  }
  site.url = site.url.replace(/\/+$/, '');
  site.description = typographier(site.description);
  // Chemin de base du site sur son domaine : « / » en général, « /nom-du-depot/ » sur certaines offres.
  site.base = adresse.pathname.endsWith('/') ? adresse.pathname : `${adresse.pathname}/`;
  site.hote = adresse.hostname;
  site.rgpd = lireRgpd(site);
  return site;
}

// Les réglages « rgpd » de site.config.json : qui répond des données, qui héberge, et quels services
// extérieurs le site a le droit de charger. La page « Données personnelles » et les mentions légales
// sont remplies à partir d'eux, et le contrôle de fin de construction s'appuie sur la liste des services.
function lireRgpd(site) {
  const brut = site.rgpd ?? {};
  const origine = 'site.config.json, « rgpd »';
  const texte = (valeur, cle, defaut) => {
    if (valeur === undefined && defaut !== undefined) return defaut;
    if (typeof valeur !== 'string' || !valeur.trim()) throw new ErreurContenu(`${origine} : « ${cle} » est obligatoire.`);
    return valeur.trim();
  };
  const hebergeur = brut.hebergeur ?? {};
  const services = brut.services ?? [];
  if (!Array.isArray(services)) throw new ErreurContenu(`${origine} : « services » doit être une liste.`);
  return {
    responsable: texte(brut.responsable, 'responsable'),
    contact: texte(brut.contact, 'contact', site.email),
    hebergeur: {
      nom: texte(hebergeur.nom, 'hebergeur.nom'),
      adresse: texte(hebergeur.adresse, 'hebergeur.adresse'),
      journaux: texte(hebergeur.journaux, 'hebergeur.journaux'),
      // Facultatif : où partent les journaux quand l'hébergeur est hors de l'Union européenne.
      transfert: texte(hebergeur.transfert, 'hebergeur.transfert', ''),
      politique: texte(hebergeur.politique, 'hebergeur.politique', ''),
    },
    conservationMessages: texte(brut.conservation_messages, 'conservation_messages'),
    majIso: texte(brut.mise_a_jour, 'mise_a_jour'),
    maj: lireDate(texte(brut.mise_a_jour, 'mise_a_jour'), 'site.config.json', 'rgpd.mise_a_jour'),
    services: services.map((service, index) => {
      const ici = `${origine}, service n° ${index + 1}`;
      for (const cle of ['nom', 'finalite', 'donnees', 'politique']) {
        if (typeof service[cle] !== 'string' || !service[cle].trim()) {
          throw new ErreurContenu(`${ici} : « ${cle} » est obligatoire (nom du service, à quoi il sert, ce qu'il reçoit, adresse de sa politique de confidentialité).`);
        }
      }
      if (!/^https:\/\//.test(service.politique)) throw new ErreurContenu(`${ici} : « politique » doit être une adresse complète en https://.`);
      if (!Array.isArray(service.hotes) || service.hotes.length === 0 || service.hotes.some((h) => typeof h !== 'string' || !/^[a-z0-9.-]+$/.test(h))) {
        throw new ErreurContenu(`${ici} : « hotes » doit lister les noms de domaine chargés par le site, par exemple ["player.exemple.org"].`);
      }
      return { ...service, pays: typeof service.pays === 'string' ? service.pays : '' };
    }),
  };
}

async function lirePublications(type) {
  const { dossier } = TYPES[type];
  const publications = [];
  for (const { identifiant, relatif, meta, corps } of await lireHtmlDe(`contenu/${dossier}`)) {
    exiger(meta, ['titre', 'resume', 'date'], relatif);
    if (lireOuiNon(meta.brouillon, relatif, 'brouillon') && !AVEC_BROUILLONS) continue;
    const date = lireDate(meta.date, relatif, 'date');
    const maj = meta.maj ? lireDate(meta.maj, relatif, 'maj') : null;
    publications.push({
      type,
      identifiant,
      chemin: `${dossier}/${identifiant}`,
      titre: typographier(meta.titre),
      resume: typographier(meta.resume),
      auteur: meta.auteur ?? null,
      date,
      dateIso: meta.date,
      maj,
      majIso: meta.maj ?? null,
      corps: marquerSources(typographierHtml(corps)),
    });
  }
  return trier(publications);
}

function trier(publications) {
  return [...publications].sort((a, b) => b.date - a.date || a.titre.localeCompare(b.titre, 'fr'));
}

async function lirePages() {
  const pages = [];
  for (const { identifiant, relatif, meta, corps } of await lireHtmlDe('contenu/pages')) {
    exiger(meta, ['titre', 'resume'], relatif);
    pages.push({
      identifiant,
      chemin: identifiant,
      titre: typographier(meta.titre),
      resume: typographier(meta.resume),
      corps: typographierHtml(corps),
    });
  }
  return pages;
}

async function lireBloc(fichier, origine) {
  if (typeof fichier !== 'string' || !/^[a-z0-9-]+\.html$/.test(fichier)) {
    throw new ErreurContenu(`${origine} : « fichier » doit être le nom d'un fichier de contenu/blocs, par exemple "presentation.html".`);
  }
  const complet = path.join(RACINE, 'contenu', 'blocs', fichier);
  if (!existsSync(complet)) throw new ErreurContenu(`${origine} : le fichier contenu/blocs/${fichier} n'existe pas.`);
  return (await readFile(complet, 'utf8')).trim();
}

// ---------- Morceaux de page ----------

function rendreElement(publication, niveau) {
  return `<li class="element">
<p class="element-meta"><time datetime="${publication.dateIso}">${dateFr(publication.date)}</time></p>
<h${niveau} class="element-titre"><a href="{{racine}}${publication.chemin}/">${echapper(publication.titre)}</a></h${niveau}>
<p class="element-resume">${echapper(publication.resume)}</p>
</li>`;
}

function rendreListe(publications, niveau, messageVide) {
  if (publications.length === 0) return `<p class="vide">${messageVide}</p>`;
  return `<ul class="liste">\n${publications.map((p) => rendreElement(p, niveau)).join('\n')}\n</ul>`;
}

// Articles à gauche sur blanc, éditos à droite sur noir.
function rendreDuo(parType, { nombre = null, niveau, lienVersTout }) {
  const colonnes = Object.entries(TYPES).map(([type, infos]) => {
    const toutes = parType[type];
    const visibles = nombre ? toutes.slice(0, nombre) : toutes;
    const vide = infos.aucun;
    const suite =
      lienVersTout && toutes.length > 0
        ? `\n<p class="duo-suite"><a href="{{racine}}publications/#${infos.dossier}">${infos.tous}</a></p>`
        : '';
    return `<section class="duo-colonne ton-${infos.ton} voix-${type}" id="${infos.dossier}" aria-labelledby="titre-${infos.dossier}">
<h${niveau} class="duo-titre" id="titre-${infos.dossier}">${infos.pluriel}</h${niveau}>
${rendreListe(visibles, niveau + 1, vide)}${suite}
</section>`;
  });
  return `<div class="duo">\n${colonnes.join('\n')}\n</div>`;
}

function rendreFil(etapes, courant) {
  const liens = etapes.map(
    ({ chemin, libelle }) => `<li><a href="{{racine}}${chemin ? `${chemin}/` : ''}">${echapper(libelle)}</a></li>`,
  );
  return `<nav class="fil" aria-label="Fil d’Ariane">
<ol>
${liens.join('\n')}
<li aria-current="page">${echapper(courant)}</li>
</ol>
</nav>`;
}

function rendreMenu(cheminCourant) {
  return MENU.map(({ chemin, libelle }) => {
    const courant = chemin === cheminCourant ? ' aria-current="page"' : '';
    return `<li><a href="{{racine}}${chemin ? `${chemin}/` : ''}"${courant}>${libelle}</a></li>`;
  }).join('\n');
}

// ---------- Blocs de la page d'accueil ----------
// Chaque bloc listé dans contenu/accueil.json est rendu par la fonction du même nom.

const BLOCS = {
  // Le texte le plus récent (ou celui désigné par « publication »), en très grand.
  une(bloc, { toutes, site }, origine) {
    let publication = toutes[0];
    if (bloc.publication) {
      publication = toutes.find((p) => p.chemin === bloc.publication);
      if (!publication) {
        throw new ErreurContenu(`${origine} : la publication « ${bloc.publication} » est introuvable (exemple attendu : "articles/mon-article").`);
      }
    }
    if (!publication) {
      return `<section class="bande une ton-blanc voix-article">
<p class="une-titre">${echapper(site.nom)}</p>
<p class="une-resume">${echapper(site.description)}</p>
</section>`;
    }
    const infos = TYPES[publication.type];
    return `<section class="bande une ton-${infos.ton} voix-${publication.type}">
<p class="une-meta">${infos.nom} du <time datetime="${publication.dateIso}">${dateFr(publication.date)}</time></p>
<h2 class="une-titre"><a href="{{racine}}${publication.chemin}/">${echapper(publication.titre)}</a></h2>
<p class="une-resume">${echapper(publication.resume)}</p>
</section>`;
  },

  // Les derniers articles et les derniers éditos, côte à côte.
  duo(bloc, { parType }, origine) {
    const nombre = bloc.nombre ?? 3;
    if (!Number.isInteger(nombre) || nombre < 1) {
      throw new ErreurContenu(`${origine} : « nombre » doit être un entier supérieur à zéro.`);
    }
    return rendreDuo(parType, { nombre, niveau: 2, lienVersTout: true });
  },

  // Un texte libre, mis en forme comme le reste du site.
  async texte(bloc, contexte, origine) {
    const html = typographierHtml(await lireBloc(bloc.fichier, origine));
    return `<section class="bande bloc ton-${lireTon(bloc, origine)}">
${rendreTitreBloc(bloc)}<div class="texte">
${html}
</div>
</section>`;
  },

  // Un contenu venu d'un autre service (formulaire, vidéo, carte) : le code est inséré tel quel.
  async integration(bloc, contexte, origine) {
    const html = await lireBloc(bloc.fichier, origine);
    return `<section class="bande bloc ton-${lireTon(bloc, origine)}">
${rendreTitreBloc(bloc)}<div class="integration">
${html}
</div>
</section>`;
  },
};

function lireTon(bloc, origine) {
  const ton = bloc.ton ?? 'blanc';
  if (!TONS.includes(ton)) throw new ErreurContenu(`${origine} : « ton » doit valoir "blanc" ou "noir".`);
  return ton;
}

function rendreTitreBloc(bloc) {
  return bloc.titre ? `<h2 class="bloc-titre">${echapper(typographier(bloc.titre))}</h2>\n` : '';
}

async function rendreAccueil(contexte) {
  const accueil = await lireJson('contenu/accueil.json');
  if (!Array.isArray(accueil.blocs)) {
    throw new ErreurContenu('contenu/accueil.json : le fichier doit contenir une liste « blocs ».');
  }
  const morceaux = [];
  for (const [index, bloc] of accueil.blocs.entries()) {
    const origine = `contenu/accueil.json, bloc n° ${index + 1}`;
    if (bloc.actif === false) continue;
    const rendre = BLOCS[bloc.bloc];
    if (!rendre) {
      throw new ErreurContenu(`${origine} : type de bloc inconnu « ${bloc.bloc} ». Types disponibles : ${Object.keys(BLOCS).join(', ')}.`);
    }
    morceaux.push(await rendre(bloc, contexte, origine));
  }
  return `<h1 class="invisible">${echapper(contexte.site.nom)}</h1>\n${morceaux.join('\n')}`;
}

// ---------- Pages ----------

function rendrePublication(publication, site) {
  const infos = TYPES[publication.type];
  const auteur = publication.auteur ?? site.auteur;
  const maj = publication.maj
    ? `, mis à jour le <time datetime="${publication.majIso}">${dateFr(publication.maj)}</time>`
    : '';
  return `<article class="bande publication voix-${publication.type}">
${rendreFil([MENU[0], MENU[1]], publication.titre)}
<header class="publication-entete">
<h1 class="publication-titre">${echapper(publication.titre)}</h1>
<p class="publication-resume">${echapper(publication.resume)}</p>
<p class="publication-meta">${infos.publie} le <time datetime="${publication.dateIso}">${dateFr(publication.date)}</time> par ${echapper(auteur)}${maj}</p>
</header>
<div class="texte">
${publication.corps}
</div>
</article>`;
}

function donneesStructurees(publication, site) {
  const donnees = {
    '@context': 'https://schema.org',
    '@type': TYPES[publication.type].schema,
    headline: publication.titre,
    description: publication.resume,
    datePublished: publication.dateIso,
    dateModified: publication.majIso ?? publication.dateIso,
    author: { '@type': 'Person', name: publication.auteur ?? site.auteur },
    mainEntityOfPage: `${site.url}/${publication.chemin}/`,
    inLanguage: site.langue,
  };
  return `<script type="application/ld+json">${JSON.stringify(donnees).replaceAll('<', '\\u003c')}</script>`;
}

// La liste des services extérieurs déclarés, telle qu'elle s'affiche sur la page « Données personnelles ».
function rendreServices(rgpd) {
  if (rgpd.services.length === 0) {
    return '<p>Aucun. Le site ne charge rien depuis un autre site : ni vidéo, ni carte, ni police de caractères, ni outil de mesure d’audience. Tout ce qui s’affiche vient de chez nous.</p>';
  }
  const rangees = rgpd.services
    .map(
      (s) => `<tr><td>${echapper(typographier(s.nom))}${s.pays ? ` (${echapper(typographier(s.pays))})` : ''}</td><td>${echapper(typographier(s.finalite))}</td><td>${echapper(typographier(s.donnees))}</td><td><a href="${echapper(s.politique)}">Sa politique</a></td></tr>`,
    )
    .join('\n');
  return `<p>Certaines pages affichent un contenu fourni par un autre service. Quand votre navigateur le charge, ce service reçoit au moins votre adresse IP.</p>
<table>
<thead>
<tr><th>Service</th><th>À quoi il sert</th><th>Ce qu’il reçoit</th><th>Ses règles</th></tr>
</thead>
<tbody>
${rangees}
</tbody>
</table>`;
}

function rendrePageSimple(page, site) {
  // Dans les pages de contenu/pages, ces repères reprennent les réglages du site (site.config.json).
  const { rgpd } = site;
  const texte = (valeur) => echapper(typographier(valeur));
  const corps = page.corps
    .replaceAll('{{email}}', echapper(site.email))
    .replaceAll('{{auteur}}', echapper(site.auteur))
    .replaceAll('{{nom_site}}', echapper(site.nom))
    .replaceAll('{{rgpd_responsable}}', texte(rgpd.responsable))
    .replaceAll('{{rgpd_contact}}', echapper(rgpd.contact))
    .replaceAll('{{rgpd_hebergeur}}', `${texte(rgpd.hebergeur.nom)}, ${texte(rgpd.hebergeur.adresse)}`)
    .replaceAll('{{rgpd_journaux}}', texte(rgpd.hebergeur.journaux))
    .replaceAll(
      '{{rgpd_transfert}}',
      rgpd.hebergeur.transfert || rgpd.hebergeur.politique
        ? `<li><strong>Où ça part\u00a0:</strong> ${texte(rgpd.hebergeur.transfert)}${
            rgpd.hebergeur.politique ? ` <a href="${echapper(rgpd.hebergeur.politique)}">Ses règles de confidentialité</a>.` : ''
          }</li>`
        : '',
    )
    .replaceAll('{{rgpd_conservation}}', texte(rgpd.conservationMessages))
    .replaceAll('{{rgpd_maj}}', `<time datetime="${rgpd.majIso}">${dateFr(rgpd.maj)}</time>`)
    .replaceAll('{{rgpd_services}}', rendreServices(rgpd));
  const inconnu = corps.match(/\{\{(?!racine\}\})\w+\}\}/);
  if (inconnu) throw new ErreurContenu(`contenu/pages/${page.identifiant}.html : repère inconnu ${inconnu[0]}.`);
  return `<div class="bande page voix-article">
${rendreFil([MENU[0]], page.titre)}
<h1 class="page-titre">${echapper(page.titre)}</h1>
<div class="texte">
${corps}
</div>
</div>`;
}

function rendrePlan(parType, pages) {
  const sousListe = (type) => {
    const infos = TYPES[type];
    const liens = parType[type]
      .map((p) => `<li><a href="{{racine}}${p.chemin}/">${echapper(p.titre)}</a></li>`)
      .join('\n');
    const contenu = liens ? `\n<ul>\n${liens}\n</ul>\n` : '';
    return `<li><a href="{{racine}}publications/#${infos.dossier}">${infos.pluriel}</a>${contenu}</li>`;
  };
  const autres = pages
    .map((page) => `<li><a href="{{racine}}${page.chemin}/">${echapper(page.titre)}</a></li>`)
    .join('\n');
  return `<div class="bande page voix-article">
${rendreFil([MENU[0]], 'Plan du site')}
<h1 class="page-titre">Plan du site</h1>
<ul class="plan">
<li><a href="{{racine}}">Accueil</a></li>
<li><a href="{{racine}}publications/">${CAHIERS}</a>
<ul>
${Object.keys(TYPES).map(sousListe).join('\n')}
</ul>
</li>
${autres}
<li><a href="{{racine}}rss.xml">Flux RSS</a></li>
</ul>
</div>`;
}

// ---------- Mode repères ----------

function rendreLegende() {
  const puces = ZONES.map((z) => `<li class="puce zone-${z.cle}">${z.nom}</li>`).join('\n');
  return `<aside class="legende" aria-label="Code couleur des zones de texte">
<p class="legende-titre">Repères : où va chaque texte</p>
<ul>
${puces}
</ul>
<p class="legende-lien"><a href="{{racine}}code-couleur/">Le code couleur et les textes à copier-coller</a></p>
</aside>`;
}

// Un bloc de texte à copier-coller, où chaque ligne porte la couleur de sa zone.
function rendreModele(lignes) {
  return `<pre class="modele">${lignes
    .map(([cle, texte]) => `<span class="ligne zone-${cle}">${echapper(texte)}\n</span>`)
    .join('')}</pre>`;
}

function rendreCodeCouleur() {
  const rangees = ZONES.map(
    (z) => `<tr><td><span class="puce zone-${z.cle}">${z.nom}</span></td><td>${z.couleur}</td><td>${z.doc}</td><td>${z.site}</td></tr>`,
  ).join('\n');
  const pourDocs = rendreModele([
    ['titre', '# Le titre qui claque, ou une question qui gratte'],
    ['resume', 'Résumé : une ou deux phrases qui donnent envie de lire la suite.'],
    ['infos', 'Type : enquête'],
    ['infos', 'Date : 26/11/2026'],
    ['infos', 'Signature : qui signe (facultatif)'],
    ['texte', 'Le premier paragraphe. On pose la question, on dit d’où elle vient.'],
    ['marge', 'Marge : (une source, un nom, un renvoi)'],
    ['intertitre', '## Un intertitre'],
    ['texte', 'Un autre paragraphe, avec ses chiffres.'],
    ['citation', 'Citation : une phrase à mettre en bulle.'],
    ['sources', '## Nos sources'],
    ['sources', '- Nom de la source : ce qu’elle dit, avec son lien'],
  ]);
  const pourFichier = rendreModele([
    ['titre', '<!--'],
    ['titre', 'titre: Le titre qui claque, ou une question qui gratte'],
    ['resume', 'resume: Une ou deux phrases qui donnent envie de lire la suite.'],
    ['infos', 'date: 2026-11-26'],
    ['infos', 'auteur: Qui signe (facultatif)'],
    ['titre', '-->'],
    ['texte', '<p>Le premier paragraphe. Un chiffre en <strong>gras</strong>, un mot <del>barré</del>.</p>'],
    ['marge', '<aside class="marge">(une source, un nom, un renvoi)</aside>'],
    ['intertitre', '<h2>Un intertitre</h2>'],
    ['texte', '<p>Un autre paragraphe.</p>'],
    ['citation', '<blockquote><p>Une citation.</p></blockquote>'],
    ['sources', '<h2>Nos sources</h2>'],
    ['sources', '<ul><li><a href="https://…">Nom de la source : ce qu’elle dit</a></li></ul>'],
  ]);
  return `<div class="bande page voix-article code-couleur">
${rendreFil([MENU[0]], 'Code couleur')}
<h1 class="page-titre">Code couleur</h1>
<p class="page-chapo">Chaque zone de texte a sa couleur. La même couleur surligne la ligne à remplir dans le modèle Google Docs.</p>
<div class="texte">
<table>
<thead>
<tr><th>Zone</th><th>Couleur</th><th>Dans le document</th><th>Sur le site</th></tr>
</thead>
<tbody>
${rangees}
</tbody>
</table>
<h2>À coller dans un document Google</h2>
<p>Copiez ce bloc dans un document vide, remplacez chaque ligne par votre texte, puis importez le document avec le kit.</p>
${pourDocs}
<h2>À coller dans un fichier du site</h2>
<p>Pour écrire directement dans <code>contenu/articles/</code> (enquête) ou <code>contenu/editos/</code> (coup de gueule).</p>
${pourFichier}
</div>
</div>`;
}

// ---------- Écriture ----------

function prefixe(chemin) {
  return chemin ? '../'.repeat(chemin.split('/').length) : './';
}

// Le logo de l'en-tête : la fin du nom (« la glotte ») est taguée en grand, le début posé au-dessus.
// Réglable avec "logo": { "haut": "...", "bas": "..." } dans site.config.json ; sinon, les deux derniers mots.
function rendreLogo(site) {
  const mots = site.nom.split(' ');
  const haut = site.logo?.haut ?? mots.slice(0, -2).join(' ');
  const bas = site.logo?.bas ?? mots.slice(-2).join(' ');
  if (!haut) return `<span class="logo-bas">${echapper(bas)}</span>`;
  return `<span class="logo-haut">${echapper(haut)}</span> <span class="logo-bas">${echapper(bas)}</span>`;
}

async function ecrirePage(site, gabarit, page) {
  const {
    chemin,
    titre = null,
    description = site.description,
    ton = 'blanc',
    typeOg = 'website',
    balises = '',
    contenu,
    fichierSortie = null,
    racine = prefixe(chemin),
  } = page;

  const valeurs = {
    reperes: AVEC_REPERES ? ' reperes' : '',
    legende: AVEC_REPERES ? rendreLegende() : '',
    langue: echapper(site.langue),
    titre_onglet: echapper(titre ? `${titre} | ${site.nom}` : site.nom),
    titre_partage: echapper(titre ?? site.nom),
    description: echapper(description),
    canonique: echapper(`${site.url}/${fichierSortie ?? (chemin ? `${chemin}/` : '')}`),
    type_og: typeOg,
    balises,
    ton,
    nom_site: echapper(site.nom),
    logo: rendreLogo(site),
    auteur: echapper(site.auteur),
    email: echapper(site.email),
    annee: String(new Date().getFullYear()),
    menu: rendreMenu(chemin),
    contenu,
  };

  const html = gabarit
    .replace(/\{\{(\w+)\}\}/g, (repere, cle) => {
      if (cle === 'racine') return repere;
      if (!(cle in valeurs)) throw new ErreurContenu(`gabarits/page.html : repère inconnu ${repere}.`);
      return valeurs[cle];
    })
    // {{racine}} est remplacé en dernier pour valoir aussi dans les textes insérés.
    .replaceAll('{{racine}}', racine);

  const destination = fichierSortie
    ? path.join(SORTIE, fichierSortie)
    : path.join(SORTIE, chemin, 'index.html');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
}

function xml(texte) {
  return echapper(texte).replaceAll("'", '&apos;');
}

function rendreRss(site, publications) {
  const elements = publications
    .map(
      (p) => `    <item>
      <title>${xml(p.titre)}</title>
      <link>${xml(`${site.url}/${p.chemin}/`)}</link>
      <guid isPermaLink="true">${xml(`${site.url}/${p.chemin}/`)}</guid>
      <description>${xml(p.resume)}</description>
      <category>${xml(TYPES[p.type].nom)}</category>
      <pubDate>${p.date.toUTCString()}</pubDate>
    </item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(site.nom)}</title>
    <link>${xml(`${site.url}/`)}</link>
    <description>${xml(site.description)}</description>
    <language>${xml(site.langue)}</language>
    <atom:link href="${xml(`${site.url}/rss.xml`)}" rel="self" type="application/rss+xml"/>
${elements}
  </channel>
</rss>
`;
}

function rendreSitemap(site, entrees) {
  const urls = entrees
    .map(({ chemin, modifie }) => {
      const date = modifie ? `\n    <lastmod>${modifie}</lastmod>` : '';
      return `  <url>\n    <loc>${xml(`${site.url}/${chemin ? `${chemin}/` : ''}`)}</loc>${date}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

// ---------- Contrôles après construction ----------

// Vérifie que chaque lien interne du site construit mène bien à une page ou à un fichier existant.
async function verifierLiens(site) {
  const fichiers = (await readdir(SORTIE, { recursive: true })).filter((nom) => nom.endsWith('.html'));
  const casses = [];
  for (const nom of fichiers) {
    const fichier = path.join(SORTIE, nom);
    const html = await readFile(fichier, 'utf8');
    for (const [, brut] of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(brut) || brut.startsWith('//')) continue;
      const [sansAncre, ancre] = brut.split('#');
      const cible = sansAncre.split('?')[0];
      let destination = fichier;
      if (cible !== '') {
        const absolu = cible.startsWith('/')
          ? path.join(SORTIE, cible.startsWith(site.base) ? cible.slice(site.base.length) : cible)
          : path.resolve(path.dirname(fichier), cible);
        destination = cible.endsWith('/') || absolu === SORTIE ? path.join(absolu, 'index.html') : absolu;
      }
      if (!destination.startsWith(SORTIE) || !existsSync(destination)) {
        casses.push(`${nom} : le lien « ${brut} » ne mène nulle part.`);
        continue;
      }
      if (ancre && destination.endsWith('.html')) {
        const page = destination === fichier ? html : await readFile(destination, 'utf8');
        if (!page.includes(`id="${ancre}"`)) casses.push(`${nom} : l'ancre « #${ancre} » du lien « ${brut} » n'existe pas.`);
      }
    }
  }
  if (casses.length > 0) {
    throw new ErreurContenu(`Liens cassés dans le site construit :\n  - ${casses.join('\n  - ')}`);
  }
  return fichiers.length;
}

// Contrôle des données personnelles : relève tout ce que le site construit ferait charger depuis un
// autre site (image, vidéo, cadre, script, police, feuille de style, formulaire). Un simple lien ne
// compte pas : rien n'est chargé tant qu'on ne clique pas. Chaque hôte extérieur doit être déclaré
// dans « rgpd.services » de site.config.json, sinon la construction s'arrête : la page
// « Données personnelles » ne peut donc jamais oublier un service.
async function verifierDonnees(site) {
  const fichiers = (await readdir(SORTIE, { recursive: true })).filter((nom) => /\.(html|css)$/.test(nom));
  const charges = new Map(); // hôte → fichiers qui le chargent
  const scripts = new Set();
  const noter = (adresse, nom) => {
    const brute = adresse.trim().replace(/^\/\//, 'https://');
    if (!/^https?:\/\//i.test(brute)) return;
    let hote;
    try {
      hote = new URL(brute).hostname.toLowerCase();
    } catch {
      return;
    }
    if (hote === site.hote) return;
    if (!charges.has(hote)) charges.set(hote, new Set());
    charges.get(hote).add(nom);
  };
  const CHARGE_PAR_LIEN = /\b(stylesheet|preload|prefetch|preconnect|dns-prefetch|modulepreload|icon|manifest)\b/i;

  for (const nom of fichiers) {
    const source = await readFile(path.join(SORTIE, nom), 'utf8');
    for (const [, adresse] of source.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) noter(adresse, nom);
    for (const [, adresse] of source.matchAll(/@import\s+['"]([^'"]+)['"]/gi)) noter(adresse, nom);
    if (!nom.endsWith('.html')) continue;
    for (const [balise, type] of source.matchAll(/<(script|img|iframe|video|audio|source|embed|object|track|input|link|form)\b[^>]*>/gi)) {
      const attribut = (cle) => balise.match(new RegExp(`\\s${cle}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find((v) => v !== undefined);
      const genre = type.toLowerCase();
      if (genre === 'link') {
        if (CHARGE_PAR_LIEN.test(attribut('rel') ?? '')) noter(attribut('href') ?? '', nom);
        continue;
      }
      if (genre === 'form') {
        noter(attribut('action') ?? '', nom);
        continue;
      }
      if (genre === 'script' && !attribut('src') && !/application\/ld\+json/i.test(attribut('type') ?? '')) scripts.add(nom);
      for (const cle of ['src', 'data', 'poster']) noter(attribut(cle) ?? '', nom);
      for (const morceau of (attribut('srcset') ?? '').split(',')) noter(morceau.trim().split(/\s+/)[0] ?? '', nom);
    }
  }

  const declares = new Map(site.rgpd.services.flatMap((s) => s.hotes.map((h) => [h.toLowerCase(), s.nom])));
  const oublies = [...charges].filter(([hote]) => !declares.has(hote));
  if (oublies.length > 0) {
    const detail = oublies.map(([hote, pages]) => `${hote} (dans ${[...pages].slice(0, 3).join(', ')}${pages.size > 3 ? '…' : ''})`).join('\n  - ');
    throw new ErreurContenu(
      `Données personnelles : le site charge du contenu depuis un autre site qui n'est pas déclaré :\n  - ${detail}\n` +
        `Chaque visite enverrait l'adresse IP du lecteur à ce service. Deux solutions :\n` +
        `  1. remplacer ce contenu par un simple lien (rien n'est transmis tant qu'on ne clique pas) ;\n` +
        `  2. le déclarer dans site.config.json, « rgpd.services », pour qu'il figure sur la page « Données personnelles ».\n` +
        `Attention : un service qui dépose des cookies ou des traceurs (vidéo, carte, statistiques…) demande l'accord préalable du lecteur. ` +
        `Le site n'a pas de bandeau de consentement : n'intégrez pas ce genre de service, mettez un lien.`,
    );
  }
  return {
    services: [...new Set([...charges.keys()].map((hote) => declares.get(hote)))],
    inutilises: site.rgpd.services.filter((s) => !s.hotes.some((h) => charges.has(h.toLowerCase()))).map((s) => s.nom),
    scripts: [...scripts],
  };
}

// Signale ce qui reste à remplir avant d'ouvrir le site au public.
async function listerACompleter() {
  const restes = [];
  const config = await readFile(path.join(RACINE, 'site.config.json'), 'utf8');
  if (config.includes('example.com') || config.includes('Nom du site') || config.includes('Votre nom') || config.includes('[À compléter')) {
    restes.push('site.config.json');
  }
  for (const dossier of ['contenu/pages', 'contenu/blocs']) {
    const complet = path.join(RACINE, dossier);
    if (!existsSync(complet)) continue;
    for (const nom of (await readdir(complet)).sort()) {
      const source = await readFile(path.join(complet, nom), 'utf8');
      if (source.includes('[À compléter')) restes.push(`${dossier}/${nom}`);
    }
  }
  return restes;
}

// ---------- Construction ----------

async function construire() {
  const site = await lireSite();
  const gabarit = await readFile(path.join(RACINE, 'gabarits', 'page.html'), 'utf8');

  const parType = {};
  for (const type of Object.keys(TYPES)) parType[type] = await lirePublications(type);
  const toutes = trier(Object.values(parType).flat());
  const pages = await lirePages();
  const contexte = { site, parType, toutes };

  const reserves = new Set(['publications', 'plan-du-site', ...Object.values(TYPES).map((t) => t.dossier)]);
  for (const page of pages) {
    if (reserves.has(page.identifiant)) {
      throw new ErreurContenu(`contenu/pages/${page.identifiant}.html : ce nom est réservé par le site, choisissez-en un autre.`);
    }
  }

  await rm(SORTIE, { recursive: true, force: true });
  await mkdir(SORTIE, { recursive: true });
  await cp(path.join(RACINE, 'public'), SORTIE, { recursive: true });

  // Accueil
  await ecrirePage(site, gabarit, { chemin: '', contenu: await rendreAccueil(contexte) });

  // Page commune aux enquêtes et aux coups de gueule
  await ecrirePage(site, gabarit, {
    chemin: 'publications',
    titre: CAHIERS,
    description: `Toutes les enquêtes et tous les coups de gueule de ${site.nom}.`,
    contenu: `<div class="bande page-entete voix-article">
${rendreFil([MENU[0]], CAHIERS)}
<h1 class="page-titre">${CAHIERS}</h1>
<p class="page-chapo">Les enquêtes, on fouille les chiffres. Les coups de gueule, on crache ce qui nous reste en travers de la gorge.</p>
</div>
${rendreDuo(parType, { niveau: 2, lienVersTout: false })}`,
  });

  // Une page par article et par édito
  for (const publication of toutes) {
    await ecrirePage(site, gabarit, {
      chemin: publication.chemin,
      titre: publication.titre,
      description: publication.resume,
      ton: TYPES[publication.type].ton,
      typeOg: 'article',
      balises: donneesStructurees(publication, site),
      contenu: rendrePublication(publication, site),
    });
  }

  // Pages fixes (à propos, mentions légales...)
  for (const page of pages) {
    await ecrirePage(site, gabarit, {
      chemin: page.chemin,
      titre: page.titre,
      description: page.resume,
      contenu: rendrePageSimple(page, site),
    });
  }

  // Code couleur : la page de référence, en mode repères seulement
  if (AVEC_REPERES) {
    await ecrirePage(site, gabarit, {
      chemin: 'code-couleur',
      titre: 'Code couleur',
      description: 'Le code couleur des zones de texte et les textes à copier-coller.',
      balises: '<meta name="robots" content="noindex">',
      contenu: rendreCodeCouleur(),
    });
  }

  // Plan du site
  await ecrirePage(site, gabarit, {
    chemin: 'plan-du-site',
    titre: 'Plan du site',
    description: `Toutes les pages de ${site.nom}.`,
    contenu: rendrePlan(parType, pages),
  });

  // Page d'erreur : servie à n'importe quelle adresse, donc avec des liens partant de la racine du site.
  await ecrirePage(site, gabarit, {
    chemin: '404',
    fichierSortie: '404.html',
    racine: site.base,
    titre: 'Page avalée',
    balises: '<meta name="robots" content="noindex">',
    contenu: `<div class="bande page voix-article">
<h1 class="page-titre">Page avalée</h1>
<div class="texte">
<p>Rien à cette adresse. La page est descendue trop loin dans la gorge, ou elle n’a jamais existé.</p>
<p><a href="{{racine}}publications/">Retourner aux cahiers</a></p>
</div>
</div>`,
  });

  // Fichiers pour les lecteurs de flux et les moteurs de recherche
  await writeFile(path.join(SORTIE, 'rss.xml'), rendreRss(site, toutes));
  await writeFile(
    path.join(SORTIE, 'sitemap.xml'),
    rendreSitemap(site, [
      { chemin: '' },
      { chemin: 'publications' },
      ...toutes.map((p) => ({ chemin: p.chemin, modifie: p.majIso ?? p.dateIso })),
      ...pages.map((p) => ({ chemin: p.chemin })),
      { chemin: 'plan-du-site' },
    ]),
  );
  await writeFile(path.join(SORTIE, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);

  const nombrePages = await verifierLiens(site);
  console.log(
    `Site construit dans ${AVEC_REPERES ? 'reperes/ (mode repères, à ne pas publier)' : 'dist/'} : ${nombrePages} pages, ${parType.article.length} article(s), ${parType.edito.length} édito(s). Liens internes vérifiés.`,
  );
  const donnees = await verifierDonnees(site);
  console.log(
    donnees.services.length === 0
      ? 'Données personnelles : rien n’est chargé depuis un autre site.'
      : `Données personnelles : services extérieurs chargés et déclarés : ${donnees.services.join(', ')}.`,
  );
  if (donnees.inutilises.length > 0) {
    console.log(`  · déclarés dans « rgpd.services » mais plus utilisés (à retirer) : ${donnees.inutilises.join(', ')}.`);
  }
  if (donnees.scripts.length > 0) {
    console.log(`  · un script est écrit dans ${donnees.scripts.join(', ')} : vérifiez qu’il ne dépose ni cookie ni traceur.`);
  }
  const restes = await listerACompleter();
  if (restes.length > 0) {
    console.log(`À compléter avant la mise en ligne :\n  - ${restes.join('\n  - ')}`);
  }
}

try {
  await construire();
} catch (erreur) {
  if (erreur instanceof ErreurContenu) {
    console.error(`Erreur : ${erreur.message}`);
    process.exit(1);
  }
  throw erreur;
}
