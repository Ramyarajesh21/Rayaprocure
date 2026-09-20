/* =========================================================
   RAYAPROCURE LOGIN
   Theme-aware Login Page
   ========================================================= */

import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import loginBg from "../../assets/images/login-bg.png";
import rayaprocureLogo from "../../assets/icons/rayaprocure-logo.png";

function Login() {

    const navigate = useNavigate();

    const [showPassword, setShowPassword] = useState(false);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event) => {

        event.preventDefault();

        setError("");
        setLoading(true);

        try {

            const response = await axios.post(
                "http://127.0.0.1:5000/api/auth/login",
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
                        Welcome back
                    </h1>

                    <p>
                        Sign in to continue to your workspace.
                    </p>

                </div>


                {/* LOGIN FORM */}

                <form
                    className="login-form"
                    onSubmit={handleSubmit}
                >

                    {/* USERNAME */}

                    <div className="login-field">

                        <label htmlFor="email">
                            Email / Username
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
                                autoComplete="current-password"
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
                            ? "Signing In..."
                            : "Sign In"}
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