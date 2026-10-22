// three.js: dossel de floresta vista de cima (low-poly) + partículas lima, no espírito do hero da Ambipar.
import * as THREE from '../vendor/three.module.min.js';

export function mountForest(canvas) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); }
  catch (e) { return () => {}; }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  const HORIZON = 0xdff1fb;
  scene.fog = new THREE.Fog(HORIZON, 26, 92);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
  camera.position.set(0, 9, 26);

  // Terreno
  const SEG = 56, SIZE = 150;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const base = new Float32Array(pos.count * 3);
  base.set(pos.array);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  const col = geo.attributes.color;
  const cLow = new THREE.Color('#0c4a22'), cMid = new THREE.Color('#1d8a3a'), cHigh = new THREE.Color('#5cc23c'), cTip = new THREE.Color('#ccff03');
  const h = (x, z, t) =>
    Math.sin(x * 0.19 + t * 0.35) * 1.6 + Math.cos(z * 0.23 - t * 0.28) * 1.4 +
    Math.sin((x + z) * 0.52 + t * 0.7) * 0.7 + Math.cos(x * 0.9 - z * 0.7) * 0.45;

  const tmp = new THREE.Color();
  function shape(t, withColor = true) {
    for (let i = 0; i < pos.count; i++) {
      const y = h(base[i * 3], base[i * 3 + 2], t);
      pos.setY(i, y);
      if (!withColor) continue;
      const k = Math.min(1, Math.max(0, (y + 3.2) / 6.4));
      if (k < 0.5) tmp.copy(cLow).lerp(cMid, k * 2); else tmp.copy(cMid).lerp(cHigh, (k - 0.5) * 2);
      if (k > 0.92) tmp.lerp(cTip, (k - 0.92) / 0.08 * 0.6);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    pos.needsUpdate = true; if (withColor) col.needsUpdate = true;
  }
  shape(0);
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.position.y = -3;
  scene.add(terrain);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xfff6d8, 1.15);
  sun.position.set(-14, 22, 10);
  scene.add(sun);

  // Partículas lima (pólen / folhas)
  const N = 140, pg = new THREE.BufferGeometry();
  const pp = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pp[i * 3] = (Math.random() - 0.5) * 60; pp[i * 3 + 1] = Math.random() * 14; pp[i * 3 + 2] = (Math.random() - 0.5) * 50; seed[i] = Math.random() * 6.28; }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const dots = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xccff03, size: 0.28, transparent: true, opacity: 0.9, depthWrite: false }));
  scene.add(dots);

  function resize() {
    const w = canvas.clientWidth || innerWidth, hh = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh; camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  let mx = 0, my = 0;
  const onMove = e => { mx = (e.clientX / innerWidth - 0.5); my = (e.clientY / innerHeight - 0.5); };
  addEventListener('pointermove', onMove);

  const clock = new THREE.Clock();
  let raf = 0, running = true, last = 0, frameN = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    if (t - last < 1 / 30) return;           // ~30 fps: leve em celulares
    last = t;
    if (!reduced) {
      shape(t, (frameN++ % 4) === 0);        // cores só a cada 4 quadros
      const p = pg.attributes.position;
      for (let i = 0; i < N; i++) {
        p.setY(i, (p.getY(i) + 0.012 + Math.sin(t + seed[i]) * 0.004) % 14);
        p.setX(i, p.getX(i) + Math.sin(t * 0.6 + seed[i]) * 0.006);
      }
      p.needsUpdate = true;
    }
    camera.position.x += (mx * 6 - camera.position.x) * 0.03;
    camera.position.y += (9 - my * 3 - camera.position.y) * 0.03;
    camera.lookAt(0, 1, -10);
    renderer.render(scene, camera);
  }
  const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); running = false; } else if (!running) { running = true; frame(); } };
  document.addEventListener('visibilitychange', vis);
  frame();

  return function dispose() {
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize); removeEventListener('pointermove', onMove);
    document.removeEventListener('visibilitychange', vis);
    geo.dispose(); pg.dispose(); terrain.material.dispose(); dots.material.dispose(); renderer.dispose();
  };
}
