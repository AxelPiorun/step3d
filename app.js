// Step3D — application d'annotation de la marche.
// Les fichiers d'essai (JSON) sont dans essais/ ; les sujets, visites, essais
// et événements (pose / lever) sont dans la base Supabase.

// La base n'est pas obligatoire pour essayer l'application : sans connexion,
// tout fonctionne mais les événements ne sont pas enregistrés.
const db = window.SUPABASE_URL ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY) : null;

// État global de l'application.
const etat = {
  essais: [],      // fichiers JSON disponibles (manifest)
  sujets: [], visites: [], essaisBase: [], comptes: {},
  courant: null,   // essai ouvert : { base, meta, json, image, lecture, vitesse, evenements, selection, retour }
};

// ---- petits outils ----
function dateFr(iso) {
  if (!iso) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

function nombreFr(v, decimales = 2) {
  return Number(v).toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function toast(texte, erreur = false) {
  const t = document.getElementById("toast");
  t.textContent = texte;
  t.hidden = false;
  t.className = erreur ? "erreur" : "";
  clearTimeout(toast._minuterie);
  toast._minuterie = setTimeout(() => { t.hidden = true; }, 3500);
}

function message(element, texte, erreur = false) {
  element.textContent = texte;
  element.className = "message" + (erreur ? " erreur" : "");
}

// ---- démarrage ----
(async function demarrer() {
  try {
    etat.manifest = await (await fetch("essais/manifest.json")).json();
  } catch {
    toast("Impossible de lire la liste des essais (essais/manifest.json).", true);
    return;
  }
  await chargerBase();
})();

async function chargerBase() {
  if (!db) { baseLocale(); return; }
  const [sujets, visites, essaisBase, evenements] = await Promise.all([
    db.from("sujet").select("*").order("code"),
    db.from("visite").select("*").order("numero"),
    db.from("essai").select("*").order("numero"),
    db.from("evenement").select("id_essai"),
  ]);
  if (sujets.error || visites.error || essaisBase.error || evenements.error) {
    toast("Erreur de lecture de la base : " + (sujets.error || visites.error || essaisBase.error || evenements.error).message, true);
    return;
  }
  if (sujets.data.length === 0) await importerManifest();

  etat.sujets = sujets.data;
  etat.visites = visites.data;
  etat.essaisBase = essaisBase.data;
  etat.comptes = {};
  for (const e of evenements.data) etat.comptes[e.id_essai] = (etat.comptes[e.id_essai] || 0) + 1;
  construireArbre();
}

// Sans base : arbre reconstruit à partir du manifest, avec des identifiants négatifs
// pour ne pas ressembler à de vraies clés de la base.
function baseLocale() {
  const codes = [...new Set(etat.manifest.map(m => m.sujet))];
  etat.sujets = codes.map((c, i) => ({ id_sujet: -(i + 1), code: c }));
  const parCode = Object.fromEntries(etat.sujets.map(s => [s.code, s.id_sujet]));
  const clesVisites = [...new Set(etat.manifest.map(m => m.sujet + "-" + m.visite))];
  etat.visites = clesVisites.map((cle, i) => {
    const [sujet, numero] = cle.split("-");
    const meta = etat.manifest.find(m => m.sujet === sujet && m.visite === Number(numero));
    return { id_visite: -(i + 1), id_sujet: parCode[sujet], numero: Number(numero), date_visite: meta.date_visite };
  });
  const cleVisite = v => etat.sujets.find(s => s.id_sujet === v.id_sujet).code + "-" + v.numero;
  const parCle = Object.fromEntries(etat.visites.map(v => [cleVisite(v), v.id_visite]));
  etat.essaisBase = etat.manifest.map((m, i) => ({
    id_essai: -(i + 1), id_visite: parCle[m.sujet + "-" + m.visite],
    numero: m.essai, fichier: m.fichier, frequence_hz: m.frequence_hz, nb_images: m.nb_images,
  }));
  etat.comptes = {};
  construireArbre();
  toast("Base non connectée : les événements ne seront pas enregistrés.", true);
}

// Au premier lancement, la base est remplie depuis le manifest.
async function importerManifest() {
  const codes = [...new Set(etat.manifest.map(m => m.sujet))];
  const { data: sujets, error: errS } = await db.from("sujet").insert(codes.map(c => ({ code: c }))).select();
  if (errS) { toast("Import impossible : " + errS.message, true); return; }

  const parCode = Object.fromEntries(sujets.map(s => [s.code, s.id_sujet]));
  const visites = etat.manifest.map(m => ({
    id_sujet: parCode[m.sujet], numero: m.visite, date_visite: m.date_visite,
  }));
  const cleVisite = v => v.id_sujet + "-" + v.numero;
  const visitesUniques = [...new Map(visites.map(v => [cleVisite(v), v])).values()];
  const { data: visitesIns, error: errV } = await db.from("visite").insert(visitesUniques).select();
  if (errV) { toast("Import des visites impossible : " + errV.message, true); return; }

  const parCle = Object.fromEntries(visitesIns.map(v => [cleVisite(v), v.id_visite]));
  const essais = etat.manifest.map(m => ({
    id_visite: parCle[m.sujet + "-" + m.visite], numero: m.essai,
    fichier: m.fichier, frequence_hz: m.frequence_hz, nb_images: m.nb_images,
  }));
  const { error: errE } = await db.from("essai").insert(essais);
  if (errE) { toast("Import des essais impossible : " + errE.message, true); return; }
}

// ---- arbre des sujets (colonne gauche) ----
function construireArbre() {
  const arbre = document.getElementById("arbre-sujets");
  arbre.replaceChildren();

  for (const sujet of etat.sujets) {
    const visites = etat.visites.filter(v => v.id_sujet === sujet.id_sujet).sort((a, b) => a.numero - b.numero);
    const idsVisites = visites.map(v => v.id_visite);
    const essais = etat.essaisBase.filter(e => idsVisites.includes(e.id_visite)).sort((a, b) => a.numero - b.numero);

    const divSujet = document.createElement("div");
    divSujet.className = "sujet";
    const ligne = document.createElement("div");
    ligne.className = "sujet-ligne";
    ligne.append(Object.assign(document.createElement("span"), { textContent: sujet.code }));
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `${essais.length} essai${essais.length > 1 ? "s" : ""}`;
    ligne.append(badge);
    divSujet.append(ligne);

    for (const visite of visites) {
      const pVisite = document.createElement("p");
      pVisite.className = "visite";
      pVisite.textContent = `Visite ${visite.numero} · ${dateFr(visite.date_visite)}`;
      divSujet.append(pVisite);

      for (const essai of essais.filter(e => e.id_visite === visite.id_visite)) {
        const item = document.createElement("div");
        item.className = "essai-item";
        if (etat.courant && etat.courant.base.id_essai === essai.id_essai) item.classList.add("actif");
        item.append(Object.assign(document.createElement("span"), { textContent: `Essai ${essai.numero}` }));
        const annote = (etat.comptes[essai.id_essai] || 0) > 0;
        const b = document.createElement("span");
        b.className = "badge " + (annote ? "ok" : "attente");
        b.textContent = annote ? "annoté" : "à faire";
        item.append(b);
        item.addEventListener("click", () => ouvrirEssai(essai, item));
        divSujet.append(item);
      }
    }
    arbre.append(divSujet);
  }
}

// ---- ouverture d'un essai ----
async function ouvrirEssai(essai, element) {
  const visite = etat.visites.find(v => v.id_visite === essai.id_visite);
  const sujet = etat.sujets.find(s => s.id_sujet === visite.id_sujet);
  message(document.getElementById("message-essai"), "Chargement de l'essai…");

  let json;
  try {
    json = await (await fetch("essais/" + essai.fichier)).json();
  } catch {
    message(document.getElementById("message-essai"), "Impossible de lire " + essai.fichier, true);
    return;
  }

  // Arrête la lecture de l'essai précédent.
  Lecteur.arreter();

  etat.courant = {
    base: essai, sujet, visite, json,
    image: 0, lecture: false, vitesse: 1,
    evenements: [], selection: null, retour: [],
  };

  document.querySelectorAll(".essai-item").forEach(el => el.classList.remove("actif"));
  if (element) element.classList.add("actif");

  const duree = essai.nb_images / essai.frequence_hz;
  document.getElementById("titre-essai").textContent =
    `${sujet.code} · Visite ${visite.numero} · Essai ${essai.numero}`;
  document.getElementById("info-essai").textContent =
    `${essai.nb_images} images · ${essai.frequence_hz} Hz · ${nombreFr(duree, 1)} s`;
  document.getElementById("tot-image").textContent = essai.nb_images - 1;
  document.getElementById("btn-export").disabled = false;
  document.getElementById("btn-enregistrer").disabled = false;
  document.querySelectorAll("[data-pied]").forEach(b => b.disabled = false);

  Scene3D.charger(json);
  await Evenements.charger(essai.id_essai);
  Lecteur.allerImage(0);
  message(document.getElementById("message-essai"), "");
}

// ---- nouveau sujet ----
document.getElementById("btn-nouveau-sujet").addEventListener("click", async () => {
  const code = prompt("Code du nouveau sujet (par exemple S04) :");
  if (!code) return;
  const propre = code.trim().toUpperCase();
  if (!db) {
    etat.sujets.push({ id_sujet: etat.sujets.length - 1 - 1000, code: propre });
    construireArbre();
    toast("Sujet " + propre + " créé (base non connectée : rien n'est enregistré).", true);
    return;
  }
  const { error } = await db.from("sujet").insert({ code: propre });
  if (error) { toast("Création impossible : " + error.message, true); return; }
  await chargerBase();
  toast("Sujet " + propre + " créé.");
});

// ---- outils partagés ----
window.App = { etat, db, dateFr, nombreFr, toast, message, construireArbre };