// Configurazione della visita 3D: modello e punti di partenza (posizione dei piedi in metri, yaw in gradi)
window.VS_WALK = {
  model: 'model/villa.glb',
  groundY: -2.6,
  starts: [
    { name: 'Davanti alla villa', pos: [7, -2.6, 24], yaw: 0 },
    { name: 'Piano terra', pos: [7, 0, 2], yaw: 0 },
    { name: 'Piano nobile', pos: [7, 5.58, -5], yaw: 180 },
    { name: 'Piano superiore', pos: [7, 10.5, -5], yaw: 0 }
  ]
};
