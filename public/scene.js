/*
  Scènes à personnages : le défilement fait avancer les personnages et la discussion.
  Script maison, hébergé avec le site : il ne collecte rien, ne dépose aucun cookie
  et ne charge rien d'ailleurs. Il n'est inclus que dans les pages qui contiennent une scène.
  Sans lui (script bloqué), la scène reste lisible grâce à la version CSS.

  Ce qu'il fait :
  - fait avancer les personnages, pas à pas, et glisser le décor ;
  - affiche la réplique en cours dans une seule bulle, au-dessus de la tête de celui qui parle ;
  - change les poses, et fait frémir le dessin de celui qui parle ;
  - secoue l'écran sur une réplique criée (class="replique a cri") ;
  - joue la fin de la scène une fois la dernière réplique passée.
*/
(function () {
  'use strict';

  var scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));
  if (scenes.length === 0) return;

  var calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PAS = 14; // nombre de pas sur la traversée de la scène
  var IMAGES = 3; // nombre d'images du frémissement
  var CADENCE = 140; // durée d'une image du frémissement, en millisecondes
  var FILTRE = 'grayscale(1) contrast(1.15)';
  var racine = document.documentElement;
  racine.classList.add('scenes-actives');

  // Le frémissement : trois déformations légères du trait, qu'on alterne sur celui qui parle.
  if (!calme) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" style="position:absolute"><defs>';
    for (var n = 0; n < IMAGES; n++) {
      svg += '<filter id="glotte-fremit-' + n + '" x="-4%" y="-4%" width="108%" height="108%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="' + (n * 7 + 3) + '" result="bruit"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="bruit" scale="6" xChannelSelector="R" yChannelSelector="G"/></filter>';
    }
    var boite = document.createElement('div');
    boite.innerHTML = svg + '</defs></svg>';
    document.body.appendChild(boite.firstChild);
  }

  function borner(valeur, mini, maxi) {
    return Math.max(mini, Math.min(maxi, valeur));
  }

  // Affiche, pour un personnage, le dessin de la pose demandée (ou le premier dessin).
  // Si plusieurs dessins portent la même pose, ils alternent : c'est le frémissement
  // dessiné à la main. Renvoie le dessin affiché.
  function poser(perso, pose, image) {
    var dessins = perso.querySelectorAll('[data-pose]');
    if (dessins.length === 0) return null;
    var variantes = [];
    for (var i = 0; i < dessins.length; i++) {
      if (dessins[i].getAttribute('data-pose') === pose) variantes.push(dessins[i]);
    }
    var choisi = variantes.length ? variantes[image % variantes.length] : dessins[0];
    for (var j = 0; j < dessins.length; j++) {
      dessins[j].classList.toggle('pose-active', dessins[j] === choisi);
      if (dessins[j] !== choisi) dessins[j].style.filter = '';
    }
    choisi.variantes = variantes.length;
    return choisi;
  }

  var etats = scenes.map(function (scene) {
    return {
      scene: scene,
      fond: scene.querySelector('.scene-fond'),
      persos: { a: scene.querySelector('.perso-a'), b: scene.querySelector('.perso-b') },
      repliques: Array.prototype.slice.call(scene.querySelectorAll('.scene-dialogue > .replique')),
      courante: undefined,
      fin: false,
      parle: null,
      poses: { a: 'marche', b: 'marche' },
      bulle: null,
      pas: -1,
      visible: false,
    };
  });

  // Place la bulle au-dessus de la tête de celui qui parle, sans sortir de l'écran.
  function placer(etat) {
    var bulle = etat.bulle;
    var perso = bulle && etat.persos[bulle.cle];
    if (!bulle || !perso || !etat.fond) return;
    var glisse = parseFloat(window.getComputedStyle(perso).translate) || 0;
    var centre = perso.offsetLeft + perso.offsetWidth / 2 + glisse;
    var tete = perso.offsetTop - perso.offsetHeight * 0.08;
    var marge = 12;
    var largeur = bulle.offsetWidth;
    var gauche = borner(centre - largeur / 2, marge, Math.max(marge, etat.fond.clientWidth - largeur - marge));
    var haut = Math.max(marge, tete - bulle.offsetHeight - 30);
    bulle.style.left = gauche.toFixed(1) + 'px';
    bulle.style.top = haut.toFixed(1) + 'px';
    bulle.style.setProperty('--pointe', borner(centre - gauche, 28, largeur - 28).toFixed(1) + 'px');
  }

  // Remplace la bulle affichée : l'ancienne s'estompe, la nouvelle arrive.
  function dire(etat, replique, cle) {
    if (!etat.fond) return;
    if (etat.bulle) {
      var ancienne = etat.bulle;
      etat.bulle = null;
      ancienne.classList.add('sortante');
      window.setTimeout(function () {
        if (ancienne.parentNode) ancienne.parentNode.removeChild(ancienne);
      }, calme ? 0 : 520);
    }
    if (!replique) return;
    var bulle = document.createElement('p');
    bulle.className = 'scene-bulle ' + cle + (replique.classList.contains('cri') ? ' cri' : '');
    bulle.setAttribute('aria-hidden', 'true');
    bulle.innerHTML = replique.innerHTML;
    bulle.cle = cle;
    etat.fond.appendChild(bulle);
    etat.bulle = bulle;
    if (replique.classList.contains('cri') && !calme) {
      etat.fond.classList.remove('secousse');
      void etat.fond.offsetWidth;
      etat.fond.classList.add('secousse');
    }
  }

  function actualiser() {
    var hauteur = window.innerHeight;
    etats.forEach(function (etat) {
      var cadre = etat.scene.getBoundingClientRect();
      etat.visible = cadre.bottom > 0 && cadre.top < hauteur;
      if (cadre.bottom < -hauteur || cadre.top > 2 * hauteur) return;

      // 1. L'avancée : 0 quand la scène arrive, 1 quand elle repart.
      var avance = borner(-cadre.top / Math.max(1, cadre.height - hauteur), 0, 1);
      if (!calme) {
        etat.scene.style.setProperty('--avance', avance.toFixed(4));
        var pas = Math.floor(avance * PAS);
        if (pas !== etat.pas) {
          etat.pas = pas;
          etat.scene.classList.toggle('pas-pair', pas % 2 === 0);
        }
      }

      // 2. La réplique en cours : la dernière dont le repère a passé le bas de l'écran.
      //    Une fois la dernière réplique remontée en haut de l'écran, c'est la fin de la scène.
      var courante = null;
      var fin = false;
      etat.repliques.forEach(function (replique, rang) {
        var haut = replique.getBoundingClientRect().top;
        if (haut < hauteur * 0.82) {
          courante = replique;
          if (rang === etat.repliques.length - 1 && haut < hauteur * 0.12) fin = true;
        }
      });
      if (fin) courante = null;

      if (courante !== etat.courante || fin !== etat.fin) {
        etat.courante = courante;
        etat.fin = fin;
        etat.scene.classList.toggle('fin', fin);

        // 3. Qui parle, et dans quelle pose.
        var parle = courante ? (courante.classList.contains('b') ? 'b' : 'a') : null;
        etat.parle = parle;
        ['a', 'b'].forEach(function (cle) {
          var perso = etat.persos[cle];
          if (!perso) return;
          var actif = cle === parle;
          perso.classList.toggle('parle', actif);
          perso.classList.toggle('ecoute', parle !== null && !actif);
          var pose = fin ? 'fin' : 'marche';
          if (courante) {
            pose = actif
              ? courante.getAttribute('data-pose') || 'parle'
              : courante.getAttribute('data-pose-autre') || 'ecoute';
          }
          etat.poses[cle] = pose;
          var dessin = poser(perso, pose, 0);
          if (dessin) dessin.style.filter = '';
        });
        dire(etat, courante, parle);
        window.setTimeout(demander, 240);
      }

      placer(etat);
    });
  }

  // Le frémissement de celui qui parle : on alterne ses dessins s'il en a plusieurs pour
  // la pose, sinon on déforme légèrement le trait.
  var image = 0;
  function fremir() {
    image += 1;
    etats.forEach(function (etat) {
      if (!etat.visible || !etat.parle) return;
      var perso = etat.persos[etat.parle];
      if (!perso) return;
      var dessin = poser(perso, etat.poses[etat.parle], image);
      if (dessin && dessin.variantes < 2) {
        dessin.style.filter = FILTRE + ' url(#glotte-fremit-' + (image % IMAGES) + ')';
      }
    });
  }
  if (!calme) window.setInterval(fremir, CADENCE);

  var attente = false;
  function demander() {
    if (attente) return;
    attente = true;
    window.requestAnimationFrame(function () {
      attente = false;
      actualiser();
    });
  }

  window.addEventListener('scroll', demander, { passive: true });
  window.addEventListener('resize', demander);
  window.addEventListener('load', demander);
  actualiser();
})();
