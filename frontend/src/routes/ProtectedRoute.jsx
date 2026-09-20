import { Navigate } from "react-router-dom";

function ProtectedRoute({ children, roles }) {

    const storedUser = localStorage.getItem("vendorflowUser");

    if (!storedUser) {
        return <Navigate to="/login" replace />;
    }

    const user = JSON.parse(storedUser);

    if (roles && !roles.includes(user.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}

export default ProtectedRoute;