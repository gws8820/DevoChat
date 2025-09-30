import React, { useState, useEffect, useCallback, useRef, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { IoImageOutline, IoAttach } from "react-icons/io5";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUpload } from "../utils/useFileUpload";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import InputContainer from "../components/InputContainer";
import "../styles/Common.css";

function Home({ isTouch }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [notice, setNotice] = useState("");
  const [noticeHash, setNoticeHash] = useState("");
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const abortControllerRef = useRef(null);

  const { 
    uploadedFiles, 
    processFiles, 
    removeFile
  } = useFileUpload([]);

  const {
    models,
    model,
    isInference,
    isSearch,
    isDeepResearch,
    canReadImage,
    setTemperature,
    setReason,
    setVerbosity,
    setSystemMessage,
    setIsDAN,
    setHasImage,
    toggleInference,
    toggleSearch,
    toggleDeepResearch
  } = useContext(SettingsContext);

  const { addConversation } = useContext(ConversationsContext);

  const uploadingFiles = uploadedFiles.some((file) => !file.content);

  useEffect(() => {
    const fetchNotice = async () => {
      try {
        const noticeRes = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/notice`, { credentials: "include" });
        if (!noticeRes.ok) {
          return;
        }
        const { message, hash } = await noticeRes.json();
        setNotice(message);
        setNoticeHash(hash);
        
        const storedHash = localStorage.getItem('noticeHash');
        if (!storedHash || storedHash !== hash) {
          setConfirmModal(true);
        }
      } catch (error) {}
    };
    
    fetchNotice();
  }, []);

  useEffect(() => {
    if (isInference) toggleInference();
    if (isSearch) toggleSearch();
    if (isDeepResearch) toggleDeepResearch();
    
    setTemperature(1);
    setReason(0.5);
    setVerbosity(0.5);
    setSystemMessage("");
    setIsDAN(false);
    setHasImage(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (location.state?.errorModal) {
      setToastMessage(location.state.errorModal);
      setShowToast(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim() || uploadingFiles) return;
      try {
        const selectedModel = models.find((m) => m.model_name === model);
        if (!selectedModel) {
          throw new Error("선택한 모델이 유효하지 않습니다.");
        }
        setIsLoading(true);
        
        const controller = new AbortController();
        abortControllerRef.current = controller;
        
        const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/chat/new_conversation`, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        if (!res.ok) {
          throw new Error('새 대화를 시작하는 데 실패했습니다.');
        }
        
        const data = await res.json();
        const newConversation = {
          type: "chat",
          conversation_id: data.conversation_id,
          alias: "새 대화",
          starred: false,
          starred_at: null,
          created_at: data.created_at,
          isLoading: true
        };
        addConversation(newConversation);

        navigate(`/chat/${data.conversation_id}`, {
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
    [
      models,
      model,
      navigate,
      uploadedFiles,
      uploadingFiles,
      addConversation
    ]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    const hasUploadedImage = uploadedFiles.some((file) => {
      return (file.type && (file.type === "image" || file.type.startsWith("image/"))) || 
        /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name);
    });
    setHasImage(hasUploadedImage);
  },
  [setHasImage, uploadedFiles]);
  
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
      }, canReadImage);
    },
    [processFiles, canReadImage]
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
          무엇을 도와드릴까요?
        </motion.div>
      </div>

      <InputContainer
        isTouch={isTouch}
        placeholder="내용 입력"
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
              {canReadImage ? (
                <>
                  <IoImageOutline style={{ fontSize: "40px" }} />
                  <div className="drag-text">여기에 파일 또는 이미지를 추가하세요</div>
                </>
              ) : (
                <>
                  <IoAttach style={{ fontSize: "40px" }} />
                  <div className="drag-text">여기에 파일을 추가하세요</div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmModal && (
          <Modal
            message={notice}
            onConfirm={() => {
              localStorage.setItem('noticeHash', noticeHash);
              setConfirmModal(false);
            }}
            showCancelButton={false}
          />
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

export default Home;
