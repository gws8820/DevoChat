import React, { useState, useEffect, useRef, useCallback } from "react";
import { GoImage } from "react-icons/go";
import { ImSpinner8 } from "react-icons/im";
import { BiX } from "react-icons/bi";
import { motion, AnimatePresence } from "framer-motion";
import { ClipLoader } from "react-spinners";
import { FaPaperPlane, FaStop } from "react-icons/fa";
import Toast from "./Toast";
import "../styles/InputContainer.css";

function ImageInputContainer({
  isTouch,
  placeholder,
  extraClassName = "",
  inputText,
  setInputText,
  isLoading,
  onSend,
  onCancel,
  uploadedFiles,
  processFiles,
  removeFile,
  uploadingFiles,
  canEditImage,
  maxImageInput,
}) {
  
  const [isComposing, setIsComposing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const optionsRef = useRef(null);
  const textAreaRef = useRef(null);
  const fileInputRef = useRef(null);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textAreaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const calculatedHeight = Math.max(textarea.scrollHeight, canEditImage ? 40 : 80);
      const newHeight = Math.min(calculatedHeight, 250);
      textarea.style.height = `${newHeight}px`;
    }
  }, [canEditImage]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText, adjustTextareaHeight]);

  const notifyError = useCallback((message) => {
    setToastMessage(message);
    setShowToast(true);
  }, []);

  const handlePaste = useCallback(
    async (e) => {
      const items = e.clipboardData.items;
      const filesToUpload = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file && file.type && file.type.startsWith("image/")) {
            filesToUpload.push(file);
          }
        }
      }
      if (filesToUpload.length > 0) {
        e.preventDefault();
        await processFiles(filesToUpload, notifyError, canEditImage, maxImageInput);
      }
    },
    [processFiles, notifyError, canEditImage, maxImageInput]
  );

  const handleImageButtonClick = useCallback((e) => {
    e.stopPropagation();
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const handleFileDelete = useCallback((file) => {
    removeFile(file.id);
  }, [removeFile]);

  const handleKeyDown = useCallback((event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !isComposing &&
      !isTouch &&
      !uploadingFiles
    ) {
      event.preventDefault();
      onSend(inputText);
    }
  }, [inputText, isComposing, isTouch, uploadingFiles, onSend]);

  const handleSendButtonClick = useCallback(() => {
    if (isLoading) {
      onCancel?.();
      return;
    }
    if (inputText.trim()) {
      onSend(inputText);
    } else {
      setToastMessage("내용을 입력해주세요.");
      setShowToast(true);
    }
  }, [isLoading, inputText, onSend, onCancel]);

  return (
    <motion.div
      className={`input-container ${extraClassName}`}
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="content-container">
        <AnimatePresence>
          {uploadedFiles.length > 0 && (
            <motion.div
              className="file-area"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <AnimatePresence>
                {uploadedFiles.map((file) => (
                  <motion.div
                    key={file.id}
                    className="file-wrap"
                    initial={{ y: 5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 5, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{ position: "relative" }}
                  >
                    {file.preview ? (
                      <div className="file-object image">
                        <img
                          src={file.preview}
                          alt={file.name}
                        />
                        <BiX className="file-delete" onClick={() => handleFileDelete(file)} />
                      </div>
                    ) : (
                      <div className="file-object">
                        <span className="file-name">{file.name}</span>
                        <BiX className="file-delete" onClick={() => handleFileDelete(file)} />
                      </div>
                    )}
                    {!file.content && (
                      <div className="file-upload-overlay">
                        <ClipLoader size={20} />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="input-area">
          <textarea
            ref={textAreaRef}
            className="message-input"
            placeholder={placeholder}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
          />
        </div>

        <div className="button-area">
          {canEditImage && (
            <div className="function-button-container" ref={optionsRef}>
              <motion.div
                className="function-button"
                onClick={handleImageButtonClick}
                transition={{ type: "physics", velocity: 200, stiffness: 100, damping: 15 }}
                layout
              >
                <GoImage style={{ strokeWidth: 0.5 }} />
                <span className="button-text">이미지</span>
              </motion.div>
            </div>
          )}
        </div>
      </div>

      <button
        className="send-button"
        onClick={handleSendButtonClick}
        disabled={uploadingFiles}
        aria-label={isLoading ? "전송 중단" : "메시지 전송"}
      >
        {isLoading ? (
          <div className="loading-container">
            <ImSpinner8 className="spinner" />
            <FaStop className="stop-icon" />
          </div>
        ) : (
          <FaPaperPlane />
        )}
      </button>

      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={async (e) => {
          const files = Array.from(e.target.files);
          await processFiles(files, (errorMessage) => {
            setToastMessage(errorMessage);
            setShowToast(true);
          }, canEditImage, maxImageInput);
          e.target.value = "";
        }}
      />

      <Toast
        type="error"
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </motion.div>
  );
}

export default ImageInputContainer;


