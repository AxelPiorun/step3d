# Step3D — ce qu'il faut savoir

Application d'annotation de la marche : on regarde un essai de capture de mouvement
(marqueurs 3D), image par image, et on place les instants de **pose du pied** (contact
au sol) et de **lever du pied** (décollement), pour chaque pied.

## Données

- `essais/*.json` : les fichiers bruts de capture. Un fichier = un essai. Clés :
  `sujet`, `visite`, `essai`, `frequence_hz`, `unite` (m), `axe_vertical` (z = vertical),
  `nb_images`, `marqueurs` (dictionnaire nom → tableau de positions `[x, y, z]` par image).
- `essais/manifest.json` : liste des essais avec leur métadonnées (généré une fois,
  à regénérer si on ajoute des fichiers d'essai).
- Marqueurs : préfixe `L_` = pied gauche (couleur bleue), `R_` = pied droit (orange),
  `L_IAS/L_IPS/R_IPS/R_IAS` = bassin (gris). Un marqueur **exactement en (0, 0, 0)**
  n'est pas capté : il ne faut pas l'afficher.

## Base (projet Supabase « step3d »)

4 tables : `sujet (code)` → `visite (numero, date_visite)` → `essai (numero, fichier,
frequence_hz, nb_images)` → `evenement (pied G|D, type pose|lever, image)`.
Au premier chargement, si la base est vide, l'application crée sujets/visites/essais
depuis le manifest. Les événements sont remplacés à chaque « Enregistrer »
(suppression puis réinsertion en lots de 100).
RLS ouvertes en lecture, ajout, modification et suppression pour `anon` (données fictives).

## Fichiers

- `index.html`, `style.css` : interface (thème sombre inspiré de `maquette.png`).
- `config.js` : URL et clé publishable Supabase. Jamais de clé secrète ici.
- `app.js` : chargé en premier après `config.js` ; crée le client `db` (variable `App.db`),
  gère l'arbre des sujets et l'ouverture des essais. Sans base connectée, l'application
  tourne quand même (mode essai : rien n'est enregistré).
- `scene3d.js` : module Three.js (importmap). Convertit le repère JSON (z vertical) en
  repère Three (y vertical). Expose `window.Scene3D = { charger, afficher }`.
- `lecteur.js` : lecteur image par image. Expose `window.Lecteur = { arreter, allerImage,
  basculer, pause }` et appelle `Evenements.estAuSol` / `majAffichage`.
- `evenements.js` : pose/lever, corrections, annulation, chronologie, enregistrement.
  Expose `window.Evenements`. Appelle `majAffichage` (défini dans lecteur.js).
- `export.js` : export Excel (ExcelJS).
- Ordre de chargement des scripts dans `index.html` : ne pas le changer.

## Raccourcis clavier (clavier français AZERTY)

Z = lecture/pause · Q = image précédente · D = image suivante · S = pause ·
Espace = lecture/pause · W = pose/lever pied gauche (alterne) · B = pose/lever pied droit ·
Ctrl+Z = annuler.

## Pièges rencontrés

- Le jeton MCP Supabase ne peut pas créer de projet : la création du projet « step3d »
  s'est faite à la main dans le tableau de bord supabase.com.
- Pour tester en local depuis le dossier `Projets` :
  `npx.cmd --yes http-server step3d -p 8081 -c-1 --silent`
  (`npx.cmd` et non `npx`, PowerShell refuse les scripts non signés ; Python absent).
- Les dates s'affichent en jour/mois/année (ex. 02/06/2026), les nombres en format
  français (virgule décimale).