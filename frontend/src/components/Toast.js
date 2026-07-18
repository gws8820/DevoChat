import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FiAlertTriangle, FiCheck, FiCopy, FiInfo, FiX } from "react-icons/fi";
import "../styles/Toast.css";

function Toast({
  type,
  message,
  isVisible,
  onClose,
}) {
  React.useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose?.();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isVisible, message, onClose]);

  const getIcon = () => {
    switch (type) {
      case "error":
        return <FiAlertTriangle className="toast-icon" />;
      case "success":
        return <FiCheck className="toast-icon" />;
      case "copy":
        return <FiCopy className="toast-icon" />;
      case "info":
        return <FiInfo className="toast-icon" />;
      default:
        return null;
    }
  };

  const content = (
    <AnimatePresence>
      {isVisible && message && (
        <div className="toast-wrapper">
          <motion.div
            className="toast-banner"
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.3 }}
          >
            {getIcon()}
            <div className="toast-message">{message}</div>
            <FiX className="toast-close" onClick={() => onClose?.()} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== "undefined" && document.body) {
    return createPortal(content, document.body);
  }

  return content;
}

export default Toast;
