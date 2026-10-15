import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { FiX } from "react-icons/fi";
import { NAV_ITEMS } from "./navItems";
import "./MobileNav.css";

// Slide-in navigation for phones/tablets, where the desktop sidebar is hidden.
function MobileNav() {
    const [open, setOpen] = useState(false);
    const location = useLocation();

    let role;
    try {
        role = JSON.parse(localStorage.getItem("vendorflowUser") || "null")?.role;
    } catch {
        role = undefined;
    }

    // Close after navigating.
    useEffect(() => {
        setOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        document.body.style.overflow = open ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [open]);

    const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

    return (
        <>
            <button
                type="button"
                className="mobile-nav-toggle"
                aria-label="Open menu"
                aria-expanded={open}
                onClick={() => setOpen(true)}
            >
                <span />
                <span />
                <span />
            </button>

            {open && <div className="mobile-nav-overlay" onClick={() => setOpen(false)} />}

            <nav className={`mobile-nav${open ? " open" : ""}`} aria-hidden={!open}>
                <div className="mobile-nav-head">
                    <strong>RayaProcure</strong>
                    <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}><FiX aria-hidden="true" /></button>
                </div>
                {items.map((item) => {
                    const Icon = item.icon;
                    return (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => (isActive ? "mobile-nav-link active" : "mobile-nav-link")}
                    >
                        {Icon && <Icon aria-hidden="true" />}
                        <span>{item.name}</span>
                    </NavLink>
                    );
                })}
            </nav>
        </>
    );
}

export default MobileNav;
