// Lecteur image par image : navigation Z Q S D (clavier français),
// lecture en continu, vitesses ¼× à 2×, boutons et chronologie.

const Lecteur = {
  arreter() {
    if (!window.App.etat.courant) return;
    App.etat.courant.lecture = false;
    majBoutonLecture();
  },

  allerImage(i) {
    const e = App.etat.courant;
    if (!e) return;
    e.image = Math.max(0, Math.min(e.base.nb_images - 1, Math.round(i)));
    Scene3D.afficher(e.image);
    majAffichage();
  },

  basculer() {
    const e = App.etat.courant;
    if (!e) return;
    e.lecture = !e.lecture;
    majBoutonLecture();
  },

  pause() {
    const e = App.etat.courant;
    if (!e) return;
    e.lecture = false;
    majBoutonLecture();
  },
};

window.Lecteur = Lecteur;

function majBoutonLecture() {
  const e = App.etat.courant;
  document.getElementById("btn-lecture").textContent = e && e.lecture ? "⏸" : "▶";
}

function majAffichage() {
  const e = App.etat.courant;
  if (!e) return;
  const temps = e.image / e.base.frequence_hz;
  document.getElementById("num-image").textContent = e.image;
  document.getElementById("temps-image").textContent = nombreFr(temps) + " s";
  document.getElementById("temps-lecteur").textContent = formaterTemps(temps);

  // État des pieds : au sol entre une pose et le lever qui suit.
  for (const pied of ["G", "D"]) {
    const sol = Evenements.estAuSol(pied, e.image);
    const el = document.getElementById("etat-" + pied.toLowerCase());
    el.textContent = sol ? "au sol" : "levé";
    el.className = sol ? "au-sol" : "leve";
  }
  // Tête de lecture sur la chronologie.
  const tete = document.getElementById("tete-lecture");
  tete.hidden = false;
  tete.style.left = (e.image / e.base.nb_images * 100) + "%";
}

function formaterTemps(t) {
  const minutes = Math.floor(t / 60);
  const secondes = t - minutes * 60;
  return String(minutes).padStart(2, "0") + ":" + secondes.toFixed(2).replace(".", ",").padStart(5, "0");
}

// ---- boucle de lecture ----
let dernierTemps = null;
function boucle(t) {
  requestAnimationFrame(boucle);
  const e = App.etat.courant;
  if (!e || !e.lecture) { dernierTemps = t; return; }
  if (dernierTemps === null) { dernierTemps = t; return; }
  const dt = (t - dernierTemps) / 1000;
  dernierTemps = t;
  Lecteur.allerImage(e.image + dt * e.base.frequence_hz * e.vitesse);
  if (e.image >= e.base.nb_images - 1) Lecteur.pause();
}
requestAnimationFrame(boucle);

// ---- boutons ----
document.getElementById("btn-lecture").addEventListener("click", () => Lecteur.basculer());
document.getElementById("btn-debut").addEventListener("click", () => Lecteur.allerImage(0));
document.getElementById("btn-fin").addEventListener("click", () => {
  const e = App.etat.courant;
  if (e) Lecteur.allerImage(e.base.nb_images - 1);
});
document.getElementById("btn-prev").addEventListener("click", () => {
  const e = App.etat.courant;
  if (e) Lecteur.allerImage(e.image - 1);
});
document.getElementById("btn-next").addEventListener("click", () => {
  const e = App.etat.courant;
  if (e) Lecteur.allerImage(e.image + 1);
});

for (const bouton of document.querySelectorAll("[data-vitesse]")) {
  bouton.addEventListener("click", () => {
    const e = App.etat.courant;
    if (!e) return;
    e.vitesse = Number(bouton.dataset.vitesse);
    document.querySelectorAll("[data-vitesse]").forEach(b => b.classList.toggle("active", b === bouton));
  });
}

// ---- clavier : Z Q S D + raccourcis d'annotation ----
window.addEventListener("keydown", (ev) => {
  const balise = ev.target.tagName;
  if (balise === "INPUT" || balise === "SELECT" || balise === "TEXTAREA") return;

  // Ctrl+Z : annuler la dernière action (même pendant la frappe ? non, hors champs).
  if (ev.ctrlKey && ev.key.toLowerCase() === "z") {
    ev.preventDefault();
    Evenements.annuler();
    return;
  }
  const touche = ev.key.toLowerCase();
  const actions = {
    z: () => Lecteur.basculer(),          // Z : lecture / pause
    q: () => { const e = App.etat.courant; if (e) Lecteur.allerImage(e.image - 1); },   // Q : image précédente
    d: () => { const e = App.etat.courant; if (e) Lecteur.allerImage(e.image + 1); },   // D : image suivante
    s: () => Lecteur.pause(),             // S : pause
    " ": () => { ev.preventDefault(); Lecteur.basculer(); },
    arrowleft: () => { const e = App.etat.courant; if (e) Lecteur.allerImage(e.image - 1); },
    arrowright: () => { const e = App.etat.courant; if (e) Lecteur.allerImage(e.image + 1); },
    w: () => Evenements.alterner("G"),    // W : pose / lever gauche
    b: () => Evenements.alterner("D"),    // B : pose / lever droit
  };
  const action = actions[touche];
  if (action) action();
});