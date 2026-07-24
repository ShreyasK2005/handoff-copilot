/*
 * main.jsx – Entry point. Mounts React into #root.
 * [VITE] traces these imports to bundle everything.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);