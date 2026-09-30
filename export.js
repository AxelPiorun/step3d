// Export Excel de l'essai annoté : liste des événements + paramètres.

document.getElementById("btn-export").addEventListener("click", async () => {
  const e = App.etat.courant;
  if (!e) return;

  const classeur = new ExcelJS.Workbook();
  const feuille = classeur.addWorksheet("Événements");
  feuille.columns = [
    { header: "Pied", key: "pied", width: 10 },
    { header: "Événement", key: "type", width: 14 },
    { header: "Image", key: "image", width: 10 },
    { header: "Temps (s)", key: "temps", width: 12 },
  ];
  for (const ev of [...e.evenements].sort((a, b) => a.image - b.image)) {
    feuille.addRow({
      pied: ev.pied === "G" ? "Gauche" : "Droit",
      type: ev.type === "pose" ? "Pose" : "Lever",
      image: ev.image,
      temps: Number((ev.image / e.base.frequence_hz).toFixed(3)),
    });
  }

  const infos = classeur.addWorksheet("Infos");
  infos.columns = [
    { header: "Sujet", key: "a", width: 12 },
    { header: "Visite", key: "b", width: 12 },
    { header: "Essai", key: "c", width: 12 },
    { header: "Fréquence (Hz)", key: "d", width: 16 },
    { header: "Images", key: "e", width: 10 },
    { header: "Durée (s)", key: "f", width: 12 },
    { header: "Cadence (pas/min)", key: "g", width: 20 },
    { header: "Appui G (%)", key: "h", width: 14 },
    { header: "Appui D (%)", key: "i", width: 14 },
  ];
  infos.addRow({
    a: e.sujet.code, b: e.visite.numero, c: e.base.numero,
    d: e.base.frequence_hz, e: e.base.nb_images,
    f: Number((e.base.nb_images / e.base.frequence_hz).toFixed(2)),
    g: document.getElementById("p-cadence").textContent,
    h: document.getElementById("p-appui-g").textContent,
    i: document.getElementById("p-appui-d").textContent,
  });

  const tampon = await classeur.xlsx.writeBuffer();
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([tampon], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  lien.download = `${e.sujet.code}_V${e.visite.numero}_E${e.base.numero}_evenements.xlsx`;
  lien.click();
  URL.revokeObjectURL(lien.href);
  App.toast("Export Excel téléchargé.");
});