import { Canvas, useThree } from "@react-three/fiber";
import "./App.css";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { Center, Html } from "@react-three/drei";
import Tetris from "./components/tetris/Tetris";
import { useEffect } from "react";
import { BUTTONS } from "./game/device";
import { bindInput, press } from "./game/store";

// R3F calls this for every mesh under the pointer: take the first button, skip the rest.
function onPointerDown(e) {
  const input = BUTTONS[e.object.name];
  if (!input) return;
  e.stopPropagation();
  press(input, "p" + e.pointerId);
}

function Thing() {
  const model = useLoader(GLTFLoader, "./tetris3.0.d.glb", (loader) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("./draco/");
    loader.setDRACOLoader(dracoLoader);
  });

  const { viewport } = useThree();

  return (<Center onCentered={({ container, height, width }) => {
    container.scale.setScalar(viewport.height / height - 0.04);
    if (viewport.width < width) {
      container.scale.setScalar(viewport.width / width - 0.08);
    }
  }}>
    <group>
      <primitive onPointerDown={onPointerDown} object={model.scene} />
      <Html style={{ pointerEvents: "none", width: 260 }} zIndexRange={[1, 0]} distanceFactor={3.45} transform position={[-0.07, 6.45, 0]} center>
        <Tetris />
      </Html>
    </group>
  </Center>
  );
}

function App() {
  useEffect(bindInput, []);

  return (
    <Canvas>
      <color args={[ "#141109" ]} attach="background" />
      <ambientLight intensity={2.1} />
      <directionalLight position={[1, 2, 3]} />
      <Thing />
    </Canvas>
  );
}

export default App;
