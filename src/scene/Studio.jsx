// Studio look: a light box baked into an environment map, one key light,
// a camera that fits the console to any screen and leans after the mouse.
import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene } from "three";
import { useGame } from "../game/store";

// Measured once from the model: vertical extent, half width and the front face.
const FIT = { minY: -0.15, maxY: 7.95, halfW: 1.9, frontZ: 0.6 };
const TARGET_Y = (FIT.minY + FIT.maxY) / 2;
const TAN = Math.tan((30 / 2) * (Math.PI / 180)); // half of the 30° vertical fov

// Light box panels: position, size, brightness, colour.
const EMITTERS = [
  [[-5.5, 6.5, 6], [5, 5], 4.0, "#fff3e6"], // key, upper left
  [[8, 1.5, 4], [3, 7], 1.0, "#ffe8d2"], // fill, right
  [[0, 2.9, 11], [11, 1.2], 4.0, "#ffffff"], // strip ~15° up: its reflection is the glare on the top of the LCD
  [[0, 4, -9], [14, 5], 2.0, "#ffffff"], // rim, behind
  [[0, -6, 3], [12, 8], 0.25, "#6b4a2e"], // warm bounce from the floor
];

// Mouse parallax: small turns, eased, only while nothing is moving on the screen.
const YAW = (2.5 * Math.PI) / 180;
const PITCH = (1.5 * Math.PI) / 180;
const TAU = 0.2;
const EXPOSURE = 1.35;
const STILL_MODES = new Set(["off", "title", "pause", "over"]);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const leans = () => !reducedMotion.matches && STILL_MODES.has(useGame.getState().view.mode);

function fitDistance(aspect) {
  const margin = aspect < 1 ? 1.03 : 1.07;
  const byHeight = ((FIT.maxY - FIT.minY) / 2) * margin / TAN;
  const byWidth = (FIT.halfW * margin) / (TAN * aspect);
  return FIT.frontZ + Math.max(byHeight, byWidth);
}

function buildEnvironment(gl) {
  const scene = new Scene();
  scene.background = new Color(0.02, 0.016, 0.012);
  const plane = new PlaneGeometry(1, 1);
  const materials = [];
  for (const [position, [w, h], k, color] of EMITTERS) {
    const material = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(k), side: DoubleSide });
    const mesh = new Mesh(plane, material);
    mesh.position.set(...position);
    mesh.scale.set(w, h, 1);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    materials.push(material);
  }
  const pmrem = new PMREMGenerator(gl);
  const target = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  plane.dispose();
  materials.forEach((m) => m.dispose());
  return target;
}

function Environment({ epoch }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  // epoch changes after a lost WebGL context comes back: the old map is gone with it
  useLayoutEffect(() => {
    const target = buildEnvironment(gl);
    scene.environment = target.texture;
    gl.toneMappingExposure = EXPOSURE;
    invalidate();
    return () => {
      scene.environment = null;
      target.dispose();
    };
  }, [gl, scene, invalidate, epoch]);

  return null;
}

function Camera() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);
  const rig = useRef({ dist: 0, yaw: 0, pitch: 0, nx: 0, ny: 0 }).current;

  useLayoutEffect(() => {
    rig.dist = fitDistance(width / height);
    // a tight depth range keeps the recess free of z-fighting even with 16-bit depth
    camera.near = rig.dist * 0.5;
    camera.far = rig.dist * 2;
    camera.updateProjectionMatrix();
    place(camera, rig);
    invalidate();
  }, [camera, width, height, invalidate, rig]);

  useEffect(() => {
    const onMove = (e) => {
      if (e.pointerType !== "mouse") return;
      rig.nx = (e.clientX / window.innerWidth) * 2 - 1;
      rig.ny = (e.clientY / window.innerHeight) * 2 - 1;
      if (leans()) invalidate();
    };
    const onLeave = (e) => {
      if (e.relatedTarget) return;
      rig.nx = rig.ny = 0;
      invalidate();
    };
    window.addEventListener("pointermove", onMove);
    document.addEventListener("mouseout", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [invalidate, rig]);

  useFrame((state, delta) => {
    // the game itself requests frames on every mode change, so the camera eases back to centre
    const lean = leans();
    const yaw = lean ? -rig.nx * YAW : 0;
    const pitch = lean ? rig.ny * PITCH : 0;
    if (yaw === rig.yaw && pitch === rig.pitch) return;
    const a = 1 - Math.exp(-Math.min(delta, 1 / 30) / TAU);
    rig.yaw += (yaw - rig.yaw) * a;
    rig.pitch += (pitch - rig.pitch) * a;
    if (Math.abs(yaw - rig.yaw) < 2e-4 && Math.abs(pitch - rig.pitch) < 2e-4) {
      rig.yaw = yaw;
      rig.pitch = pitch;
    } else {
      state.invalidate();
    }
    place(state.camera, rig);
  });

  return null;
}

// orbit around the middle of the console at the fitted distance
function place(camera, { dist, yaw, pitch }) {
  camera.position.set(
    dist * Math.sin(yaw) * Math.cos(pitch),
    TARGET_Y + dist * Math.sin(pitch),
    dist * Math.cos(yaw) * Math.cos(pitch),
  );
  camera.lookAt(0, TARGET_Y, 0);
}

export default function Studio({ epoch }) {
  return (
    <>
      <Environment epoch={epoch} />
      <directionalLight position={[-4, 7, 8]} intensity={1} color="#fff1e0" />
      <Camera />
    </>
  );
}
