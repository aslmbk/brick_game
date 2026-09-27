import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import "./App.css";
import { bindInput } from "./game/store";
import Device from "./scene/Device";
import Studio from "./scene/Studio";

const preventMenu = (e) => e.preventDefault(); // long press on a button must not open a menu

function App() {
  useEffect(bindInput, []);

  return (
    <Canvas
      frameloop="demand"
      camera={{ fov: 30 }}
      gl={{ powerPreference: "default" }}
      style={{ touchAction: "none" }}
      onContextMenu={preventMenu}
    >
      <Studio />
      <Suspense fallback={null}>
        <Device />
      </Suspense>
    </Canvas>
  );
}

export default App;
