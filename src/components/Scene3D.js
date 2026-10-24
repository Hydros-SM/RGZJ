// 3D-вид модели карьера (three.js): вращение одним пальцем, масштаб и сдвиг двумя, выбор касанием. Библиотека подгружается по требованию
// (при первом запуске с интернетом попадает в офлайн-кэш, см. main.js). Содержимое строит lib/scene3d.js.
import { styleTerrain } from '../lib/terrain3d.js';
import React, { useEffect, useRef, useState } from 'react';
import { html } from '../lib/html.js';
import { buildScene } from '../lib/scene3d.js';

const visKey = (k) => k.replace(/C$/, '');

export function Scene3D({ session, fview, tview, onReady, layers, vexag, terrainOp = 0.6, selected, onPick, focus, viewCmd, placing, onPlace }) {
  const wrapRef = useRef(null);
  const S = useRef({});
  const props = useRef({}); props.current = { session, fview, tview, layers, vexag, terrainOp, selected, onPick, placing, onPlace };
  const [state, setState] = useState('loading'); // loading | ready | error
  const [errMsg, setErrMsg] = useState('');

  function render() { const s = S.current; if (s.renderer) s.renderer.render(s.scene, s.camera); }
  function applyLayers() {
    const s = S.current; if (!s.B) return;
    Object.keys(s.B.layerGroups).forEach((k) => { s.B.layerGroups[k].visible = props.current.layers[visKey(k)] !== false; });
    s.B.group.scale.set(1, props.current.vexag || 1, 1);
    const op = props.current.terrainOp, tm = s.B.terrainMesh.material; // полупрозрачный рельеф: разломы и скважины под ним видны; не пишем глубину, чтобы они рисовались сквозь него
    tm.transparent = op < 0.99; tm.opacity = op; tm.depthWrite = op >= 0.99; tm.needsUpdate = true; s.B.terrainMesh.renderOrder = 1; s.B.faultMeshes.forEach((m) => { m.renderOrder = 2; });
    render();
  }
  function applyTerrain() {
    const s = S.current; if (!s.B) return;
    const tv = props.current.tview || {};
    styleTerrain(s.THREE, s.B, props.current.session, tv, s.mapTex || null, props.current.layers.contours !== false);
    applyLayers();
  }
  function loadMapTexture() { // картинка схемы — на рельеф (по границам схемы)
    const s = S.current, url = props.current.session.mapUrl; if (!s.B || !url) return;
    new s.THREE.TextureLoader().load(url, (tex) => { if (!S.current.B) return; tex.colorSpace = s.THREE.SRGBColorSpace; tex.anisotropy = 8; S.current.mapTex = tex; applyTerrain(); });
  }
  function applySelection() {
    const s = S.current; if (!s.B) return;
    const sel = props.current.selected;
    const fv = props.current.fview || {}, hid = new Set(fv.hidden || []), fo = fv.lineOpacity != null ? fv.lineOpacity : 1, so = fv.surfOpacity != null ? fv.surfOpacity : 0.4;
    s.B.faultMeshes.forEach((m) => {
      const on = sel && sel.kind === 'fault' && sel.key === m.userData.key;
      m.visible = !hid.has(m.userData.key); m.material.color.copy(fv.color ? new s.THREE.Color(fv.color) : m.userData.baseColor);
      m.material.opacity = on ? 0.8 : Math.min(1, m.userData.baseOpacity * so / 0.4); m.material.emissive && m.material.emissive.set(on ? '#f59e0b' : '#000000');
    });
    s.B.layerGroups.faultLines && s.B.layerGroups.faultLines.children.forEach((l) => { l.visible = !hid.has(l.userData.key); l.material.color.copy(fv.color ? new s.THREE.Color(fv.color) : l.userData.baseColor); l.material.opacity = fo; });
    if (s.ring) { s.B.group.remove(s.ring); s.ring.geometry.dispose(); s.ring = null; }
    const m = sel && sel.kind !== 'fault' ? s.B.markers.find((x) => x.kind === sel.kind && (x.item === sel.item || (sel.kind === 'point' && x.item.point_number === sel.item.point_number) || (sel.kind === 'outflow' && x.item.id === sel.item.id))) : null;
    if (m) {
      const THREE = s.THREE, g = new THREE.BufferGeometry().setFromPoints([m.v]);
      s.ring = new THREE.Points(g, new THREE.PointsMaterial({ size: 34, sizeAttenuation: false, map: s.ringTex, transparent: true, alphaTest: 0.3, depthTest: false }));
      s.B.group.add(s.ring);
    }
    render();
  }

  useEffect(() => {
    let disposed = false, ro = null;
    (async () => {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
        if (disposed) return;
        const wrap = wrapRef.current, W = wrap.clientWidth || 800, H = wrap.clientHeight || 500;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(W, H);
        renderer.setClearColor(0xdfe3e8); wrap.appendChild(renderer.domElement); renderer.domElement.style.touchAction = 'none'; renderer.domElement.className = 'scene3d-canvas';
        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 0.7)); const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(0.6, 1, 0.8); scene.add(sun);
        const B = buildScene(THREE, props.current.session); scene.add(B.group);
        const camera = new THREE.PerspectiveCamera(45, W / H, 1, B.radius * 30);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false; controls.maxPolarAngle = Math.PI * 0.495; controls.screenSpacePanning = true;
        controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
        controls.addEventListener('change', render);
        const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'); g.beginPath(); g.arc(48, 48, 40, 0, Math.PI * 2); g.lineWidth = 8; g.strokeStyle = '#f59e0b'; g.stroke(); return new THREE.CanvasTexture(c); })();
        Object.assign(S.current, { THREE, renderer, scene, camera, controls, B, ringTex });
        const home = () => { controls.target.set(0, (B.zmin + B.zmax) / 2 * (props.current.vexag || 1) * 0.5, 0); camera.position.set(B.radius * 0.9, B.radius * 0.9 + B.zmax, B.radius * 1.2); camera.lookAt(controls.target); controls.update(); };
        S.current.home = home; home();
        ro = new ResizeObserver(() => { const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render(); });
        ro.observe(wrap);

        // касание: если палец почти не двигался — выбираем ближайший маркер (в пределах ~26 px) или разлом под пальцем
        let down = null;
        const cv = renderer.domElement;
        cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now(), n: (down && down.n ? down.n : 0) + 1 }; });
        cv.addEventListener('pointerup', (e) => {
          if (!down || e.isPrimary === false) return;
          const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = Date.now() - down.t; down = null;
          if (moved > 6 || dt > 600) return;
          const rect = cv.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top, P = props.current;
          if (P.placing && P.onPlace) { // режим «указать место»: точка на рельефе под пальцем
            const rc0 = new THREE.Raycaster(); rc0.setFromCamera(new THREE.Vector2((mx / rect.width) * 2 - 1, -(my / rect.height) * 2 + 1), camera);
            const h0 = rc0.intersectObject(B.terrainMesh, false)[0];
            if (h0) { const vx = P.vexag || 1; P.onPlace({ x: h0.point.x + B.cx, y: -h0.point.z + B.cy, z: h0.point.y / vx + B.cz }); }
            return;
          }
          let best = null, bd = 26;
          B.markers.forEach((m) => {
            if (P.layers[visKey(m.layer)] === false) return;
            const p = new THREE.Vector3(m.v.x, m.v.y * (P.vexag || 1), m.v.z).project(camera);
            if (p.z > 1 || p.z < -1) return;
            const d = Math.hypot((p.x * 0.5 + 0.5) * rect.width - mx, (-p.y * 0.5 + 0.5) * rect.height - my);
            if (d < bd) { bd = d; best = m; }
          });
          if (best) { P.onPick && P.onPick({ kind: best.kind, item: best.item }); return; }
          const cand = B.faultMeshes.filter((m) => P.layers[m.userData.layer] === true || (P.layers[m.userData.layer] !== false && m.userData.layer === 'faultSurf')); // только видимые слои разломов
          if (cand.length) {
            const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((mx / rect.width) * 2 - 1, -(my / rect.height) * 2 + 1), camera);
            const hit = rc.intersectObjects(cand, false)[0];
            if (hit) { P.onPick && P.onPick({ kind: 'fault', key: hit.object.userData.key }); return; }
          }
          P.onPick && P.onPick(null);
        });
        applyLayers(); applySelection(); setState('ready'); applyTerrain(); loadMapTexture();
        onReady && onReady();
      } catch (e) {
        console.error(e);
        if (!disposed) { setErrMsg(String(e && e.message ? e.message : e)); setState('error'); }
      }
    })();
    return () => {
      disposed = true; if (ro) ro.disconnect();
      const s = S.current;
      if (s.renderer) { s.controls && s.controls.dispose(); s.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map && m.map.dispose(); m.dispose(); }); } }); s.renderer.dispose(); if (s.renderer.domElement.parentNode) s.renderer.domElement.parentNode.removeChild(s.renderer.domElement); }
      S.current = {};
    };
  }, [session.rec]);

  useEffect(() => { const s = S.current; if (s.B && s.B.refreshPoints) { s.B.refreshPoints(session); applyLayers(); applySelection(); } }, [session.points, session.outflows]);
  useEffect(() => { applyTerrain(); }, [tview && tview.colorMode, tview && tview.flat, tview && tview.step, tview && tview.labels, layers.contours]);
  useEffect(() => { applyLayers(); }, [layers, vexag, terrainOp]);
  useEffect(() => { applySelection(); }, [selected, fview]);
  useEffect(() => {
    const s = S.current; if (!s.B || !viewCmd) return;
    const { camera, controls, B } = s;
    if (viewCmd.type === 'top') { controls.target.set(0, 0, 0); camera.position.set(0, B.radius * 2.3, 0.001); camera.lookAt(controls.target); controls.update(); }
    else if (viewCmd.type === 'fit') s.home();
    render();
  }, [viewCmd]);
  useEffect(() => { // «На карте»/выбор объекта: подвести камеру к объекту
    const s = S.current; if (!s.B || !focus) return;
    const v = s.B.v3(focus.x, focus.y, s.B.zAt(focus.x, focus.y)); v.y *= props.current.vexag || 1;
    const off = s.camera.position.clone().sub(s.controls.target); off.setLength(Math.min(off.length(), s.B.radius * 0.35));
    s.controls.target.copy(v); s.camera.position.copy(v.clone().add(off)); s.controls.update(); render();
  }, [focus]);

  return html`
    <div class="scene3d-wrap" ref=${wrapRef}>
      ${state === 'loading' && html`<div class="scene3d-msg">Строю 3D-модель…</div>`}
      ${state === 'error' && html`<div class="scene3d-msg err">3D-вид не запустился: ${errMsg}. Если это первый запуск, откройте приложение с интернетом — библиотека 3D сохранится в офлайн-кэш. Также нужна поддержка WebGL в браузере.</div>`}
    </div>`;
}
