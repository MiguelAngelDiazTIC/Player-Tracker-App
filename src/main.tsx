import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme } from "./app/theme";
import { Bootstrap } from "./platform/Bootstrap";
import "./styles/index.css";

// Antes de pintar nada, para que la app no parpadee en el otro tema.
applyTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Bootstrap>{(services) => <App services={services} />}</Bootstrap>
  </React.StrictMode>,
);
