import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { MotionProvider } from "./components/common/MotionProvider";
import { watchUiPreferences } from "./state/uiPreferences";

const stopPreferences = watchUiPreferences();
if (import.meta.hot) import.meta.hot.dispose(stopPreferences);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionProvider><App /></MotionProvider>
  </StrictMode>,
);
