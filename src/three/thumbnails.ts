import {
  Box3,
  Color,
  DirectionalLight,
  AmbientLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Sphere,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const WIDTH = 400;
const HEIGHT = 264;

let shared: { renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera } | null = null;

/** One offscreen renderer for every tile, so the grid costs a single WebGL context. */
function stage() {
  if (shared) return shared;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(WIDTH, HEIGHT, false);
  const scene = new Scene();
  scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  scene.add(new AmbientLight(0xffffff, 0.3));
  const light = new DirectionalLight(0xffffff, 1.6);
  light.position.set(-1.2, -0.8, 4);
  scene.add(light);
  const camera = new PerspectiveCamera(30, WIDTH / HEIGHT, 0.01, 100);
  camera.up.set(0, 0, 1);
  shared = { renderer, scene, camera };
  return shared;
}

const cache = new Map<string, string>();

/** A PNG data URL of `geometry` framed from the front-left, as tiles show it. */
export function thumbnail(geometry: BufferGeometry, color: string): string {
  const cached = cache.get(`${geometry.uuid}:${color}`);
  if (cached) return cached;
  const { renderer, scene, camera } = stage();
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ color: new Color(color).convertSRGBToLinear(), roughness: 0.55, metalness: 0 }),
  );
  scene.add(mesh);
  const sphere = new Box3().setFromObject(mesh).getBoundingSphere(new Sphere());
  const distance = sphere.radius / Math.sin(((camera.fov / 2) * Math.PI) / 180) * 1.1;
  const direction = new Vector3(Math.cos(-0.9) * 0.85, Math.sin(-0.9) * 0.85, 0.5).normalize();
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  // Meshes come in any unit (an STL in millimetres is hundreds of units across).
  camera.near = distance / 100;
  camera.far = distance * 10;
  camera.updateProjectionMatrix();
  camera.lookAt(sphere.center);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(mesh);
  (mesh.material as MeshStandardMaterial).dispose();
  cache.set(`${geometry.uuid}:${color}`, url);
  return url;
}
