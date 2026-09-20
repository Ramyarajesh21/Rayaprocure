import { createContext, useContext, useState } from "react";
import Toast from "./Toast";

const ToastContext = createContext();

export function ToastProvider({ children }) {

    const [toast, setToast] = useState({
        message: "",
        type: "success"
    });

    const showToast = (message, type = "success") => {

        setToast({
            message,
            type
        });

        setTimeout(() => {
            setToast({
                message: "",
                type: "success"
            });
        }, 3000);
    };

    const closeToast = () => {
        setToast({
            message: "",
            type: "success"
        });
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}

            <Toast
                message={toast.message}
                type={toast.type}
                onClose={closeToast}
            />
        </ToastContext.Provider>
    );
}


export function useToast() {

    return useContext(ToastContext);

}