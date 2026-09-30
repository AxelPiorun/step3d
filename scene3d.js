// Scène 3D des marqueurs (Three.js). Le repère du fichier JSON a l'axe z vertical :
// on le convertit en repère Three.js (axe y vertical) : (x, y, z)_json -> (x, z, y)_three.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COULEURS = { G: 0x3fb2e8, D: 0xe0813a, bassin: 0x98a4b5 };
const MARQUEURS_BASSIN = ["L_IAS", "L_IPS", "R_IPS", "R_IAS"];
// Fil d'armature : bassin et chaîne de chaque jambe.
const LIENS = [
  ["L_IAS", "L_IPS"], ["R_IAS", "R_IPS"], ["L_IPS", "R_IPS"], ["L_IAS", "R_IAS"],
  ["L_FTC", "L_FLE"], ["L_FLE", "L_FAX"], ["L_FAX", "L_TTC"], ["L_TTC", "L_FAL"],
  ["L_FAL", "L_FCC"], ["L_FCC", "L_FM1"], ["L_FM1", "L_FM5"], ["L_FM5", "L_FAL"],
  ["R_FTC", "R_FLE"], ["R_FLE", "R_FAX"], ["R_FAX", "R_TTC"], ["R_TTC", "R_FAL"],
  ["R_FAL", "R_FCC"], ["R_FCC", "R_FM1"], ["R_FM1", "R_FM5"], ["R_FM5", "R_FAL"],
];
// Traînées dessinées derrière le sujet.
const TRAINES = ["L_FM1", "R_FM1"];

const canvas = document.getElementById("canvas3d");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1526);
scene.fog = new THREE.Fog(0x0d1526, 6, 14);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
camera.position.set(1.6, 1.3, -2.2);
camera.lookAt(0, 1, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// Lumière douce pour que les sphères soient lisibles.
scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const lumiere = new THREE.DirectionalLight(0xffffff, 0.9);
lumiere.position.set(2, 4, -1);
scene.add(lumiere);

// Sol : grande dalle sombre + quadrillage.
const sol = new THREE.Mesh(
  new THREE.CircleGeometry(3, 64),
  new THREE.MeshBasicMaterial({ color: 0x101c31 })
);
sol.rotation.x = -Math.PI / 2;
sol.position.y = -0.002;
scene.add(sol);
const grille = new THREE.GridHelper(6, 12, 0x24344f, 0x1a2740);
grille.position.y = 0.001;
scene.add(grille);

// Marqueurs (sphères) et liens (fils) créés une fois pour toutes.
const spheres = {};   // nom -> mesh
const liens = [];     // { ligne, a, b }
const traines = {};   // nom -> ligne

function creerMarqueurs(noms) {
  for (const nom of noms) {
    const cote = nom.startsWith("L_") ? "G" : nom.startsWith("R_") ? "D" : "bassin";
    const couleur = MARQUEURS_BASSIN.includes(nom) ? COULEURS.bassin : COULEURS[cote];
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 20, 14),
      new THREE.MeshBasicMaterial({ color: couleur })
    );
    sphere.visible = false;
    scene.add(sphere);
    spheres[nom] = sphere;
  }
  for (const [a, b] of LIENS) {
    if (!noms.includes(a) || !noms.includes(b)) continue;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const ligne = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4a5c7d, transparent: true, opacity: 0.7 }));
    scene.add(ligne);
    liens.push({ ligne, a, b });
  }
  for (const nom of TRAINES) {
    if (!noms.includes(nom)) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(noms.length ? 3 : 3), 3));
    const ligne = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: nom.startsWith("L_") ? COULEURS.G : COULEURS.D, transparent: true, opacity: 0.45 }));
    scene.add(ligne);
    traines[nom] = ligne;
  }
}

let donnees = null; // essai chargé : { marqueurs, nb_images, frequence_hz }

function charger(json) {
  const noms = Object.keys(json.marqueurs);
  // Crée les marqueurs manquants (premier chargement ou essai différent).
  for (const nom of noms) if (!spheres[nom]) creerMarqueurs(noms);

  donnees = json;
  // Prépare les traînées à la bonne taille.
  for (const [nom, ligne] of Object.entries(traines)) {
    const points = json.marqueurs[nom];
    if (!points) { ligne.visible = false; continue; }
    const tableau = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      [tableau[i * 3], tableau[i * 3 + 1], tableau[i * 3 + 2]] = [points[i][0], points[i][2], points[i][1]];
    }
    ligne.geometry.dispose();
    ligne.geometry = new THREE.BufferGeometry();
    ligne.geometry.setAttribute("position", new THREE.BufferAttribute(tableau, 3));
    ligne.geometry.setDrawRange(0, 1);
    ligne.visible = true;
  }
  // Cadre la caméra sur le sujet (centre des marqueurs captes à l'image 0).
  const cible = new THREE.Vector3();
  let compte = 0;
  for (const nom of noms) {
    const p = json.marqueurs[nom][0];
    if (p[0] === 0 && p[1] === 0 && p[2] === 0) continue;
    cible.x += p[0]; cible.y += p[2]; cible.z += p[1]; compte++;
  }
  if (compte > 0) cible.divideScalar(compte); else cible.set(0, 0.9, 0);
  controls.target.copy(cible);
  camera.position.set(cible.x + 1.7, cible.y + 0.4, cible.z - 2.4);
}

// Affiche l'image i (les marqueurs non captés — en (0, 0, 0) — sont cachés).
function afficher(i) {
  if (!donnees) return;
  for (const [nom, sphere] of Object.entries(spheres)) {
    const points = donnees.marqueurs[nom];
    if (!points || !points[i]) { sphere.visible = false; continue; }
    const [x, y, z] = points[i];
    const nonCapte = x === 0 && y === 0 && z === 0;
    sphere.visible = !nonCapte;
    sphere.position.set(x, z, y);
  }
  for (const { ligne, a, b } of liens) {
    const pa = spheres[a], pb = spheres[b];
    const visible = pa && pb && pa.visible && pb.visible;
    ligne.visible = visible;
    if (visible) {
      const pos = ligne.geometry.attributes.position;
      pos.setXYZ(0, pa.position.x, pa.position.y, pa.position.z);
      pos.setXYZ(1, pb.position.x, pb.position.y, pb.position.z);
      pos.needsUpdate = true;
    }
  }
  for (const ligne of Object.values(traines)) {
    if (ligne.visible) ligne.geometry.setDrawRange(0, i + 1);
  }
}

// Adapter le canvas à la taille de la vue.
function redimensionner() {
  const parent = canvas.parentElement;
  const l = parent.clientWidth, h = parent.clientHeight;
  if (l === 0 || h === 0) return;
  renderer.setSize(l, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.aspect = l / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(redimensionner).observe(canvas.parentElement);
redimensionner();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

window.Scene3D = { charger, afficher };