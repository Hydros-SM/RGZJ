// Сетка съёмки БПЛА (ортофотоплан/фотомодель, тепловизор) в 3D-сцене. Модель в местной системе координат карьера — ложится на рельеф без пересчёта.
// data — uav-store.loadScan: { mesh (unpackLod), texture (Blob | null) }; B — результат buildScene (cx, cy, cz — центр сцены).
export async function buildUavMesh(THREE, B, data, { opacity = 1, thermal = false } = {}) {
  const m = data.mesh, mn = m.bbox.min, mx = m.bbox.max;
  const rx = (mx[0] - mn[0]) / 65535, ry = (mx[1] - mn[1]) / 65535, rz = (mx[2] - mn[2]) / 65535;
  const pos = new Float32Array(m.nv * 3), uv = new Float32Array(m.nv * 2);
  for (let i = 0; i < m.nv; i++) {
    const x = mn[0] + m.pos[3 * i] * rx, y = mn[1] + m.pos[3 * i + 1] * ry, z = mn[2] + m.pos[3 * i + 2] * rz;
    pos[3 * i] = x - B.cx; pos[3 * i + 1] = z - B.cz; pos[3 * i + 2] = -(y - B.cy);
    uv[2 * i] = m.uv[2 * i] / 65535; uv[2 * i + 1] = m.uv[2 * i + 1] / 65535;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
  let map = null;
  if (data.texture) {
    const url = URL.createObjectURL(data.texture);
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Не удалось прочитать текстуру съёмки')); im.src = url; });
      map = new THREE.Texture(img); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true;
    } finally { URL.revokeObjectURL(url); }
  }
  const mat = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : (thermal ? 0xff6a3d : 0xbbbbbb), side: THREE.DoubleSide, transparent: opacity < 0.99, opacity, polygonOffset: true, polygonOffsetFactor: thermal ? -4 : -2, polygonOffsetUnits: thermal ? -4 : -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = thermal ? 4 : 3; mesh.userData = { uav: true };
  return mesh;
}
