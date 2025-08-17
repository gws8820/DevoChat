import React, { useState, useEffect, useCallback, useRef, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { IoImageOutline } from "react-icons/io5";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUpload } from "../utils/useFileUpload";
import axios from "../utils/axiosConfig";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import InputContainer from "../components/InputContainer";
import "../styles/Common.css";

function Main({ isTouch }) {
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
    modelsData,
    defaultModel,
    model,
    updateModel,
    isInference,
    isSearch,
    isDeepResearch,
    canReadImage,
    setTemperature,
    setReason,
    setVerbosity,
    setSystemMessage,
    setIsImage,
    setIsDAN,
    toggleInference,
    toggleSearch,
    toggleDeepResearch
  } = useContext(SettingsContext);

  const { addConversation } = useContext(ConversationsContext);

  const models = modelsData.models;
  const uploadingFiles = uploadedFiles.some((file) => !file.content);

  useEffect(() => {
    const fetchNotice = async () => {
      try {
        const noticeResponse = await axios.get(`${process.env.REACT_APP_FASTAPI_URL}/notice`);
        const { message, hash } = noticeResponse.data;
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
    updateModel(defaultModel);

    if (isInference) toggleInference();
    if (isSearch) toggleSearch();
    if (isDeepResearch) toggleDeepResearch();
    
    setTemperature(0.5);
    setReason(2);
    setVerbosity(2);
    setSystemMessage("");
    setIsImage(false);
    setIsDAN(false);
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
        
        const response = await axios.post(
          `${process.env.REACT_APP_FASTAPI_URL}/new_conversation`, {},
          { 
            withCredentials: true,
            signal: controller.signal
          }
        );
        
        const conversation_id = response.data.conversation_id;
        const created_at = response.data.created_at;
        
        const newConversation = {
          conversation_id,
          alias: "새 대화",
          starred: false,
          starred_at: null,
          created_at: created_at,
          isLoading: true
        };
        addConversation(newConversation);
        
        navigate(`/chat/${conversation_id}`, {
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
    setIsImage(hasUploadedImage);
  },
  [setIsImage, uploadedFiles]);
  
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
          initial={{ y: 5 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.3 }}
        >
          무엇을 도와드릴까요?
        </motion.div>
      </div>

      <InputContainer
        isTouch={isTouch}
        placeholder="내용 입력하기"
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
              <IoImageOutline style={{ fontSize: "40px" }} />
              <div className="drag-text">여기에 파일을 추가하세요</div>
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

export default Main;