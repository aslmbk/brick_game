import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// iOS Safari ignores user-scalable=no: stop pinch zoom from moving the page under the fingers
document.addEventListener("gesturestart", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
