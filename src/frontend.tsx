import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import "@xyflow/react/dist/style.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element");
}

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

const root = import.meta.hot
  ? (import.meta.hot.data.root ??= createRoot(rootElement))
  : createRoot(rootElement);

root.render(app);
