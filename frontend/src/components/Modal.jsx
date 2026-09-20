function Modal({
    title,
    children,
    onClose,
}) {
    return (
        <div className="vf-modal-overlay">

            <div className="vf-modal">

                <div className="vf-modal-header">

                    <div>
                        <h2>{title}</h2>
                    </div>

                    <button
                        type="button"
                        className="vf-modal-close"
                        onClick={onClose}
                    >
                        ×
                    </button>

                </div>

                <div className="vf-modal-body">
                    {children}
                </div>

            </div>

        </div>
    );
}

export default Modal;