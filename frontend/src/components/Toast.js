import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CiWarning } from "react-icons/ci";
import { GoCopy, GoCheck } from "react-icons/go";
import { BiInfoCircle } from "react-icons/bi";
import "../styles/Toast.css";

function Toast({ 
  type, 
  message, 
  isVisible, 
  onClose
}) {
  React.useEffect(() => {
    if (isVisible > 0) {
      const timer = setTimeout(() => {
        onClose?.();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  const getIcon = () => {
    switch (type) {
      case "error":
        return <CiWarning style={{ flexShrink: 0, marginRight: "4px", fontSize: "16px" }} />;
      case "success":
        return <GoCheck style={{ flexShrink: 0, marginRight: "6px", fontSize: "14px" }} />;
      case "copy":
        return <GoCopy style={{ flexShrink: 0, marginRight: "6px", fontSize: "14px" }} />;
      case "info":
        return <BiInfoCircle style={{ flexShrink: 0, marginRight: "4px", fontSize: "16px" }} />;
      default:
        return null;
    }
  };

  const getClassName = () => {
    const baseClass = 'toast-container';
    switch (type) {
      case "error":
        return `${baseClass} toast-error`;
      case "success":
        return `${baseClass} toast-success`;
      case "copy":
        return `${baseClass} toast-copy`;
      case "info":
        return `${baseClass} toast-info`;
      default:
        return baseClass;
    }
  };

  return (
    <AnimatePresence>
      {isVisible && message && (
        <div className="toast-wrapper">
          <motion.div
            className={getClassName()}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {getIcon()}
            {message}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default Toast; 