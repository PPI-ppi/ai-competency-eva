import React from "react";
import { createRoot } from "react-dom/client";
import App from "./main.jsx";
import "./typography.css";
import "./responsive.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root application container");

createRoot(rootElement).render(
  <React.StrictMode><App /></React.StrictMode>,
);
