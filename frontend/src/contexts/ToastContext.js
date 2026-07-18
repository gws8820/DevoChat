import React, { createContext, useState, useCallback, useMemo, useContext } from "react";
import Toast from "../components/Toast";

export const ToastContext = createContext(null);

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState({ message: "", type: "error", visible: false });

  const showToast = useCallback((message, type = "error") => {
    setToast({ message: message || "오류가 발생했습니다.", type, visible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.visible}
        onClose={hideToast}
      />
    </ToastContext.Provider>
  );
};
