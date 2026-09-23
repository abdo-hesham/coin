/* Real 3D coin rendered with Three.js.
   Performance: the canvas is a small square that is moved and scaled with a CSS transform,
   so scrolling only costs a compositor transform. WebGL re-renders only when the coin's
   rotation actually changes. */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const DEG = Math.PI / 180;
const THICKNESS = 0.085; // relative to radius
const SIZE = 360; // canvas size in CSS px
const FILL = 0.8; // coin diameter as a fraction of the canvas (room for tilt / perspective)
const FOV = 18;

export async function createCoin3D(canvas, { front, back }) {
  // start the texture downloads first; renderer + environment setup runs meanwhile
  const loader = new THREE.TextureLoader();
  const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const texturesP = Promise.all([load(front), load(back)]);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(SIZE, SIZE, false);
  canvas.style.width = canvas.style.height = `${SIZE}px`;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // radius 1 fills FILL of the canvas height
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, 1 / (FILL * Math.tan((FOV / 2) * DEG)));

  const [texF, texB] = await texturesP;
  for (const t of [texF, texB]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.center.set(0.5, 0.5);
  }
  // cylinder caps map UVs from the XZ plane; after turning the cylinder to face the
  // camera the artwork needs a quarter turn (front) and a mirror (back) to read upright
  texF.rotation = Math.PI / 2;
  texB.rotation = -Math.PI / 2;
  texB.repeat.set(-1, 1);

  const geo = new THREE.CylinderGeometry(1, 1, THICKNESS, 128, 1);
  geo.rotateX(Math.PI / 2); // caps now face +Z (front) and -Z (back)

  const rim = new THREE.MeshStandardMaterial({ color: 0x9a7434, metalness: 0.95, roughness: 0.34, envMapIntensity: 1.1 });
  const faceOpts = { metalness: 0.62, roughness: 0.42, envMapIntensity: 0.9, bumpScale: 1.6 };
  const matF = new THREE.MeshStandardMaterial({ map: texF, bumpMap: texF, ...faceOpts });
  const matB = new THREE.MeshStandardMaterial({ map: texB, bumpMap: texB, ...faceOpts });
  const mesh = new THREE.Mesh(geo, [rim, matF, matB]);
  scene.add(mesh);

  const key = new THREE.DirectionalLight(0xfff0d4, 2.4);
  key.position.set(-0.6, 0.9, 1.2);
  const fill = new THREE.DirectionalLight(0xb9c6ff, 0.45);
  fill.position.set(1, -0.3, 0.6);
  const rimLight = new THREE.DirectionalLight(0xffe2a8, 1.1);
  rimLight.position.set(0.4, 1, -0.8);
  scene.add(key, fill, rimLight, new THREE.AmbientLight(0xffffff, 0.25));

  let lastRot = '';
  let lastTf = '';
  function set(x, y, d, rx, ry, rz) {
    // position + size: compositor-only transform
    const s = d / (SIZE * FILL);
    const tf = `translate3d(${(x - SIZE / 2).toFixed(1)}px,${(y - SIZE / 2).toFixed(1)}px,0) scale(${s.toFixed(4)})`;
    if (tf !== lastTf) { canvas.style.transform = tf; lastTf = tf; }
    // rotation: re-render only when it visibly changes.
    // CSS y points down; mirroring the Y axis flips the sense of X and Z rotations
    const rot = `${rx.toFixed(1)}|${ry.toFixed(1)}|${rz.toFixed(1)}`;
    if (rot === lastRot) return;
    lastRot = rot;
    mesh.rotation.set(-rx * DEG, ry * DEG, -rz * DEG, 'XYZ');
    renderer.render(scene, camera);
  }
  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(SIZE, SIZE, false);
    lastRot = '';
  }

  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  return { set, resize, canvas };
}
