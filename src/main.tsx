import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DialogHost } from "./ui/dialog";
import "./state/theme"; // applies the saved theme before the first render
import "./floorish.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <DialogHost />
  </StrictMode>,
);
