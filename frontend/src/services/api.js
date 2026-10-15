import axios from "axios";

const api = axios.create({
    // Keep the default hostname aligned with Vite's localhost development URL
    // so the browser includes the authenticated session cookie in API requests.
    baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5001",
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem("vendorflowUser");
            localStorage.removeItem("vendorflowRole");

            if (window.location.pathname !== "/login") {
                window.location.assign("/login");
            }
        }

        return Promise.reject(error);
    }
);

export default api;
