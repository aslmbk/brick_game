import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// iOS Safari ignores user-scalable=no: stop pinch zoom from moving the page under the fingers
document.addEventListener("gesturestart", (e) => e.preventDefault());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
