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
const SORTIE = path.join(RACINE, 'dist');
const AVEC_BROUILLONS = process.argv.includes('--brouillons');

// Les deux familles de textes. Le ton (blanc ou noir) et la voix (typographie) en découlent.
const TYPES = {
  article: { dossier: 'articles', nom: 'Article', pluriel: 'Articles', ton: 'blanc', schema: 'Article' },
  edito: { dossier: 'editos', nom: 'Édito', pluriel: 'Éditos', ton: 'noir', schema: 'OpinionNewsArticle' },
};

const MENU = [
  { chemin: '', libelle: 'Accueil' },
  { chemin: 'publications', libelle: 'Articles et éditos' },
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
  return site;
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
      corps: typographierHtml(corps),
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
    const vide = `Aucun ${infos.nom.toLowerCase()} publié pour l’instant.`;
    const suite =
      lienVersTout && toutes.length > 0
        ? `\n<p class="duo-suite"><a href="{{racine}}publications/#${infos.dossier}">Tous les ${infos.pluriel.toLowerCase()}</a></p>`
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
<p class="publication-meta">${infos.nom} publié le <time datetime="${publication.dateIso}">${dateFr(publication.date)}</time> par ${echapper(auteur)}${maj}</p>
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

function rendrePageSimple(page, site) {
  // Dans les pages de contenu/pages, {{email}}, {{auteur}} et {{nom_site}} reprennent les réglages du site.
  const corps = page.corps
    .replaceAll('{{email}}', echapper(site.email))
    .replaceAll('{{auteur}}', echapper(site.auteur))
    .replaceAll('{{nom_site}}', echapper(site.nom));
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
<li><a href="{{racine}}publications/">Articles et éditos</a>
<ul>
${Object.keys(TYPES).map(sousListe).join('\n')}
</ul>
</li>
${autres}
<li><a href="{{racine}}rss.xml">Flux RSS</a></li>
</ul>
</div>`;
}

// ---------- Écriture ----------

function prefixe(chemin) {
  return chemin ? '../'.repeat(chemin.split('/').length) : './';
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
    langue: echapper(site.langue),
    titre_onglet: echapper(titre ? `${titre} | ${site.nom}` : site.nom),
    titre_partage: echapper(titre ?? site.nom),
    description: echapper(description),
    canonique: echapper(`${site.url}/${fichierSortie ?? (chemin ? `${chemin}/` : '')}`),
    type_og: typeOg,
    balises,
    ton,
    nom_site: echapper(site.nom),
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

// Signale ce qui reste à remplir avant d'ouvrir le site au public.
async function listerACompleter() {
  const restes = [];
  const config = await readFile(path.join(RACINE, 'site.config.json'), 'utf8');
  if (config.includes('example.com') || config.includes('Nom du site') || config.includes('Votre nom')) {
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

  // Page commune aux articles et aux éditos
  await ecrirePage(site, gabarit, {
    chemin: 'publications',
    titre: 'Articles et éditos',
    description: `Tous les articles et tous les éditos de ${site.nom}.`,
    contenu: `<div class="bande page-entete voix-article">
${rendreFil([MENU[0]], 'Articles et éditos')}
<h1 class="page-titre">Articles et éditos</h1>
<p class="page-chapo">Les articles rapportent et expliquent. Les éditos prennent position.</p>
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
    titre: 'Page introuvable',
    balises: '<meta name="robots" content="noindex">',
    contenu: `<div class="bande page voix-article">
<h1 class="page-titre">Page introuvable</h1>
<div class="texte">
<p>Cette adresse ne correspond à aucune page du site. Le texte a peut-être été déplacé ou supprimé.</p>
<p><a href="{{racine}}publications/">Voir tous les articles et éditos</a></p>
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
    `Site construit dans dist/ : ${nombrePages} pages, ${parType.article.length} article(s), ${parType.edito.length} édito(s). Liens internes vérifiés.`,
  );
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
