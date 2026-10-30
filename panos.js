// Catalogo delle viste 360 di Villa Selvatico (bozza: titoli e didascalie da confermare).
// id -> cartella pano/<id>/ con le facce cubo (512_*.jpg, 2048_*.jpg), preview.jpg e thumb.jpg
window.VS_PANOS = {
  "1593_1": { year: "1593", n: 1, title: "La prima villa", place: "Interno della sala", caption: "Ricostruzione in modello bianco dell'ambiente interno della villa cinquecentesca.", yaw0: 0, levels: [512, 2048] },
  "1593_1ai": { year: "1593", n: 1, title: "La prima villa", place: "Interno della sala · prova fotorealistica (AI)", caption: "La sala ottagonale con materiali plausibili (intonaco a calce, cornici in pietra, cotto): geometria del modello, resa fotografica generata.", yaw0: 0, levels: [512, 2048], variant: true },
  "1593_2": { year: "1593", n: 2, title: "La prima villa", place: "La terrazza", caption: "Modello bianco della villa e della terrazza: la ricostruzione ipotetica della prima villa.", yaw0: 0, levels: [512, 2048] },
  "1593_2ai": { year: "1593", n: 2, title: "La prima villa", place: "La terrazza · prova fotorealistica (AI)", caption: "La terrazza in trachite euganea (lastre a terra, muretti in opus incertum) e la villa con intonaco a calce; cielo, pianura e geometria del render originale.", yaw0: 0, levels: [512, 2048], variant: true },
  "1650_1": { year: "1650", n: 1, title: "Il giardino seicentesco", place: "La terrazza e il parterre", caption: "Il muro di sostegno della terrazza, il parterre disegnato e il viale alberato.", yaw0: 0, levels: [512, 2048] },
  "1650_1ai": { year: "1650", n: 1, title: "Il giardino seicentesco", place: "La terrazza e il parterre · prova fotorealistica (AI)", caption: "Il muro di sostegno in pietra, la rampa e il parterre con siepi e ghiaia resi fotorealistici dall'AI; cielo, pianura, viale dei cipressi e geometria del render originale.", yaw0: 0, levels: [512, 2048], variant: true },
  "1650_2": { year: "1650", n: 2, title: "Il giardino seicentesco", place: "Il viale dei cipressi", caption: "Il viale fiancheggiato dai cipressi, dal basso verso la villa.", yaw0: 0, levels: [512, 2048] },
  "1650_2ai": { year: "1650", n: 2, title: "Il giardino seicentesco", place: "Il viale dei cipressi · prova fotorealistica (AI)", caption: "Il viale verso la villa con la pavimentazione in pietrisco chiaro, le fasce in lastre di trachite e i cordoli resi fotorealistici dall'AI; cipressi, cielo, pianura e geometria del render originale.", yaw0: 0, levels: [512, 2048], variant: true },
  "1851_1": { year: "1851", n: 1, title: "Il giardino ottocentesco", place: "Il prato e la serra", caption: "Il grande prato con le siepi e la serra lungo il margine del giardino.", yaw0: 0, levels: [512, 2048] },
  "1851_2": { year: "1851", n: 2, title: "Il giardino ottocentesco", place: "Verso la villa", caption: "Il prato aperto verso la villa sul colle, con la serra sulla sinistra.", yaw0: 0, levels: [512, 2048] },
  "1870_1": { year: "1870", n: 1, title: "Il parco di fine Ottocento", place: "I viali in ghiaia", caption: "I viali in ghiaia fra gli alberi, con la villa sullo sfondo.", yaw0: 0, levels: [512, 2048] },
  "1870_2": { year: "1870", n: 2, title: "Il parco di fine Ottocento", place: "Il prato", caption: "Il prato e il viale curvo verso la villa.", yaw0: 0, levels: [512, 2048] },
  "1950_1": { year: "1950", n: 1, title: "Il giardino delle statue", place: "Viale verso la villa", caption: "Il giardino nel Novecento: le statue sui piedistalli, i vialetti in ghiaia e la villa sul colle.", yaw0: 0, levels: [512, 2048] },
  "1950_1ai": { year: "1950", n: 1, title: "Il giardino delle statue", place: "Viale verso la villa · prova fotorealistica (AI)", caption: "La stessa vista rielaborata con l'intelligenza artificiale per materiali, vegetazione e cielo più realistici: prova di confronto.", yaw0: 0, levels: [512, 2048], variant: true },
  "1950_2": { year: "1950", n: 2, title: "Il giardino delle statue", place: "Le aiuole fiorite", caption: "Le aiuole fiorite davanti alla villa, fra le statue del giardino.", yaw0: 0, levels: [512, 2048] }
};
// Ordine delle epoche nella linea del tempo
window.VS_ERAS = ["1593", "1650", "1851", "1870", "1950"];
