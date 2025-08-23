import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from "react";
import { IoImageOutline } from "react-icons/io5";
import { motion, AnimatePresence } from "framer-motion";

import { SettingsContext } from "../contexts/SettingsContext";
import { useFileUpload } from "../utils/useFileUpload";
import ImageInputContainer from "../components/ImageInputContainer";
import Message from "../components/Message";
import Toast from "../components/Toast";
import "../styles/Common.css";

function Image({ isTouch }) {
  const { 
    imageModel, 
    imageModels, 
    maxImageInput,
    canEditImage,
    defaultImageModel,
    updateImageModel,
    switchImageMode
  } = useContext(SettingsContext);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [scrollOnSend, setScrollOnSend] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const {
    uploadedFiles, 
    setUploadedFiles,
    processFiles, 
    removeFile
  } = useFileUpload([]);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const uploadingFiles = uploadedFiles.some((file) => !file.content);
  const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  useEffect(() => {
    updateImageModel(defaultImageModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const hasUploadedImages = uploadedFiles.length > 0;
    switchImageMode(hasUploadedImages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFiles, switchImageMode]);

  const addAssistantMessage = useCallback((content) => {
    const newMessage = { 
      role: "assistant", 
      content,
      id: generateMessageId()
    };
    setMessages((prev) => [...prev, newMessage]);
  }, []);

  const setErrorMessage = useCallback((message) => {
    const errorMessage = { 
      role: "error", 
      content: message,
      id: generateMessageId()
    };
    setMessages((prev) => [...prev, errorMessage]);
  }, []);

  useEffect(() => {
    const container = messagesEndRef.current?.parentElement;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = container;
      if (scrollHeight - scrollTop - clientHeight > 50) {
        setIsAtBottom(false);
      } else {
        setIsAtBottom(true);
      }
    };
    container.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (scrollOnSend) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
      setScrollOnSend(false);
    }
  }, [messages, scrollOnSend]);

  useEffect(() => {
    if (isAtBottom) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      });
    }
  }, [messages, isAtBottom]);

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

  const sendMessage = useCallback(
    async (message, files = uploadedFiles) => {
      if (!message.trim() || uploadingFiles) {
        if (!message.trim()) {
          setToastMessage("내용을 입력해주세요.");
          setShowToast(true);
        }
        return;
      }

      if (canEditImage && files.length > maxImageInput) {
        setToastMessage(`이미지는 최대 ${maxImageInput}개까지 업로드할 수 있습니다.`);
        setShowToast(true);
        return;
      }

      const contentParts = [];
      contentParts.push({ type: "text", text: message });
      if (files.length > 0) {
        contentParts.push(...files);
      }

      const userMessage = { 
        role: "user", 
        content: contentParts,
        id: generateMessageId()
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputText("");
      setUploadedFiles([]);
      setIsLoading(true);
      requestAnimationFrame(() => {
        setScrollOnSend(true);
      });

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const selectedModel = imageModels.find(m => m.model_name === imageModel);
        if (!selectedModel) {
          throw new Error("선택한 모델이 유효하지 않습니다.");
        }

        const response = await fetch(
          `${process.env.REACT_APP_FASTAPI_URL}${selectedModel.endpoint}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: selectedModel.model_name,
              prompt: contentParts
            }),
            credentials: "include",
            signal: controller.signal,
          }
        );

        if (response.status === 401) {
          if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
            window.location.href = '/login?expired=true';
          }
          return;
        }

        const result = await response.json();
        if (result.content) {
          addAssistantMessage({
            type: "image",
            content: `${process.env.REACT_APP_FASTAPI_URL}${result.content}`,
            name: result.name
          });
        } else {
          setErrorMessage("이미지 생성에 실패했습니다.");
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setErrorMessage("요청 중 오류가 발생했습니다: " + err.message);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [imageModel, imageModels, canEditImage, maxImageInput, uploadedFiles, setUploadedFiles, uploadingFiles, addAssistantMessage, setErrorMessage]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const renderedMessages = useMemo(() => (
    messages.map((msg, idx) => (
      <Message
        key={msg.id}
        messageIndex={idx}
        role={msg.role}
        content={msg.content}
        isComplete={msg.isComplete}
        setScrollOnSend={setScrollOnSend}
        isTouch={isTouch}
        isLoading={isLoading}
        isLastMessage={idx === messages.length - 1}
      />
    ))
  ), [messages, isTouch, isLoading]);

  return (
    <div
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {messages.length === 0 ? (
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
      ) : (
        <div className="chat-messages" style={{ scrollbarGutter: "stable" }}>
          {renderedMessages}
          <div ref={messagesEndRef} />
        </div>
      )}

      <ImageInputContainer
        isTouch={isTouch}
        placeholder="프롬프트 입력"
        extraClassName={messages.length === 0 ? "main-input-container" : ""}
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

export default Image;


