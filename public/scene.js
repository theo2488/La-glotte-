/*
  Scènes à personnages : le défilement fait avancer les personnages et la discussion.
  Script maison, hébergé avec le site : il ne collecte rien, ne dépose aucun cookie
  et ne charge rien d'ailleurs. Il n'est inclus que dans les pages qui contiennent une scène.
  Sans lui (script bloqué), la scène reste lisible grâce à la version CSS.
*/
(function () {
  'use strict';

  var scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));
  if (scenes.length === 0) return;

  var calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PAS = 14; // nombre de pas sur la traversée de la scène
  document.documentElement.classList.add('scenes-actives');

  function borner(valeur) {
    return Math.max(0, Math.min(1, valeur));
  }

  // Affiche, pour un personnage, le dessin de la pose demandée (ou le premier dessin).
  function poser(perso, pose) {
    var dessins = perso.querySelectorAll('[data-pose]');
    if (dessins.length === 0) return;
    var choisi = null;
    for (var i = 0; i < dessins.length; i++) {
      if (dessins[i].getAttribute('data-pose') === pose) choisi = dessins[i];
    }
    if (!choisi) choisi = dessins[0];
    for (var j = 0; j < dessins.length; j++) {
      dessins[j].classList.toggle('pose-active', dessins[j] === choisi);
    }
  }

  var etats = scenes.map(function (scene) {
    return {
      scene: scene,
      persos: { a: scene.querySelector('.perso-a'), b: scene.querySelector('.perso-b') },
      repliques: Array.prototype.slice.call(scene.querySelectorAll('.replique')),
      courante: undefined,
      pas: -1,
    };
  });

  function actualiser() {
    var hauteur = window.innerHeight;
    etats.forEach(function (etat) {
      var cadre = etat.scene.getBoundingClientRect();
      if (cadre.bottom < -hauteur || cadre.top > 2 * hauteur) return;

      // 1. L'avancée : 0 quand la scène arrive, 1 quand elle repart.
      var avance = borner(-cadre.top / Math.max(1, cadre.height - hauteur));
      if (!calme) {
        etat.scene.style.setProperty('--avance', avance.toFixed(4));
        var pas = Math.floor(avance * PAS);
        if (pas !== etat.pas) {
          etat.pas = pas;
          etat.scene.classList.toggle('pas-pair', pas % 2 === 0);
        }
      }

      // 2. La réplique en cours : la dernière bulle arrivée au-dessus du bas de l'écran.
      var courante = null;
      etat.repliques.forEach(function (replique) {
        var haut = replique.getBoundingClientRect().top;
        if (haut < hauteur * 0.82) {
          replique.classList.add('dite');
          if (haut > -hauteur * 0.2) courante = replique;
        } else {
          replique.classList.remove('dite');
        }
      });
      if (courante === etat.courante) return;
      etat.courante = courante;

      // 3. Qui parle, et dans quelle pose.
      var parle = courante ? (courante.classList.contains('b') ? 'b' : 'a') : null;
      ['a', 'b'].forEach(function (cle) {
        var perso = etat.persos[cle];
        if (!perso) return;
        var actif = cle === parle;
        perso.classList.toggle('parle', actif);
        perso.classList.toggle('ecoute', parle !== null && !actif);
        var pose = 'marche';
        if (courante) {
          pose = actif
            ? courante.getAttribute('data-pose') || 'parle'
            : courante.getAttribute('data-pose-autre') || 'ecoute';
        }
        poser(perso, pose);
      });
    });
  }

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
