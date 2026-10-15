/* =========================================================
   RAYAPROCURE LOGIN
   Theme-aware Login Page
   ========================================================= */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import "./Login.css";
import loginBg from "../../assets/images/login-bg.png";
import rayaprocureLogo from "../../assets/icons/rayaprocure-logo.png";

function Login() {

    const navigate = useNavigate();

    const [showPassword, setShowPassword] = useState(false);

    const [mode, setMode] = useState("login");
    const [companyName, setCompanyName] = useState("");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const isSignup = mode === "signup";

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event) => {

        event.preventDefault();

        setError("");
        setLoading(true);

        try {

            const response = isSignup
                ? await api.post("/api/auth/register", {
                    company_name: companyName.trim(),
                    name: fullName.trim(),
                    email: email.trim(),
                    username: username.trim(),
                    password: password
                })
                : await api.post(
                    "/api/auth/login",
                    {
                        username: username.trim(),
                        password: password
                    }
                );

            const user = response.data.user;

            if (!user) {
                setError("Invalid login response from server.");
                return;
            }

            localStorage.setItem(
                "vendorflowUser",
                JSON.stringify(user)
            );

            if (user.role) {
                localStorage.setItem(
                    "vendorflowRole",
                    user.role
                );
            }

            navigate("/dashboard");

        } catch (error) {

            if (error.response) {

                setError(
                    error.response.data?.message ||
                    "Invalid username or password"
                );

            } else {

                setError(
                    "Unable to connect to the server"
                );

            }

        } finally {

            setLoading(false);

        }
    };

    return (
        <div
            className="login-page"
            style={{
                "--login-background-image": `url(${loginBg})`
            }}
        >

            <div className="login-card">

                {/* LOGO */}

                <div className="login-logo">

                    <img
                        src={rayaprocureLogo}
                        alt="Rayaprocure"
                        className="rayaprocure-logo"
                    />

                </div>


                {/* HEADING */}

                <div className="login-heading">

                    <h1>
                        {isSignup ? "Create your workspace" : "Welcome back"}
                    </h1>

                    <p>
                        {isSignup
                            ? "Start sending GST-ready quotations and invoices in minutes."
                            : "Sign in to continue to your workspace."}
                    </p>

                </div>


                {/* LOGIN FORM */}

                <form
                    className="login-form"
                    onSubmit={handleSubmit}
                >

                    {isSignup && (
                        <>
                            <div className="login-field">
                                <label htmlFor="companyName">Company name</label>
                                <input
                                    id="companyName"
                                    type="text"
                                    placeholder="Your company"
                                    value={companyName}
                                    onChange={(event) => setCompanyName(event.target.value)}
                                    required
                                />
                            </div>

                            <div className="login-field">
                                <label htmlFor="fullName">Your name</label>
                                <input
                                    id="fullName"
                                    type="text"
                                    autoComplete="name"
                                    placeholder="Your full name"
                                    value={fullName}
                                    onChange={(event) => setFullName(event.target.value)}
                                    required
                                />
                            </div>

                            <div className="login-field">
                                <label htmlFor="signupEmail">Work email</label>
                                <input
                                    id="signupEmail"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    required
                                />
                            </div>
                        </>
                    )}

                    {/* USERNAME */}

                    <div className="login-field">

                        <label htmlFor="email">
                            {isSignup ? "Choose a username" : "Email / Username"}
                        </label>

                        <input
                            id="email"
                            type="text"
                            placeholder="Enter your email or username"
                            autoComplete="username"
                            value={username}
                            onChange={(event) =>
                                setUsername(event.target.value)
                            }
                            required
                        />

                    </div>


                    {/* PASSWORD */}

                    <div className="login-field">

                        <label htmlFor="password">
                            Password
                        </label>

                        <div className="login-password-wrapper">

                            <input
                                id="password"
                                type={
                                    showPassword
                                        ? "text"
                                        : "password"
                                }
                                placeholder="Enter your password"
                                autoComplete={isSignup ? "new-password" : "current-password"}
                                minLength={isSignup ? 8 : undefined}
                                value={password}
                                onChange={(event) =>
                                    setPassword(event.target.value)
                                }
                                required
                            />

                            <button
                                type="button"
                                className="login-password-toggle"
                                onClick={() =>
                                    setShowPassword(
                                        !showPassword
                                    )
                                }
                                aria-label={
                                    showPassword
                                        ? "Hide password"
                                        : "Show password"
                                }
                            >
                                {showPassword
                                    ? "Hide"
                                    : "Show"}
                            </button>

                        </div>

                    </div>


                    {/* ERROR */}

                    {error && (

                        <div className="login-error">
                            {error}
                        </div>

                    )}


                    {/* OPTIONS */}

                    <div className="login-options">

                        <label className="login-remember">

                            <input
                                type="checkbox"
                            />

                            <span>
                                Remember me
                            </span>

                        </label>

                        <button
                            type="button"
                            className="login-forgot"
                            onClick={() =>
                                setError(
                                    "Please contact the Owner to reset your password."
                                )
                            }
                        >
                            Forgot password?
                        </button>

                    </div>


                    {/* SUBMIT */}

                    <button
                        type="submit"
                        className="login-submit"
                        disabled={loading}
                    >
                        {loading
                            ? (isSignup ? "Creating workspace..." : "Signing In...")
                            : (isSignup ? "Create workspace" : "Sign In")}
                    </button>

                    <button
                        type="button"
                        className="login-forgot"
                        style={{ alignSelf: "center", marginTop: 10 }}
                        onClick={() => {
                            setError("");
                            setMode(isSignup ? "login" : "signup");
                        }}
                    >
                        {isSignup
                            ? "Already have an account? Sign in"
                            : "New company? Create a workspace"}
                    </button>

                </form>


                {/* FOOTER */}

                <div className="login-footer">

                    Rayaprocure • Vendor Operations

                </div>

            </div>

        </div>
    );
}

export default Login;
