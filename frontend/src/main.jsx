import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

import { ToastProvider } from "./components/Toast/ToastContext";

import "./styles/variables.css";
import "./styles/global.css";
import "./styles/responsive.css";
import "./styles/premium.css";
import "./styles/platform.css";


// =========================================================
// INITIALIZE SAVED THEME BEFORE APP LOADS
// =========================================================

const savedTheme =
    localStorage.getItem("vendorflowTheme") || "light";

document.documentElement.setAttribute(
    "data-theme",
    savedTheme
);


// =========================================================
// RENDER APPLICATION
// =========================================================

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <ToastProvider>
            <App />
        </ToastProvider>
    </React.StrictMode>
);


// =========================================================
// PWA: install support + offline app shell (production only)
// =========================================================

if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
}
