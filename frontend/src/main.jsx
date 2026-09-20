import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

import { ToastProvider } from "./components/Toast/ToastContext";

import "./styles/variables.css";
import "./styles/global.css";
import "./styles/responsive.css";


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