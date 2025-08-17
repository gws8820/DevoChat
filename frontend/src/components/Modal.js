// Modal.js
import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from "framer-motion";
import "../styles/Modal.css";

function Modal({ message, onConfirm, onCancel, showCancelButton = true }) {
  return createPortal(
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">{message}</div>
        <div className="modal-button">
          {showCancelButton && (
            <button className="button" onClick={() => onCancel()}>
              취소
            </button>
          )}
          <button
            className={`button ${showCancelButton ? 'highlight' : ''}`}
            onClick={() => onConfirm()}
          >
            확인
          </button>
        </div>
      </div>
    </motion.div>,
    document.body
  );
}

export default Modal;