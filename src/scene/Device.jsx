// The console: model, LCD texture, one hit plane for all buttons, press animation.
import { useEffect, useMemo } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACO_GLTF_CONFIG, DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { BUTTONS } from "../game/device";
import { press, useGame } from "../game/store";
import { createLcd } from "./lcd";
// hashed file name; index.html preloads the same URL so the download starts before this script runs
import MODEL_URL from "../assets/brick-game.glb?url";

// the lean glTF decoder from the installed three, bundled into assets/ with hashed names
const draco = new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG);
draco.preload(); // fetch the decoder while the model downloads

// How far each button reaches for a tap and how deep it goes when pressed.
const BIG = { reach: 0.55, depth: 0.06 };
const PAD = { reach: 0.34, depth: 0.04 };
const SMALL = { reach: 0.3, depth: 0.027 };
const SIZES = { rotate: BIG, left: PAD, right: PAD, up: PAD, down: PAD, onoff: SMALL, sp: SMALL, sound: SMALL, reset: SMALL };
const MIN_HOLD_MS = 70; // a quick tap still shows the press

// Studio materials. Absolute values only: the loaded model is cached and may be tuned twice.
function tune(scene) {
  scene.traverse((o) => {
    const m = o.material;
    if (!m) return;
    if (m.name === "Material") {
      // body: plastic, not metal
      m.metalness = 0;
      m.roughness = 0.42;
    } else if (m.name === "Material.003") {
      // printed labels and the screen frame: lit by the room instead of glowing
      m.metalness = 0;
      m.roughness = 0.45;
      m.emissive.setScalar(0.03);
    } else if (m.name === "Material.002") {
      // buttons: glossy rubber
      m.roughness = 0.38;
      m.specularColor.setScalar(1);
    }
  });
}

// the page shows a loader until the console is on screen
function hideLoader() {
  document.getElementById("loader")?.classList.add("done");
}

export default function Device() {
  const gltf = useLoader(GLTFLoader, MODEL_URL, (loader) => loader.setDRACOLoader(draco));
  const invalidate = useThree((s) => s.invalidate);

  const lcd = useMemo(() => {
    const canvas = document.createElement("canvas");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    // the reflector behind a real LCD is brighter than painted plastic
    const material = new MeshStandardMaterial({ map: texture, roughness: 0.16, metalness: 0, envMapIntensity: 1.3 });
    return { draw: createLcd(canvas), texture, material, rev: 0 };
  }, []);

  const buttons = useMemo(() => {
    tune(gltf.scene);
    return Object.keys(SIZES).map((name) => {
      const node = gltf.scene.getObjectByName(name);
      node.userData.z ??= node.position.z; // the cached model may come back mid-press after a remount
      node.position.z = node.userData.z;
      return { name, node, x: node.position.x, y: node.position.y, z: node.userData.z, ...SIZES[name], p: 0, held: false, since: -Infinity };
    });
  }, [gltf]);

  useEffect(() => {
    draco.dispose(); // the model is decoded: stop the decoder workers
  }, []);

  useEffect(() => () => {
    lcd.texture.dispose();
    lcd.material.dispose();
  }, [lcd]);

  useEffect(() => {
    // Remember when each button went down, even if it comes back up before the next frame.
    const onKeys = ({ keys }) => {
      const now = performance.now();
      for (const b of buttons) {
        const held = keys.has(b.name);
        if (held && !b.held) b.since = now;
        b.held = held;
      }
    };
    onKeys(useGame.getState());
    return useGame.subscribe((state, prev) => {
      if (state.keys !== prev.keys) onKeys(state);
      invalidate();
    });
  }, [buttons, invalidate]);

  useFrame((state, delta) => {
    // three ignores envMapIntensity for scene.environment: the LCD takes the map itself
    if (lcd.material.envMap !== state.scene.environment) lcd.material.envMap = state.scene.environment;

    const { view } = useGame.getState();
    if (view.rev !== lcd.rev) {
      if (!lcd.rev) hideLoader();
      lcd.rev = view.rev;
      lcd.draw(view);
      lcd.texture.needsUpdate = true;
    }

    const now = performance.now();
    const dt = Math.min(delta, 1 / 30);
    let busy = false;
    for (const b of buttons) {
      const down = b.held || now - b.since < MIN_HOLD_MS;
      const target = down ? 1 : 0;
      if (b.p !== target) {
        const k = down ? 40 : 18;
        b.p += (target - b.p) * (1 - Math.exp(-k * dt));
        if (Math.abs(target - b.p) < 0.01) b.p = target; // the last 1% of travel is under a pixel
        b.node.position.z = b.z - b.depth * b.p;
      }
      // keep drawing until the button settles and a short tap has had its minimum hold
      if (b.p !== target || (!b.held && down)) busy = true;
    }
    if (busy) state.invalidate();
  });

  const nearest = (point) => {
    let best = null;
    let bestScore = 1;
    for (const b of buttons) {
      const score = Math.hypot(point.x - b.x, point.y - b.y) / b.reach;
      if (score <= bestScore) {
        best = b.name;
        bestScore = score;
      }
    }
    return best;
  };

  const onPointerDown = (e) => {
    const name = nearest(e.point);
    if (!name) return;
    e.stopPropagation();
    press(BUTTONS[name], "p" + e.pointerId);
  };

  const onPointerMove = (e) => {
    const cursor = nearest(e.point) ? "pointer" : "";
    if (document.body.style.cursor !== cursor) document.body.style.cursor = cursor;
  };

  const onPointerLeave = () => {
    document.body.style.cursor = "";
  };

  return (
    <>
      <primitive object={gltf.scene} />
      {/* the recess floor is at z = 0.4414; the plane's edges slip under its walls */}
      <mesh position={[0, 6.24, 0.4445]} material={lcd.material}>
        <planeGeometry args={[1.629, 1.991]} />
      </mesh>
      {/* one cheap target in front of all buttons instead of raycasting 359k vertices */}
      <mesh position={[0, 2.3, 0.72]} visible={false} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
        <planeGeometry args={[3.4, 2.2]} />
      </mesh>
    </>
  );
}
