// Kit de connexion Google Docs → site.
// Chaque texte s'écrit dans un document Google qui suit le modèle des cahiers (voir outils/LISEZMOI-docs.md).
// Ce script récupère le document au format Markdown et l'écrit dans contenu/, prêt pour node build.mjs.
//
//   node outils/docs.mjs                       importe tous les documents listés dans contenu/docs.json
//   node outils/docs.mjs --doc <lien ou id>    importe un seul document (il doit déjà être dans docs.json ou avoir un « Type : »)
//   node outils/docs.mjs --fichier texte.md    convertit un Markdown téléchargé à la main (Fichier > Télécharger > Markdown)
//   options : --vers articles/mon-texte.html   choisit le fichier de destination
//             --forcer                         écrase un fichier qui n'a pas été importé depuis ce document
//             --essai                          affiche le résultat sans rien écrire
//
// Aucune dépendance : seul Node.js 20 ou plus est nécessaire.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENU = path.join(RACINE, 'contenu');
const LISTE = path.join(CONTENU, 'docs.json');

class ErreurDoc extends Error {}

// ---------- Arguments ----------

function lireArguments(argv) {
  const options = { forcer: false, essai: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--forcer') options.forcer = true;
    else if (arg === '--essai') options.essai = true;
    else if (['--doc', '--fichier', '--vers'].includes(arg)) {
      if (!argv[i + 1]) throw new ErreurDoc(`${arg} attend une valeur.`);
      options[arg.slice(2)] = argv[(i += 1)];
    } else throw new ErreurDoc(`option inconnue « ${arg} ».`);
  }
  return options;
}

// ---------- Google Docs ----------

function idDuDoc(lienOuId) {
  const trouve = String(lienOuId).match(/\/document\/d\/([\w-]{20,})/);
  if (trouve) return trouve[1];
  if (/^[\w-]{20,}$/.test(lienOuId)) return lienOuId;
  throw new ErreurDoc(`« ${lienOuId} » n'est ni un lien Google Docs ni un identifiant de document.`);
}

async function telecharger(id) {
  const url = `https://docs.google.com/document/d/${id}/export?format=md`;
  let reponse;
  try {
    reponse = await fetch(url, { redirect: 'follow' });
  } catch (erreur) {
    throw new ErreurDoc(`impossible de joindre Google Docs (${erreur.message}).`);
  }
  const type = reponse.headers.get('content-type') ?? '';
  if (!reponse.ok || type.includes('text/html')) {
    throw new ErreurDoc(
      `le document ${id} n'est pas accessible. Dans Google Docs : Partager > Accès général > « Tous les utilisateurs qui ont le lien » en lecteur. ` +
        `Sinon, téléchargez-le en Markdown et utilisez --fichier.`,
    );
  }
  return reponse.text();
}

// ---------- Markdown → HTML du site ----------

function echapper(texte) {
  return texte.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// Google enveloppe parfois les liens dans une redirection https://www.google.com/url?q=...
function lienPropre(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('google.com') && u.pathname === '/url' && u.searchParams.get('q')) return u.searchParams.get('q');
  } catch {
    // adresse relative ou invalide : on la garde telle quelle
  }
  return url;
}

function enLigne(source) {
  // 1. On met de côté les caractères échappés (\. \- \# ...) et le code.
  const reserve = [];
  const garder = (html) => `\u0000${reserve.push(html) - 1}\u0000`;
  let t = source
    .replace(/`([^`]+)`/g, (_, code) => garder(`<code>${echapper(code)}</code>`))
    .replace(/\\([\\`*_{}\[\]()#+\-.!|~:<>"'=])/g, (_, c) => garder(echapper(c)));

  // 2. Liens et images.
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, () => {
    console.warn('  · une image a été ignorée (ajoutez-la à la main dans public/).');
    return '';
  });
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, texte, url) => {
    const cible = lienPropre(url.replace(/\\(.)/g, '$1'));
    // Le texte du lien a pu contenir des caractères échappés mis de côté : on les restitue.
    return garder(`<a href="${echapper(cible)}">${enLigneSimple(texte, reserve)}</a>`);
  });
  t = t.replace(/<(https?:\/\/[^>\s]+)>/g, (_, url) => garder(`<a href="${echapper(url)}">${echapper(url)}</a>`));

  // 3. Le reste est du texte : on l'échappe, puis on applique gras, italique et ratures.
  t = enLigneSimple(t, reserve);
  return t.replace(/\u0000(\d+)\u0000/g, (_, n) => reserve[Number(n)]);
}

function enLigneSimple(texte, reserve) {
  return echapper(texte)
    .replace(/\u0000(\d+)\u0000/g, (_, n) => reserve[Number(n)])
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '<strong>$2</strong>')
    .replace(/(^|[^*])\*(?=\S)(.+?)(?<=\S)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|\W)_(?=\S)(.+?)(?<=\S)_(?=\W|$)/g, '$1<em>$2</em>');
}

// Les lignes d'en-tête reconnues juste sous le titre, et la clé correspondante dans le fichier du site.
const CHAMPS = {
  'résumé': 'resume',
  resume: 'resume',
  chapo: 'resume',
  'chapô': 'resume',
  type: 'type',
  date: 'date',
  signature: 'auteur',
  auteur: 'auteur',
  brouillon: 'brouillon',
  'mise à jour': 'maj',
  maj: 'maj',
  fichier: 'fichier',
};

function analyser(markdown) {
  const lignes = markdown.replace(/\r\n?/g, '\n').split('\n');
  const meta = {};
  const blocs = [];
  let i = 0;

  const brut = (ligne) => ligne.replace(/\\(.)/g, '$1').trim();

  // Le titre : le premier titre de niveau 1 (style « Titre » ou « Titre 1 » dans Google Docs).
  while (i < lignes.length && !lignes[i].trim()) i += 1;
  const titre = lignes[i]?.match(/^#\s+(.+?)\s*#*\s*$/);
  if (titre) {
    meta.titre = brut(titre[1]).replace(/\*\*/g, '');
    i += 1;
  }

  // Les champs (« Résumé : ... », « Type : ... ») tant qu'on en trouve, en sautant les lignes vides.
  for (; i < lignes.length; i += 1) {
    const ligne = brut(lignes[i]).replace(/^\*\*(.+?)\*\*/, '$1');
    if (!ligne) continue;
    const champ = ligne.match(/^([\p{L} ]+?)\s*:\s*(.*)$/u);
    const cle = champ && CHAMPS[champ[1].trim().toLowerCase()];
    if (!cle) break;
    meta[cle] = champ[2].replace(/\*\*/g, '').trim();
  }
  // Un trait (---) sépare parfois l'en-tête du texte.
  while (i < lignes.length && (!lignes[i].trim() || /^\s*([-*_])\1{2,}\s*$/.test(lignes[i]))) i += 1;

  // Le corps.
  let paragraphe = [];
  const fermerParagraphe = () => {
    if (paragraphe.length === 0) return;
    // Une note interne (« Note : ... ») ne part jamais sur le site.
    if (/^[*_]*note\s*:/i.test(brut(paragraphe[0]))) {
      paragraphe = [];
      return;
    }
    // Une note de marge : un paragraphe qui commence par « Marge : ».
    if (/^marge\s*:/i.test(brut(paragraphe[0]))) {
      const texte = paragraphe.map((l) => l.trim()).join(' ').replace(/^marge\s*\\?:\s*/i, '');
      blocs.push(`<aside class="marge">${enLigne(texte)}</aside>`);
    } else {
      // Dans Google Docs, Maj+Entrée crée un retour à la ligne dans le même paragraphe.
      blocs.push(`<p>${paragraphe.map((l) => enLigne(l.replace(/\\$/, '').trim())).join('<br>\n')}</p>`);
    }
    paragraphe = [];
  };

  while (i < lignes.length) {
    const ligne = lignes[i];
    const net = ligne.trim();

    if (!net) {
      fermerParagraphe();
      i += 1;
      continue;
    }

    const titreBloc = net.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (titreBloc) {
      fermerParagraphe();
      const niveau = Math.min(Math.max(titreBloc[1].length, 2), 3);
      blocs.push(`<h${niveau}>${enLigne(titreBloc[2].replace(/^\*\*(.+)\*\*$/, '$1'))}</h${niveau}>`);
      i += 1;
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(net)) {
      fermerParagraphe();
      blocs.push('<hr>');
      i += 1;
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(ligne)) {
      fermerParagraphe();
      const ordonnee = /^\s*\d+[.)]/.test(ligne);
      const elements = [];
      while (i < lignes.length && /^\s*([-*+]|\d+[.)])(\s+|$)/.test(lignes[i])) {
        const texte = lignes[i].replace(/^\s*([-*+]|\d+[.)])\s*/, '').trim();
        if (texte) elements.push(`<li>${enLigne(texte)}</li>`);
        i += 1;
      }
      if (elements.length) blocs.push(`<${ordonnee ? 'ol' : 'ul'}>\n${elements.join('\n')}\n</${ordonnee ? 'ol' : 'ul'}>`);
      continue;
    }

    if (net.startsWith('>')) {
      fermerParagraphe();
      const citation = [];
      while (i < lignes.length && lignes[i].trim().startsWith('>')) {
        citation.push(lignes[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      // Google exporte une liste en retrait comme une citation : on la rend comme une liste.
      const items = citation.filter((l) => l.trim());
      if (items.length && items.every((l) => /^([-*+]|\d+[.)])\s+/.test(l))) {
        const ordonnee = /^\d/.test(items[0]);
        const elements = items.map((l) => `<li>${enLigne(l.replace(/^([-*+]|\d+[.)])\s+/, '').trim())}</li>`);
        blocs.push(`<${ordonnee ? 'ol' : 'ul'}>\n${elements.join('\n')}\n</${ordonnee ? 'ol' : 'ul'}>`);
        continue;
      }
      const paras = citation.join('\n').split(/\n\s*\n/).map((p) => `<p>${enLigne(p.replace(/\n/g, ' ').trim())}</p>`);
      blocs.push(`<blockquote>\n${paras.join('\n')}\n</blockquote>`);
      continue;
    }

    if (net.startsWith('|')) {
      fermerParagraphe();
      const rangees = [];
      while (i < lignes.length && lignes[i].trim().startsWith('|')) {
        rangees.push(lignes[i].trim());
        i += 1;
      }
      const cellules = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
      const separateur = rangees[1] && /^\|?[\s:|-]+\|?$/.test(rangees[1]);
      const entete = separateur ? cellules(rangees[0]) : null;
      const corps = (separateur ? rangees.slice(2) : rangees).map(
        (r) => `<tr>${cellules(r).map((c) => `<td>${enLigne(c)}</td>`).join('')}</tr>`,
      );
      blocs.push(
        `<table>\n${entete ? `<thead>\n<tr>${entete.map((c) => `<th>${enLigne(c)}</th>`).join('')}</tr>\n</thead>\n` : ''}<tbody>\n${corps.join('\n')}\n</tbody>\n</table>`,
      );
      continue;
    }

    // « Marge : » ouvre toujours sa propre note, même collée au paragraphe précédent.
    if (/^marge\s*\\?:/i.test(net)) fermerParagraphe();
    paragraphe.push(ligne);
    i += 1;
  }
  fermerParagraphe();
  while (blocs.at(-1) === '<hr>') blocs.pop();

  return { meta, html: blocs.join('\n\n') };
}

// ---------- Fichier du site ----------

function sansAccents(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function nomDeFichier(titre) {
  return sansAccents(titre)
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');
}

function dossierDuType(type) {
  const t = sansAccents(String(type ?? '')).toLowerCase().trim();
  if (['enquete', 'enquetes', 'article', 'articles'].includes(t)) return 'articles';
  if (['coup de gueule', 'coups de gueule', 'edito', 'editos'].includes(t)) return 'editos';
  if (['bloc', 'blocs', 'cadre', 'cadre de texte'].includes(t)) return 'blocs';
  if (['page', 'pages'].includes(t)) return 'pages';
  return null;
}

function destination({ meta, vers, entree }) {
  const choix = vers ?? entree?.fichier ?? meta.fichier;
  if (choix) {
    const relatif = choix.replace(/^contenu\//, '').replace(/\.html$/, '') + '.html';
    if (!/^(articles|editos|pages|blocs)\/[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(relatif)) {
      throw new ErreurDoc(`« ${choix} » : la destination doit ressembler à articles/mon-texte.html (minuscules sans accent, chiffres, tirets).`);
    }
    return relatif;
  }
  const dossier = dossierDuType(meta.type);
  if (!dossier) throw new ErreurDoc('le document doit dire son type, juste sous le titre : « Type : enquête », « Type : coup de gueule », « Type : page » ou « Type : bloc ».');
  if (!meta.titre) throw new ErreurDoc('le document doit commencer par son titre, en style « Titre 1 ».');
  return `${dossier}/${nomDeFichier(meta.titre)}.html`;
}

function composer({ relatif, meta, html, id }) {
  const dossier = relatif.split('/')[0];
  if (dossier === 'blocs') {
    // Un cadre de texte de l'accueil : pas d'en-tête, juste le texte. La source est notée en commentaire.
    return `${id ? `<!-- doc: ${id} -->\n` : ''}${html}\n`;
  }
  const obligatoires = dossier === 'pages' ? ['titre', 'resume'] : ['titre', 'resume', 'date'];
  for (const cle of obligatoires) {
    if (!meta[cle]) {
      const libelle = { titre: 'le titre (style Titre 1)', resume: 'une ligne « Résumé : ... »', date: 'une ligne « Date : 2026-11-25 »' }[cle];
      throw new ErreurDoc(`il manque ${libelle} sous le titre du document.`);
    }
  }
  if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) {
    const fr = meta.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!fr) throw new ErreurDoc(`« Date : ${meta.date} » : écrivez la date sous la forme 2026-11-25 ou 25/11/2026.`);
    meta.date = `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  }
  const brouillon = meta.brouillon && /^(oui|o|yes|x)$/i.test(meta.brouillon);
  const lignes = [
    `titre: ${meta.titre}`,
    `resume: ${meta.resume}`,
    meta.date && `date: ${meta.date}`,
    meta.maj && `maj: ${meta.maj}`,
    meta.auteur && `auteur: ${meta.auteur}`,
    brouillon && 'brouillon: oui',
    id && `doc: ${id}`,
  ].filter(Boolean);
  return `<!--\n${lignes.join('\n')}\n-->\n${html}\n`;
}

async function ecrire({ relatif, contenu, id, options }) {
  const complet = path.join(CONTENU, relatif);
  if (existsSync(complet) && !options.forcer) {
    const actuel = await readFile(complet, 'utf8');
    const source = actuel.match(/doc:\s*([\w-]+)/)?.[1];
    if (!id || source !== id) {
      throw new ErreurDoc(
        `contenu/${relatif} existe déjà et n'a pas été importé depuis ce document. Ajoutez --forcer pour l'écraser, ou --vers pour choisir un autre nom.`,
      );
    }
    if (actuel === contenu) return 'inchangé';
  }
  if (options.essai) {
    console.log(`\n----- contenu/${relatif} -----\n${contenu}`);
    return 'essai';
  }
  await mkdir(path.dirname(complet), { recursive: true });
  await writeFile(complet, contenu);
  return 'écrit';
}

async function importer({ markdown, id, entree, options }) {
  const { meta, html } = analyser(markdown);
  const relatif = destination({ meta, vers: options.vers, entree });
  const contenu = composer({ relatif, meta, html, id });
  const etat = await ecrire({ relatif, contenu, id, options });
  console.log(`${etat === 'inchangé' ? '=' : '✓'} contenu/${relatif} ${etat === 'inchangé' ? '(déjà à jour)' : `(${etat})`}`);
  return relatif;
}

async function lireListe() {
  if (!existsSync(LISTE)) return [];
  let donnees;
  try {
    donnees = JSON.parse(await readFile(LISTE, 'utf8'));
  } catch (erreur) {
    throw new ErreurDoc(`contenu/docs.json n'est pas un JSON valide (${erreur.message}).`);
  }
  if (!Array.isArray(donnees.documents)) throw new ErreurDoc('contenu/docs.json doit contenir une liste « documents ».');
  return donnees.documents.filter((d) => d.actif !== false);
}

async function principal() {
  const options = lireArguments(process.argv.slice(2));

  if (options.fichier) {
    const markdown = await readFile(path.resolve(options.fichier), 'utf8');
    await importer({ markdown, id: options.doc ? idDuDoc(options.doc) : null, entree: null, options });
    return;
  }

  const liste = await lireListe();
  const cibles = options.doc
    ? [liste.find((d) => idDuDoc(d.doc) === idDuDoc(options.doc)) ?? { doc: options.doc }]
    : liste;
  if (cibles.length === 0) {
    throw new ErreurDoc('aucun document à importer. Ajoutez-en dans contenu/docs.json, ou utilisez --doc ou --fichier.');
  }

  let erreurs = 0;
  for (const entree of cibles) {
    const id = idDuDoc(entree.doc);
    try {
      const markdown = await telecharger(id);
      await importer({ markdown, id, entree, options });
    } catch (erreur) {
      if (!(erreur instanceof ErreurDoc)) throw erreur;
      erreurs += 1;
      console.error(`✗ ${entree.nom ?? id} : ${erreur.message}`);
    }
  }
  if (erreurs) process.exit(1);
  console.log('Lancez maintenant node build.mjs pour reconstruire le site.');
}

try {
  await principal();
} catch (erreur) {
  if (erreur instanceof ErreurDoc) {
    console.error(`Erreur : ${erreur.message}`);
    process.exit(1);
  }
  throw erreur;
}
