import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from "react";
import { useParams, useLocation } from "react-router-dom";
import { IoImageOutline } from "react-icons/io5";
import { motion, AnimatePresence } from "framer-motion";
import { ClipLoader } from "react-spinners";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { useFileUpload } from "../utils/useFileUpload";
import ImageInputContainer from "../components/ImageInputContainer";
import Message from "../components/Message";
import Toast from "../components/Toast";
import axios from "../utils/axiosConfig";
import "../styles/Common.css";

function Image({ isTouch, chatMessageRef }) {
  const { conversation_id } = useParams();
  const location = useLocation();
  const {
    imageModel, 
    imageModels, 
    maxImageInput,
    canEditImage,
    defaultImageModel,
    updateImageModel,
    switchImageMode,
    setAlias
  } = useContext(SettingsContext);

  const { updateConversation } = useContext(ConversationsContext);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
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
    const initializeChat = async () => {
      try {
        if (location.state?.initialMessage) {
          setIsInitialized(true);
          const initialMessage = location.state.initialMessage;
          const initialFiles = location.state.initialFiles;

          window.history.replaceState({}, "", location.pathname);

          if (initialFiles && initialFiles.length > 0) {
            sendMessage(initialMessage, initialFiles);
          } else {
            sendMessage(initialMessage);
          }

          (async () => {
            try {
              const aliasResponse = await fetch(
                `${process.env.REACT_APP_FASTAPI_URL}/image/get_alias`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ 
                    conversation_id: conversation_id,
                    text: initialMessage
                  }),
                  credentials: "include"
                }
              );

              if (aliasResponse.status === 401) {
                if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
                  window.location.href = '/login?expired=true';
                }
                return;
              }
              const aliasData = await aliasResponse.json();
              if (aliasData && aliasData.alias) {
                setAlias(aliasData.alias);
                updateConversation(conversation_id, aliasData.alias, false);
              }
            } catch (err) {
              updateConversation(conversation_id, "새 대화", false);
            }
          })();
        } 
        
        else {
          const res = await axios.get(
            `${process.env.REACT_APP_FASTAPI_URL}/image/conversation/${conversation_id}`,
            { withCredentials: true }
          );

          updateImageModel(res.data.model);
          setAlias(res.data.alias);

          const initialMessages = (res.data.messages).map((m) => {
            const messageWithId = m.id ? m : { ...m, id: generateMessageId() };
            return messageWithId;
          });
          setMessages(initialMessages);
          setIsInitialized(true);
        }
      } catch (err) {
        setErrorMessage("초기화 중 오류가 발생했습니다.");
      } finally {
        if (!isInitialized) setIsInitialized(true);
      }
    };

    initializeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation_id, location.state]);

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
              conversation_id,
              model: selectedModel.model_name,
              prompt: contentParts
            }),
            credentials: "include",
            signal: controller.signal,
          }
        );

        const result = await response.json();

        if (response.status === 401) {
          if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
            window.location.href = '/login?expired=true';
          }
          return;
        }
        else if (!response.ok) {
          setErrorMessage("이미지 생성에 실패했습니다.");
          return;
        }
        
        if (result.content) {
          addAssistantMessage({
            type: "image",
            content: result.content,
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
    [
      conversation_id,
      imageModel,
      imageModels,
      canEditImage,
      maxImageInput,
      uploadedFiles,
      setUploadedFiles,
      uploadingFiles,
      addAssistantMessage,
      setErrorMessage
    ]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return (
    <div
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!isInitialized && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100dvh",
            marginBottom: "30px",
          }}
        >
          <ClipLoader loading={true} size={50} />
        </motion.div>
      )}

      <div className="chat-messages" ref={chatMessageRef} style={{ scrollbarGutter: "stable" }}>
        {useMemo(() => 
          messages.map((msg, idx) => (
            <Message
              key={msg.id}
              messageIndex={idx}
              role={msg.role}
              content={msg.content}
              setScrollOnSend={setScrollOnSend}
              isTouch={isTouch}
              isLoading={isLoading}
              isLastMessage={idx === messages.length - 1}
            />
          )), [messages, isTouch, isLoading]
        )}

        {isLoading && (
          <motion.div
            className="chat-message loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1, ease: "easeOut" }}
          >
            이미지 생성 중...
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

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


