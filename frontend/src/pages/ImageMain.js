import React, { useState, useEffect, useCallback, useRef, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { IoImageOutline } from "react-icons/io5";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { useFileUpload } from "../utils/useFileUpload";
import axios from "../utils/axiosConfig";
import Toast from "../components/Toast";
import ImageInputContainer from "../components/ImageInputContainer";
import "../styles/Common.css";

function ImageMain({ isTouch }) {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const abortControllerRef = useRef(null);

  const {
    canEditImage,
    maxImageInput,
    updateImageModel,
    defaultImageModel
  } = useContext(SettingsContext);

  const { addConversation } = useContext(ConversationsContext);

  const {
    uploadedFiles,
    processFiles,
    removeFile
  } = useFileUpload([]);

  const uploadingFiles = uploadedFiles.some((file) => !file.content);

  useEffect(() => {
    updateImageModel(defaultImageModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim() || uploadingFiles) return;
      try {
        setIsLoading(true);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const response = await axios.post(
          `${process.env.REACT_APP_FASTAPI_URL}/image/new_conversation`, {},
          {
            withCredentials: true,
            signal: controller.signal
          }
        );

        const conversation_id = response.data.conversation_id;
        const created_at = response.data.created_at;
        const newConversation = {
          type: "image",
          conversation_id,
          alias: "새 대화",
          starred: false,
          starred_at: null,
          created_at: created_at,
          isLoading: true
        };
        addConversation(newConversation);

        navigate(`/image/${conversation_id}`, {
          state: {
            initialMessage: message,
            initialFiles: uploadedFiles,
          },
          replace: false,
        });
      } catch (error) {
        setToastMessage("새 대화를 시작하는 데 실패했습니다.");
        setShowToast(true);
        setIsLoading(false);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [navigate, uploadedFiles, uploadingFiles, addConversation]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      setIsDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      await processFiles(files, (errorMessage) => {
        setToastMessage(errorMessage);
        setShowToast(true);
      }, canEditImage, maxImageInput);
    },
    [processFiles, canEditImage, maxImageInput]
  );

  return (
    <div
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="welcome-container">
        <motion.div
          className="welcome-message"
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          상상을 마음껏 펼쳐보세요!
        </motion.div>
      </div>

      <ImageInputContainer
        isTouch={isTouch}
        placeholder="프롬프트 입력"
        extraClassName="main-input-container"
        inputText={inputText}
        setInputText={setInputText}
        isLoading={isLoading}
        onSend={sendMessage}
        onCancel={cancelRequest}
        uploadedFiles={uploadedFiles}
        processFiles={processFiles}
        removeFile={removeFile}
        uploadingFiles={uploadingFiles}
        canEditImage={canEditImage}
        maxImageInput={maxImageInput}
      />

      <AnimatePresence>
        {isDragActive && (
          <motion.div
            key="drag-overlay"
            className="drag-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <div className="drag-container">
              <IoImageOutline style={{ fontSize: "40px" }} />
              <div className="drag-text">여기에 이미지를 추가하세요</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast
        type="error"
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  );
}

export default ImageMain;