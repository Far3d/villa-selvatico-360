// Villa Selvatico 360 — visore per smartphone e occhiali VR a lenti fisse (FAR3D)
import * as THREE from './three.module.min.js';

const $ = (s) => document.querySelector(s);
const DEG = Math.PI / 180;
const PANOS = window.VS_PANOS || {};
const params = new URLSearchParams(location.search);
const panoId = PANOS[params.get('p')] ? params.get('p') : Object.keys(PANOS)[0];
const P = PANOS[panoId];

// ---------- calibrazione occhiali (salvata sul telefono) ----------
const CAL_KEY = 'vs360.cal.v2';
const CAL_DEFAULT = {
  pxmm: 6.0,   // pixel CSS per millimetro di schermo
  sep: 59,     // interasse lenti (mm) - misurato sugli occhiali FAR3D
  focal: 64,   // focale/zoom (mm) - distanza lente-schermo misurata con gli occhiali agganciati
  vert: 0,     // altezza lenti rispetto al centro dello schermo (mm, + verso il bordo di aggancio)
  diam: 34,    // diametro utile della lente (mm) - misurato
  mask: false, // maschera circolare
  target: false // mira di calibrazione in VR
};
let cal = { ...CAL_DEFAULT };
try {
  const saved = JSON.parse(localStorage.getItem(CAL_KEY) || 'null');
  if (saved && typeof saved === 'object') cal = { ...CAL_DEFAULT, ...saved };
} catch (e) { /* storage non disponibile */ }
function saveCal() { try { localStorage.setItem(CAL_KEY, JSON.stringify(cal)); } catch (e) {} }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- scena ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
scene.add(camera);

// Sei piani che formano un cubo visto dall'interno. Ogni faccia è già renderizzata
// come la si vede dal centro: f (-Z), b (+Z), r (+X), l (-X), u (+Y), d (-Y).
const FACES = {
  f: { pos: [0, 0, -1], rot: [0, 0, 0] },
  b: { pos: [0, 0, 1], rot: [0, Math.PI, 0] },
  r: { pos: [1, 0, 0], rot: [0, -Math.PI / 2, 0] },
  l: { pos: [-1, 0, 0], rot: [0, Math.PI / 2, 0] },
  u: { pos: [0, 1, 0], rot: [Math.PI / 2, 0, 0] },
  d: { pos: [0, -1, 0], rot: [-Math.PI / 2, 0, 0] }
};
const MARGIN = 2; // overscan in px usato nella generazione delle facce
const cube = new THREE.Group();
cube.scale.setScalar(50);
scene.add(cube);
const faceMesh = {};
for (const [k, f] of Object.entries(FACES)) {
  const g = new THREE.PlaneGeometry(2, 2);
  const m = new THREE.MeshBasicMaterial({ color: 0x1a1b20 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(...f.pos);
  mesh.rotation.set(...f.rot);
  cube.add(mesh);
  faceMesh[k] = mesh;
}
function setFaceUV(mesh, N) {
  const uv = mesh.geometry.attributes.uv;
  const a = MARGIN / N, b = 1 - MARGIN / N;
  uv.setXY(0, a, b); uv.setXY(1, b, b); uv.setXY(2, a, a); uv.setXY(3, b, a);
  uv.needsUpdate = true;
}

const loader = new THREE.TextureLoader();
let loadedCount = 0, totalCount = 0;
function loadLevel(N, onDone) {
  let left = 6;
  for (const k of Object.keys(FACES)) {
    loader.load(`pano/${panoId}/${N}_${k}.jpg`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const mesh = faceMesh[k];
      const old = mesh.material.map;
      mesh.material.map = tex;
      mesh.material.color.set(0xffffff);
      mesh.material.needsUpdate = true;
      setFaceUV(mesh, N);
      if (old) old.dispose();
      loadedCount++; updateProgress();
      if (--left === 0 && onDone) onDone();
      needsRender = true;
    }, undefined, () => { loadedCount++; updateProgress(); if (--left === 0 && onDone) onDone(); });
  }
}
const levels = P.levels || [512, 2048];
totalCount = 6 * levels.length;
function updateProgress() {
  const bar = $('#pb');
  if (bar) bar.style.width = Math.round(100 * loadedCount / totalCount) + '%';
  if (loadedCount >= 6) $('#ld').classList.add('gone');
}
(function chain(i) {
  if (i >= levels.length) return;
  loadLevel(levels[i], () => chain(i + 1));
})(0);

// ---------- orientamento: trascinamento + giroscopio ----------
let mode = 'mono';          // 'mono' | 'vr'
let calMode = false;        // in VR: i gesti regolano la calibrazione invece della vista
let gyroOn = false, gyroAvailable = false, gyroGranted = false;
let needsRender = true;
const look = { yaw: P.yaw0 * DEG || 0, pitch: 0 }; // modalità trascinamento
let yawOffset = 0;                                   // correzione manuale con giroscopio
let monoFov = 75;

// --- giroscopio (porting di DeviceOrientationControls di three.js) ---
const device = { alpha: null, beta: null, gamma: null };
let screenAngle = 0;
function readScreenAngle() {
  const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle
    : (typeof window.orientation === 'number' ? window.orientation : 0);
  screenAngle = a;
}
readScreenAngle();
window.addEventListener('orientationchange', () => { setTimeout(() => { readScreenAngle(); onResize(); }, 120); });
if (screen.orientation) screen.orientation.addEventListener('change', () => { readScreenAngle(); onResize(); });

const _zee = new THREE.Vector3(0, 0, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _euler = new THREE.Euler();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2); // -PI/2 attorno a X
const deviceQuat = new THREE.Quaternion();
function updateDeviceQuat() {
  const alpha = device.alpha != null ? device.alpha * DEG : 0;
  const beta = device.beta != null ? device.beta * DEG : 0;
  const gamma = device.gamma != null ? device.gamma * DEG : 0;
  const orient = screenAngle * DEG;
  _euler.set(beta, alpha, -gamma, 'YXZ');
  deviceQuat.setFromEuler(_euler);
  deviceQuat.multiply(_q1);
  deviceQuat.multiply(_q0.setFromAxisAngle(_zee, -orient));
}
function onDeviceOrientation(e) {
  if (e.alpha == null && e.beta == null && e.gamma == null) return;
  device.alpha = e.alpha; device.beta = e.beta; device.gamma = e.gamma;
  gyroAvailable = true;
  needsRender = true;
}
async function enableGyro() {
  if (gyroGranted) { gyroOn = true; updateUI(); return true; }
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission(); // iOS: deve avvenire dentro il tocco
      if (r !== 'granted') { toast('Giroscopio non autorizzato: puoi trascinare con il dito.'); return false; }
    }
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
    gyroGranted = true; gyroOn = true;
    setTimeout(() => { if (!gyroAvailable) { gyroOn = false; updateUI(); toast('Nessun giroscopio rilevato: usa il trascinamento.'); } }, 1500);
    updateUI();
    return true;
  } catch (err) {
    toast('Giroscopio non disponibile su questo dispositivo.');
    return false;
  }
}
function disableGyro() { gyroOn = false; updateUI(); needsRender = true; }

const _fwd = new THREE.Vector3();
function cameraQuaternion() {
  if (gyroOn && gyroAvailable) {
    updateDeviceQuat();
    _q0.setFromAxisAngle(_yAxis, yawOffset);
    camera.quaternion.copy(_q0).multiply(deviceQuat);
  } else {
    look.pitch = clamp(look.pitch, -85 * DEG, 85 * DEG);
    camera.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));
  }
}
// ricentra: la direzione guardata ora diventa il centro (yaw0) del panorama
function recenter() {
  if (gyroOn && gyroAvailable) {
    updateDeviceQuat();
    _fwd.set(0, 0, -1).applyQuaternion(deviceQuat);
    const yawDev = Math.atan2(-_fwd.x, -_fwd.z);
    yawOffset = (P.yaw0 * DEG || 0) - yawDev;
  } else {
    look.yaw = P.yaw0 * DEG || 0; look.pitch = 0;
  }
  needsRender = true;
}

// --- puntatore: trascina (mono) / correzione yaw (giroscopio) / pinch zoom / regolazione in VR ---
let dragging = false, lastX = 0, lastY = 0, pinchDist = 0, lastTap = 0, moved = 0, pointers = 0;
canvas.addEventListener('pointerdown', (e) => {
  pointers++;
  dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging || pointers > 1) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  if (mode === 'vr' && calMode) {
    // con gli occhiali indosso: orizzontale = interasse, verticale = altezza lenti
    cal.sep = clamp(Math.round((cal.sep + dx / cal.pxmm * 0.5) * 10) / 10, 50, 75);
    cal.vert = clamp(Math.round((cal.vert - dy / cal.pxmm * 0.5) * 10) / 10, -20, 20);
    saveCal(); drawOverlay(); needsRender = true;
    return;
  }
  const fov = (mode === 'vr') ? currentVrFov() : monoFov;
  const k = (fov * DEG) / window.innerHeight; // radianti per pixel
  if (gyroOn && gyroAvailable) {
    yawOffset += dx * k;
  } else {
    look.yaw += dx * k; look.pitch += dy * k;
  }
  needsRender = true;
});
function endDrag(e) {
  pointers = Math.max(0, pointers - 1);
  if (!dragging) return; dragging = false;
  if (moved < 8 && pointers === 0) { // tocco semplice
    const now = performance.now();
    if (now - lastTap < 320) { lastTap = 0; if (mode === 'vr') exitVR(); else toggleUI(); }
    else { lastTap = now; if (mode === 'vr') { if (!calMode) recenter(); } else showUI(); }
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinchDist = dist(e.touches); }, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 2) return;
  const d = dist(e.touches);
  if (pinchDist) {
    if (mode === 'vr' && calMode) {
      // pizzica = focale/zoom (allarga = ingrandisce)
      cal.focal = clamp(Math.round(cal.focal * (d / pinchDist) * 10) / 10, 30, 90);
      saveCal(); drawOverlay(); needsRender = true;
    } else if (mode === 'mono') {
      monoFov = clamp(monoFov * pinchDist / d, 45, 110); needsRender = true;
    }
  }
  pinchDist = d;
}, { passive: true });
canvas.addEventListener('touchend', () => { pinchDist = 0; }, { passive: true });
canvas.addEventListener('wheel', (e) => { if (mode === 'mono') { monoFov = clamp(monoFov + e.deltaY * 0.03, 45, 110); needsRender = true; } }, { passive: true });
function dist(t) { const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.hypot(dx, dy); }

// ---------- rendering ----------
function currentVrFov() {
  const H = window.innerHeight; const fPx = cal.focal * cal.pxmm;
  return 2 * Math.atan((H / 2) / fPx) / DEG;
}
function eyeGeometry() {
  const W = window.innerWidth, H = window.innerHeight;
  const sepPx = cal.sep * cal.pxmm;
  const cy = H / 2 - cal.vert * cal.pxmm; // coordinate CSS (y verso il basso): + = verso il bordo superiore
  return { W, H, sepPx, cxL: W / 2 - sepPx / 2, cxR: W / 2 + sepPx / 2, cy };
}
function render() {
  cameraQuaternion();
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  renderer.clear(true, true, false);
  if (mode === 'vr' && W >= H) {
    const g = eyeGeometry();
    const fov = currentVrFov();
    renderer.setScissorTest(true);
    for (const [i, cx] of [g.cxL, g.cxR].entries()) {
      const x0 = cx - g.sepPx / 2;
      const y0 = (H - g.cy) - H / 2; // three.js: origine in basso
      renderer.setViewport(x0, y0, g.sepPx, H);
      renderer.setScissor(i === 0 ? 0 : W / 2, 0, W / 2, H); // ogni occhio resta nella sua metà
      camera.fov = fov; camera.aspect = g.sepPx / H; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }
    renderer.setScissorTest(false);
  } else {
    camera.fov = monoFov; camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
}
function loop() {
  requestAnimationFrame(loop);
  if (needsRender || (gyroOn && gyroAvailable)) { render(); needsRender = false; }
}
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  drawOverlay();
  checkOrientation();
  needsRender = true;
}
window.addEventListener('resize', onResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

// ---------- overlay 2D: maschera circolare e mira di calibrazione ----------
const ov = $('#ov');
function strokeOutlined(ctx, draw, w) {
  ctx.lineWidth = w + 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.beginPath(); draw(); ctx.stroke();
  ctx.lineWidth = w; ctx.strokeStyle = '#fff'; ctx.beginPath(); draw(); ctx.stroke();
}
function drawOverlay() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const W = window.innerWidth, H = window.innerHeight;
  ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr);
  ov.style.width = W + 'px'; ov.style.height = H + 'px';
  const ctx = ov.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const showTarget = cal.target || calMode;
  if (mode !== 'vr' || W < H) { ov.hidden = true; return; }
  ov.hidden = !(cal.mask || showTarget);
  if (ov.hidden) return;
  const g = eyeGeometry();
  const rLens = (cal.diam / 2) * cal.pxmm;
  if (cal.mask) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    for (const cx of [g.cxL, g.cxR]) {
      const r = rLens * 1.35;
      const grad = ctx.createRadialGradient(cx, g.cy, r * 0.85, cx, g.cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, g.cy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (showTarget) {
    for (const [i, cx] of [g.cxL, g.cxR].entries()) {
      strokeOutlined(ctx, () => ctx.arc(cx, g.cy, rLens, 0, Math.PI * 2), 4);
      strokeOutlined(ctx, () => ctx.arc(cx, g.cy, rLens / 2, 0, Math.PI * 2), 3);
      strokeOutlined(ctx, () => { ctx.moveTo(cx - rLens * 1.4, g.cy); ctx.lineTo(cx + rLens * 1.4, g.cy); ctx.moveTo(cx, g.cy - rLens * 1.4); ctx.lineTo(cx, g.cy + rLens * 1.4); }, 3);
      ctx.fillStyle = '#d40000'; ctx.beginPath(); ctx.arc(cx, g.cy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
      ctx.font = '700 22px system-ui, sans-serif'; ctx.textAlign = 'center';
      const lab = i === 0 ? 'SX' : 'DX';
      ctx.strokeText(lab, cx, g.cy + rLens * 0.72); ctx.fillText(lab, cx, g.cy + rLens * 0.72);
    }
    // valori correnti, grandi, fuori dalle lenti (in basso) e linea di separazione
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    const txt = `interasse ${cal.sep.toFixed(1)} mm · altezza ${(cal.vert > 0 ? '+' : '') + cal.vert.toFixed(1)} mm · zoom ${cal.focal.toFixed(0)} mm · ${cal.pxmm.toFixed(2)} px/mm`;
    ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4;
    ctx.strokeText(txt, W / 2, H - 14); ctx.fillText(txt, W / 2, H - 14);
    if (calMode) {
      const hint = 'Tocca ai lati, lontano dalla pinzetta · 1 dito ↔ interasse · 1 dito ↕ altezza · 2 dita = zoom · doppio tocco = fine';
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.strokeText(hint, W / 2, 20); ctx.fillText(hint, W / 2, 20);
    }
  }
}

// ---------- modalità VR ----------
async function enterVR(withCal) {
  calMode = !!withCal;
  keepAwake();
  await enableGyro(); // dentro il gesto: su iPhone chiede il permesso
  try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) {}
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) {}
  mode = 'vr';
  document.body.classList.add('vr');
  closeCal(true);
  hideUI(true);
  readScreenAngle();
  onResize();
  recenter();
  toast(calMode ? 'Indossa gli occhiali e regola con le dita. Doppio tocco per finire.' : 'Aggancia gli occhiali. Tocco: ricentra · doppio tocco: esci', 3500);
}
function exitVR() {
  const wasCal = calMode;
  mode = 'mono'; calMode = false;
  document.body.classList.remove('vr');
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
  $('#rotate').hidden = true;
  onResize();
  showUI();
  if (wasCal) { saveCal(); openCal(); toast('Calibrazione salvata su questo telefono.'); }
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && mode === 'vr') exitVR(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode === 'vr') exitVR(); });
function checkOrientation() { $('#rotate').hidden = !(mode === 'vr' && window.innerWidth < window.innerHeight); }

// ---------- schermo sempre acceso ----------
let wakeLock = null, noSleepVideo = null;
const TINY_MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAOEbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAq50cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAgAAABAAAAAAImbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB0W1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAZFzdGJsAAAAwXN0c2QAAAAAAAAAAQAAALFhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAN2F2Y0MBZAAK/+EAGWdkAAqscgRewEQAAAMABAAAAwAgPEiWEYABAAdo6EOBlLIs/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAx8AAAMfAAAABhzdHRzAAAAAAAAAAEAAAAIAAAQAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAOGN0dHMAAAAAAAAABQAAAAEAACAAAAAAAQAAgAAAAAABAAAwAAAAAAIAAAAAAAAAAwAAEAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAgAAAABAAAANHN0c3oAAAAAAAAAAAAAAAgAAALEAAAADQAAAA0AAAANAAAADQAAAA0AAAANAAAADQAAABRzdGNvAAAAAAAAAAEAAAO0AAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2MC4xNi4xMDAAAAAIZnJlZQAAAydtZGF0AAACrwYF//+r3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTE2IGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMzMgbWU9dW1oIHN1Ym1lPTEwIHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MjQgY2hyb21hX21lPTEgdHJlbGxpcz0yIDh4OGRjdD0xIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTggYl9weXJhbWlkPTIgYl9hZGFwdD0yIGJfYmlhcz0wIGRpcmVjdD0zIHdlaWdodGI9MSBvcGVuX2dvcD0wIHdlaWdodHA9MiBrZXlpbnQ9MjUwIGtleWludF9taW49NCBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTYwIHJjPWNyZiBtYnRyZWU9MSBjcmY9NTEuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAA1liIEAAp/9GlvAo7z5AAAACUGaCO2IIf/RgAAAAAlBnhBnEEv/7IEAAAAJAZ4YJogh/+6AAAAACQGeGEaIIf/ugQAAAAkBnhiNSCH/7oEAAAAJAZ4YrUgh/+6BAAAACQGeGM1IIf/ugQ==';
async function keepAwake() {
  if (document.visibilityState !== 'visible') return;
  try {
    if ('wakeLock' in navigator) {
      if (wakeLock) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
      return;
    }
  } catch (e) { /* passa al video di riserva */ }
  try {
    if (!noSleepVideo) {
      noSleepVideo = document.createElement('video');
      noSleepVideo.setAttribute('playsinline', ''); noSleepVideo.muted = true; noSleepVideo.loop = true;
      noSleepVideo.src = TINY_MP4; noSleepVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.appendChild(noSleepVideo);
    }
    await noSleepVideo.play();
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
window.addEventListener('pointerdown', () => keepAwake(), { once: true });

// ---------- interfaccia ----------
let uiTimer = null;
function showUI() { document.body.classList.remove('ui-hidden'); clearTimeout(uiTimer); if (mode === 'mono') uiTimer = setTimeout(() => hideUI(), 5000); }
function hideUI() { document.body.classList.add('ui-hidden'); clearTimeout(uiTimer); }
function toggleUI() { document.body.classList.contains('ui-hidden') ? showUI() : hideUI(); }
let toastTimer = null;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.classList.remove('show'); }, ms);
}
function updateUI() {
  $('#bGyro').classList.toggle('on', gyroOn);
  $('#bGyro').setAttribute('aria-pressed', gyroOn ? 'true' : 'false');
}
$('#bGyro').addEventListener('click', () => { gyroOn ? disableGyro() : enableGyro(); showUI(); });
$('#bVR').addEventListener('click', () => enterVR(false));
$('#bFull').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    else toast('Su iPhone: aggiungi la pagina alla schermata Home per lo schermo intero.');
  } catch (e) { toast('Schermo intero non disponibile qui.'); }
  showUI();
});
$('#bCenter').addEventListener('click', () => { recenter(); showUI(); });
$('#bCal').addEventListener('click', () => { openCal(); });
$('#calClose').addEventListener('click', () => closeCal());
$('#calReset').addEventListener('click', () => { cal = { ...CAL_DEFAULT }; saveCal(); syncCalUI(); drawOverlay(); needsRender = true; });
$('#calVR').addEventListener('click', () => enterVR(true));

// pannello di calibrazione
const calPanel = $('#cal');
function openCal() { calPanel.hidden = false; document.body.classList.add('cal-open'); syncCalUI(); clearTimeout(uiTimer); }
function closeCal(silent) { calPanel.hidden = true; document.body.classList.remove('cal-open'); if (!silent) showUI(); }
const calFields = ['pxmm', 'sep', 'focal', 'vert', 'diam'];
function syncCalUI() {
  for (const k of calFields) {
    const r = $('#r_' + k); if (!r) continue;
    r.value = cal[k];
    $('#v_' + k).textContent = fmt(k, cal[k]);
  }
  $('#t_mask').checked = !!cal.mask; $('#t_target').checked = !!cal.target;
  drawCard();
}
function fmt(k, v) {
  v = Number(v);
  if (k === 'pxmm') return v.toFixed(2) + ' px/mm';
  if (k === 'vert') return (v > 0 ? '+' : '') + v.toFixed(1) + ' mm';
  return (k === 'sep' ? v.toFixed(1) : v.toFixed(0)) + ' mm';
}
for (const k of calFields) {
  const r = $('#r_' + k); if (!r) continue;
  r.addEventListener('input', () => { cal[k] = Number(r.value); $('#v_' + k).textContent = fmt(k, cal[k]); saveCal(); drawCard(); drawOverlay(); needsRender = true; });
}
$('#t_mask').addEventListener('change', (e) => { cal.mask = e.target.checked; saveCal(); drawOverlay(); });
$('#t_target').addEventListener('change', (e) => { cal.target = e.target.checked; saveCal(); drawOverlay(); });
// carta di credito ISO/IEC 7810 ID-1: 85,60 × 53,98 mm
function drawCard() {
  const c = $('#card'); if (!c) return;
  const w = 85.6 * cal.pxmm, h = 53.98 * cal.pxmm;
  const vertical = window.innerWidth < window.innerHeight; // in verticale la carta si appoggia in lungo
  c.style.width = (vertical ? h : w) + 'px';
  c.style.height = (vertical ? w : h) + 'px';
}
$('#calCardBtn').addEventListener('click', () => { $('#cardBox').hidden = !$('#cardBox').hidden; drawCard(); });

// ---------- avvio ----------
$('#ttl').textContent = `${P.year} · ${P.title}`;
$('#sub').textContent = (P.place || '') + (P.n ? ` · vista ${P.n}` : '');
document.title = `Villa Selvatico ${P.year} · ${P.title}`;
if (params.get('vr') === '1') {
  const go = $('#goVR'); go.hidden = false;
  go.addEventListener('click', () => { go.hidden = true; enterVR(false); }, { once: true });
}
canvas.addEventListener('pointerdown', () => { if (mode === 'mono') showUI(); });
window.addEventListener('pagehide', () => { try { if (gyroOn) window.removeEventListener('deviceorientation', onDeviceOrientation, true); } catch (e) {} });
updateUI();
onResize();
showUI();
loop();
