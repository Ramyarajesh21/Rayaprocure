import "./Toast.css";

function Toast({ type = "success", message, onClose }) {
    if (!message) {
        return null;
    }

    return (
        <div className={`rayaprocure-toast ${type}`}>
            <div className="toast-icon">
                {type === "success" ? "✓" : "!"}
            </div>

            <div className="toast-message">
                {message}
            </div>

            <button
                type="button"
                className="toast-close"
                onClick={onClose}
                aria-label="Close notification"
            >
                ×
            </button>
        </div>
    );
}

export default Toast;