import { Component, Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { bindInput } from "./game/store";
import Device from "./scene/Device";
import Studio from "./scene/Studio";

const SHADOW_SCALE = [6, 3]; // stable reference: ContactShadows rebuilds its targets when scale changes
const preventMenu = (e) => e.preventDefault(); // long press on a button must not open a menu

// No WebGL or no model: say so in the loader instead of leaving an empty page.
class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    const loader = document.getElementById("loader");
    if (!loader) return;
    loader.className = "failed";
    loader.querySelector("p").textContent = /webgl/i.test(String(error?.message))
      ? "This browser can't show 3D graphics: WebGL is turned off or not supported."
      : "The console didn't load. Check your connection and reload the page.";
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function App() {
  const [epoch, setEpoch] = useState(0);
  useEffect(bindInput, []);

  const onCreated = (state) => {
    // three restores buffers and textures itself; baked maps have to be rendered again
    state.gl.domElement.addEventListener("webglcontextrestored", () => setEpoch((n) => n + 1));
    if (import.meta.env.DEV) window.__r3f = state;
  };

  return (
    <ErrorBoundary>
      <Canvas
        frameloop="demand"
        camera={{ fov: 30 }}
        gl={{ powerPreference: "default" }}
        style={{ touchAction: "none" }}
        onContextMenu={preventMenu}
        onCreated={onCreated}
      >
        <Studio epoch={epoch} />
        <Suspense fallback={null}>
          <Device />
          {/* rendered once, in the same frame the model appears */}
          <ContactShadows
            key={epoch}
            frames={1}
            resolution={256}
            position={[0, 0, 0]}
            scale={SHADOW_SCALE}
            far={1.2}
            blur={2.4}
            opacity={0.65}
            color="#140a04"
          />
        </Suspense>
      </Canvas>
    </ErrorBoundary>
  );
}

export default App;
