// Camera that fits the console to any screen, plus the lights.
import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { requestFrame } from "./frame";

// Measured once from the model: vertical extent, half width and the front face.
const FIT = { minY: -0.15, maxY: 7.95, halfW: 1.9, frontZ: 0.6 };
const TARGET_Y = (FIT.minY + FIT.maxY) / 2;
const TAN = Math.tan((30 / 2) * (Math.PI / 180)); // half of the 30° vertical fov

function fitDistance(aspect) {
  const margin = aspect < 1 ? 1.03 : 1.07;
  const byHeight = ((FIT.maxY - FIT.minY) / 2) * margin / TAN;
  const byWidth = (FIT.halfW * margin) / (TAN * aspect);
  return FIT.frontZ + Math.max(byHeight, byWidth);
}

function Camera() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const get = useThree((s) => s.get);

  useLayoutEffect(() => {
    const dist = fitDistance(width / height);
    camera.position.set(0, TARGET_Y, dist);
    camera.lookAt(0, TARGET_Y, 0);
    // a tight depth range keeps the recess free of z-fighting even with 16-bit depth
    camera.near = dist * 0.5;
    camera.far = dist * 2;
    camera.updateProjectionMatrix();
    requestFrame(get());
  }, [camera, width, height, get]);

  return null;
}

export default function Studio() {
  return (
    <>
      <color args={["#141109"]} attach="background" />
      <ambientLight intensity={2.1} />
      <directionalLight position={[1, 2, 3]} />
      <Camera />
    </>
  );
}
