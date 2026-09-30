// Événements de marche : pose du pied (contact) et lever (décollement),
// pour chaque pied. Placés à l'image courante, corrigibles, enregistrés en base.

const Evenements = {
  async charger(idEssai) {
    const e = App.etat.courant;
    e.evenements = [];
    e.selection = null;
    e.retour = [];
    const { data, error } = App.db
      ? await App.db.from("evenement").select("*").eq("id_essai", idEssai).order("image")
      : { data: [], error: null };
    if (error) { App.toast("Lecture des événements impossible : " + error.message, true); }
    else e.evenements = data.map(r => ({ id: r.id_evenement, pied: r.pied, type: r.type, image: r.image }));
    this.afficherListe();
    this.dessinerChronologie();
    this.calculerParametres();
    Lecteur.allerImage(e.image);
  },

  // Pose ou lever d'un pied à l'image courante. Si un événement est choisi dans
  // la liste (mode correction), le bouton le déplace au lieu d'en créer un.
  placer(pied, type) {
    const e = App.etat.courant;
    if (!e) return;
    const choisi = e.selection !== null ? e.evenements[e.selection] : null;
    if (choisi && choisi.pied === pied && choisi.type === type) {
      e.retour.push({ op: "deplacer", index: e.selection, avant: choisi.image });
      choisi.image = e.image;
      App.toast(`Événement déplacé à l'image ${e.image}.`);
    } else {
      e.retour.push({ op: "ajouter" });
      e.evenements.push({ id: null, pied, type, image: e.image });
      e.selection = e.evenements.length - 1;
    }
    this.afficherListe();
    this.dessinerChronologie();
    this.calculerParametres();
    majAffichage();
  },

  // W / B : alterne pose puis lever pour le pied.
  alterner(pied) {
    const e = App.etat.courant;
    if (!e) return;
    const choisi = e.selection !== null ? e.evenements[e.selection] : null;
    if (choisi && choisi.pied === pied) {
      e.retour.push({ op: "modifier", index: e.selection, avant: { type: choisi.type, image: choisi.image } });
      choisi.type = choisi.type === "pose" ? "lever" : "pose";
      choisi.image = e.image;
      this.afficherListe();
      this.dessinerChronologie();
      this.calculerParametres();
      majAffichage();
      return;
    }
    this.placer(pied, this.estAuSol(pied, e.image) ? "lever" : "pose");
  },

  choisir(index) {
    const e = App.etat.courant;
    e.selection = e.selection === index ? null : index;
    this.afficherListe();
    if (e.selection !== null) Lecteur.allerImage(e.evenements[index].image);
  },

  supprimer(index) {
    const e = App.etat.courant;
    if (!e || !e.evenements[index]) return;
    e.retour.push({ op: "retirer", evenement: e.evenements[index], index });
    e.evenements.splice(index, 1);
    e.selection = null;
    this.afficherListe();
    this.dessinerChronologie();
    this.calculerParametres();
    majAffichage();
  },

  annuler() {
    const e = App.etat.courant;
    if (!e || e.retour.length === 0) { App.toast("Rien à annuler."); return; }
    const action = e.retour.pop();
    if (action.op === "ajouter") {
      e.evenements.pop();
      e.selection = null;
    } else if (action.op === "deplacer") {
      e.evenements[action.index].image = action.avant;
    } else if (action.op === "modifier") {
      Object.assign(e.evenements[action.index], action.avant);
    } else if (action.op === "retirer") {
      e.evenements.splice(action.index, 0, action.evenement);
    }
    this.afficherListe();
    this.dessinerChronologie();
    this.calculerParametres();
    majAffichage();
    App.toast("Action annulée.");
  },

  estAuSol(pied, image) {
    const e = App.etat.courant;
    if (!e) return false;
    const duPied = e.evenements.filter(ev => ev.pied === pied).sort((a, b) => a.image - b.image);
    let sol = false;
    for (const ev of duPied) {
      if (ev.type === "pose" && ev.image <= image) sol = true;
      if (ev.type === "lever" && ev.image <= image) sol = false;
    }
    return sol;
  },

  afficherListe() {
    const e = App.etat.courant;
    const liste = document.getElementById("liste-evenements");
    const compte = document.getElementById("compte-evenements");
    liste.replaceChildren();
    if (!e) { compte.textContent = "0"; return; }
    compte.textContent = e.evenements.length;
    message(document.getElementById("message-evenements"),
      e.selection !== null
        ? "Événement choisi : cliquez à nouveau dessus pour le déselectionner, ou utilisez les boutons pour le déplacer."
        : (e.evenements.length === 0 ? "Aucun événement. Utilisez W, B ou les boutons ci-dessus à l'image voulue." : ""));

    const tries = e.evenements
      .map((ev, index) => ({ ev, index }))
      .sort((a, b) => a.ev.image - b.ev.image || a.index - b.index);
    for (const { ev, index } of tries) {
      const li = document.createElement("li");
      if (e.selection === index) li.classList.add("choisi");
      const fleche = document.createElement("span");
      fleche.className = "fleche " + ev.type;
      fleche.textContent = ev.type === "pose" ? "▼" : "▲";
      const nom = document.createElement("span");
      nom.className = "nom";
      nom.textContent = `${ev.type === "pose" ? "Pose" : "Lever"} ${ev.pied}`;
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = `img ${ev.image} · ${nombreFr(ev.image / e.base.frequence_hz)} s`;
      const retirer = document.createElement("button");
      retirer.className = "retirer";
      retirer.type = "button";
      retirer.textContent = "✕";
      retirer.title = "Supprimer cet événement";
      retirer.addEventListener("click", (ev2) => { ev2.stopPropagation(); this.supprimer(index); });
      li.append(fleche, nom, detail, retirer);
      li.addEventListener("click", () => this.choisir(index));
      liste.append(li);
    }
  },

  // Bandes d'appui : entre une pose et le lever suivant du même pied.
  dessinerChronologie() {
    const e = App.etat.courant;
    if (!e) return;
    const nb = e.base.nb_images;
    for (const pied of ["G", "D"]) {
      const ligne = document.getElementById("ligne-" + pied.toLowerCase());
      ligne.replaceChildren();
      const duPied = e.evenements.filter(ev => ev.pied === pied).sort((a, b) => a.image - b.image);
      for (let i = 0; i < duPied.length; i++) {
        if (duPied[i].type !== "pose") continue;
        const lever = duPied.find((ev, j) => j > i && ev.type === "lever" && ev.image >= duPied[i].image);
        const debut = duPied[i].image;
        const fin = lever ? lever.image : nb - 1;
        const bande = document.createElement("div");
        bande.className = "appui";
        bande.style.left = (debut / nb * 100) + "%";
        bande.style.width = (Math.max(fin - debut, 1) / nb * 100) + "%";
        bande.title = `Appui ${pied} : img ${debut} → ${fin}`;
        bande.innerHTML = pied === "G"
          ? '<svg viewBox="0 0 32 20" preserveAspectRatio="none"><path d="M2 12 C2 6 8 4 14 5 L26 7 C30 8 30 13 26 14 L10 17 C5 18 2 16 2 12 Z" fill="#3fb2e8" opacity="0.85"/></svg>'
          : '<svg viewBox="0 0 32 20" preserveAspectRatio="none"><path d="M2 12 C2 6 8 4 14 5 L26 7 C30 8 30 13 26 14 L10 17 C5 18 2 16 2 12 Z" fill="#e0813a" opacity="0.85"/></svg>';
        ligne.append(bande);
      }
    }
  },

  // Cadence (pas par minute) et durée d'appui en % du cycle.
  calculerParametres() {
    const e = App.etat.courant;
    if (!e) return;
    const dureeMin = e.base.nb_images / e.base.frequence_hz / 60;
    const poses = e.evenements.filter(ev => ev.type === "pose").length;
    document.getElementById("p-cadence").textContent = poses > 0 && dureeMin > 0 ? Math.round(poses / dureeMin) + " pas/min" : "—";

    for (const pied of ["G", "D"]) {
      const el = document.getElementById("p-appui-" + pied.toLowerCase());
      const duPied = e.evenements.filter(ev => ev.pied === pied).sort((a, b) => a.image - b.image);
      const rapports = [];
      for (let i = 0; i < duPied.length; i++) {
        if (duPied[i].type !== "pose") continue;
        const lever = duPied.find((ev, j) => j > i && ev.type === "lever" && ev.image >= duPied[i].image);
        const poseSuivante = duPied.find((ev, j) => j > i && ev.type === "pose" && ev.image > duPied[i].image);
        if (!lever || !poseSuivante || poseSuivante.image <= duPied[i].image) continue;
        rapports.push((lever.image - duPied[i].image) / (poseSuivante.image - duPied[i].image));
      }
      el.textContent = rapports.length
        ? nombreFr(100 * rapports.reduce((s, r) => s + r, 0) / rapports.length, 0) + " %"
        : "—";
    }
  },

  // Enregistre tous les événements de l'essai dans la base.
  async enregistrer() {
    const e = App.etat.courant;
    if (!e) return;
    if (!App.db) { App.toast("Base non connectée : impossible d'enregistrer.", true); return; }
    const bouton = document.getElementById("btn-enregistrer");
    bouton.disabled = true;
    message(document.getElementById("message-essai"), "Enregistrement…");

    const { error: errSup } = await App.db.from("evenement").delete().eq("id_essai", e.base.id_essai);
    if (errSup) { App.toast("Enregistrement impossible : " + errSup.message, true); bouton.disabled = false; return; }

    let errIns = null;
    for (let debut = 0; debut < e.evenements.length; debut += 100) {
      const lot = e.evenements.slice(debut, debut + 100).map(ev => ({
        id_essai: e.base.id_essai, pied: ev.pied, type: ev.type, image: ev.image,
      }));
      const { error } = await App.db.from("evenement").insert(lot);
      if (error) { errIns = error; break; }
    }
    bouton.disabled = false;
    if (errIns) { App.toast("Enregistrement impossible : " + errIns.message, true); return; }

    App.toast(`Essai enregistré : ${e.evenements.length} événement(s).`);
    message(document.getElementById("message-essai"), "");
    await App.chargerBase();
  },
};

window.Evenements = Evenements;

for (const bouton of document.querySelectorAll("[data-pied]")) {
  bouton.addEventListener("click", () => Evenements.placer(bouton.dataset.pied, bouton.dataset.type));
}
document.getElementById("btn-enregistrer").addEventListener("click", () => Evenements.enregistrer());