import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from "react";
import { useParams, useLocation } from "react-router-dom";
import { IoImageOutline } from "react-icons/io5";
import { LuArrowDown } from "react-icons/lu";
import { PulseLoader } from "react-spinners";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { useFileUpload } from "../utils/useFileUpload";
import InputContainer from "../components/InputContainer";
import Message from "../components/Message";
import Modal from "../components/Modal";
import { useToast } from "../contexts/ToastContext";
import StatusBlock from "../components/StatusBlock";
import "../styles/Common.css";

function ImageChat({ isTouch, chatMessageRef }) {
  const { conversation_id } = useParams();
  const location = useLocation();
  const {
    imageModel,
    imageModels,
    maxImageInput,
    canVisionImage,
    updateImageModel,
    switchImageMode,
    setAlias,
    setHasImage
  } = useContext(SettingsContext);

  const { updateAlias, updateTimestamp } = useContext(ConversationsContext);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editBackup, setEditBackup] = useState(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isButtonReady, setIsButtonReady] = useState(false);
  const [deleteIndex, setdeleteIndex] = useState(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [isRemoteStreaming, setIsRemoteStreaming] = useState(false);

  const { showToast } = useToast();

  const {
    uploadedFiles,
    setUploadedFiles,
    processFiles,
    removeFile
  } = useFileUpload([], null, "image");

  const abortControllerRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const uploadingFiles = uploadedFiles.some((file) => !file.content);
  const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  useEffect(() => {
    const hasUploadedImages = uploadedFiles.length > 0;
    switchImageMode(hasUploadedImages);
    setHasImage(hasUploadedImages);
  }, [uploadedFiles, switchImageMode, setHasImage]);

  const addAssistantMessage = useCallback((content) => {
    const newMessage = { 
      role: "assistant", 
      content,
      id: generateMessageId()
    };
    setMessages((prev) => [...prev, newMessage]);
  }, []);

  const applyData = useCallback((data) => {
    updateImageModel(data.model);
    setAlias(data.alias);

    const initialMessages = data.conversation.map((m) => {
      const messageWithId = m.id ? m : { ...m, id: generateMessageId() };
      return messageWithId;
    });
    setMessages(initialMessages);
    setIsInitialized(true);
  }, [updateImageModel, setAlias]);

  const pollRemote = useCallback((initialData = null) => {
    if (initialData) applyData(initialData);
    clearInterval(pollIntervalRef.current);
    setIsRemoteStreaming(true);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const pollRes = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/image/conversation/${conversation_id}`, {
          credentials: "include"
        });
        if (!pollRes.ok) {
          clearInterval(pollIntervalRef.current);
          setIsRemoteStreaming(false);
          return;
        }
        const pollData = await pollRes.json();
        if (!pollData.is_streaming) {
          clearInterval(pollIntervalRef.current);
          setIsRemoteStreaming(false);
          applyData(pollData);
        }
      } catch {
        clearInterval(pollIntervalRef.current);
        setIsRemoteStreaming(false);
      }
    }, 2000);
  }, [conversation_id, applyData]);

  const showSendError = useCallback((shouldPoll = false) => {
    showToast("메세지 전송 중 오류가 발생했습니다.");
    if (shouldPoll) pollRemote();
  }, [pollRemote, showToast]);

  const showDeleteError = useCallback((shouldPoll = false) => {
    showToast("메세지 삭제 중 오류가 발생했습니다.");
    if (shouldPoll) pollRemote();
  }, [pollRemote, showToast]);

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
                updateAlias(conversation_id, aliasData.alias, false);
              }
            } catch (err) {
              updateAlias(conversation_id, "새 대화", false);
            }
          })();
        } 
        
        else {
          const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/image/conversation/${conversation_id}`, {
            credentials: "include"
          });
          if (!res.ok) {
            showToast("초기화 중 오류가 발생했습니다.");
            return;
          }
          const data = await res.json();

          if (data.is_streaming) {
            pollRemote(data);
          } else {
            applyData(data);
          }
        }
      } catch (err) {
        showToast("초기화 중 오류가 발생했습니다.");
      } finally {
        if (!isInitialized) setIsInitialized(true);
      }
    };

    initializeChat();
    return () => clearInterval(pollIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation_id, location.state]);

  useEffect(() => {
    const container = chatMessageRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
    };
    container.addEventListener('scroll', handleScroll);
    const t = setTimeout(() => setIsButtonReady(true), 600);
    return () => { container.removeEventListener('scroll', handleScroll); clearTimeout(t); };
  // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (isInitialized) chatMessageRef.current.scrollTop = chatMessageRef.current.scrollHeight;
  }, [chatMessageRef, isInitialized]);
  
  useEffect(() => {
    if (scrollTrigger !== 0) chatMessageRef.current.scrollTo({ top: chatMessageRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessageRef, scrollTrigger]);

  useEffect(() => {
    if (!isRemoteStreaming) return;
    requestAnimationFrame(() => {
      chatMessageRef.current?.scrollTo({
        top: chatMessageRef.current.scrollHeight,
        behavior: "smooth"
      });
    });
  }, [chatMessageRef, isRemoteStreaming]);

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

      const imageFiles = files.filter((file) => file.type && file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        showToast("이미지만 업로드할 수 있습니다.");
        return;
      }
      await processFiles(imageFiles);
    },
    [processFiles, showToast]
  );

  const sendMessage = useCallback(
    async (message, files = uploadedFiles) => {
      if (!message.trim() || uploadingFiles) {
        if (!message.trim()) {
          showToast("내용을 입력해주세요.");
        }
        return;
      }

      if (canVisionImage && files.length > maxImageInput) {
        showToast(`이미지는 최대 ${maxImageInput}개까지 업로드할 수 있습니다.`);
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
      uploadedFiles.forEach((file) => { if (file.preview) URL.revokeObjectURL(file.preview); });
      setUploadedFiles([]);
      setIsLoading(true);
      setTimeout(() => {
        setScrollTrigger((v) => v + 1);
      }, 1100);

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
              message: contentParts
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
        else if (response.status === 409) {
          setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id));
          setInputText(message);
          showSendError(true);
          return;
        }
        else if (!response.ok) {
          showToast("이미지 생성에 실패했습니다: " + result.detail);
          return;
        }

        if (result.content) {
          addAssistantMessage({
            type: "image",
            content: result.content,
            name: result.name
          });
          
          updateTimestamp(conversation_id, new Date().toISOString());
        } else {
          showToast("이미지 생성에 실패했습니다.");
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        showToast("메세지 전송 중 오류가 발생했습니다: " + err.message);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [
      conversation_id,
      imageModel,
      imageModels,
      updateTimestamp,
      canVisionImage,
      maxImageInput,
      uploadedFiles,
      setUploadedFiles,
      uploadingFiles,
      addAssistantMessage,
      showSendError,
      showToast
    ]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const deleteMessages = useCallback(
    async (startIndex) => {
      let savedMessages;
      setMessages((prevMessages) => {
        savedMessages = prevMessages;
        return prevMessages.slice(0, startIndex);
      });

      try {
        const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}/${startIndex}`, {
          method: "DELETE",
          credentials: "include"
        });
        if (res.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          window.location.href = '/login?expired=true';
        }
        if (!res.ok) {
          const error = new Error('메세지 삭제에 실패했습니다.');
          error.status = res.status;
          throw error;
        }
      } catch (err) {
        setMessages(savedMessages);
        throw err;
      }
    },
    [conversation_id]
  );

  const startEdit = useCallback(
    (idx) => {
      if (isLoading || isRemoteStreaming) {
        showToast("응답 생성 중에는 편집할 수 없습니다.");
        return;
      }
      const target = messages[idx];
      if (!target) return;

      // 편집 대상 메시지의 텍스트와 첨부를 입력창으로 이동
      const text = target.content.find((item) => item.type === "text")?.text || "";
      const files = target.content
        .filter((item) => item.type === "image" || item.type === "file")
        .map((item) => ({ ...item, preview: undefined, id: generateMessageId() }));

      // 이후 메시지를 프론트엔드에서만 잘라내고 복원용으로 백업
      setEditBackup(messages);
      setMessages(messages.slice(0, idx));
      setUploadedFiles(files);
      setInputText(text);
      setEditingIndex(idx);
      setTimeout(() => {
        setScrollTrigger((v) => v + 1);
      }, 0);
    },
    [messages, isLoading, isRemoteStreaming, setUploadedFiles, showToast]
  );

  const cancelEdit = useCallback(() => {
    if (editBackup) setMessages(editBackup);
    uploadedFiles.forEach((file) => { if (file.preview) URL.revokeObjectURL(file.preview); });
    setUploadedFiles([]);
    setInputText("");
    setEditBackup(null);
    setEditingIndex(null);
  }, [editBackup, uploadedFiles, setUploadedFiles]);

  const handleSend = useCallback(
    async (message) => {
      if (editingIndex !== null) {
        try {
          await deleteMessages(editingIndex);
        } catch (err) {
          if (err.status === 400 || err.status === 409) {
            showSendError(true);
          } else {
            showSendError();
          }
          return;
        }
        setEditBackup(null);
        setEditingIndex(null);
      }
      sendMessage(message);
    },
    [editingIndex, deleteMessages, sendMessage, showSendError]
  );

  const handleDelete = useCallback((idx) => {
    if (isLoading || isRemoteStreaming) {
      showToast("응답 생성 중에는 삭제할 수 없습니다.");
      return;
    }
    setdeleteIndex(idx);
    setConfirmModal(true);
  }, [isLoading, isRemoteStreaming, showToast]);

  return (
    <div
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!isInitialized && (
        <motion.div
          className="page-loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <PulseLoader loading={true} size={20} />
        </motion.div>
      )}

      <div className="chat-messages-wrapper">
        <div className="chat-messages" ref={chatMessageRef} style={{ scrollbarGutter: "stable" }}>
          {useMemo(() =>
            messages.map((msg, idx) => (
              <Message
                key={msg.id}
                messageIndex={idx}
                role={msg.role}
                content={msg.content}
                onDelete={handleDelete}
                onEdit={startEdit}
                disableActions={editingIndex !== null}
                setScrollTrigger={setScrollTrigger}
                isTouch={isTouch}
                isLoading={isLoading}
                isLastMessage={idx === messages.length - 1}
                shouldRender={idx >= messages.length - 6}
              />
            )), [messages, handleDelete, startEdit, editingIndex, isTouch, isLoading]
          )}

          <AnimatePresence>
            {confirmModal && (
              <Modal
                message="정말 메세지를 삭제하시겠습니까?"
                onConfirm={async () => {
                  if (isLoading || isRemoteStreaming) {
                    showToast("응답 생성 중에는 삭제할 수 없습니다.");
                    setdeleteIndex(null);
                    setConfirmModal(false);
                    return;
                  }
                  try {
                    await deleteMessages(deleteIndex);
                  } catch (err) {
                    if (err.status === 400 || err.status === 409) {
                      showDeleteError(true);
                    } else {
                      showDeleteError();
                    }
                  }
                  setdeleteIndex(null);
                  setConfirmModal(false);
                }}
                onCancel={() => {
                  setdeleteIndex(null);
                  setConfirmModal(false);
                }}
              />
            )}
          </AnimatePresence>

          {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
            <StatusBlock type="image-generating" />
          )}

          {isRemoteStreaming && (
            <StatusBlock type="remote-streaming" />
          )}

        </div>
        <button
          className={`scroll-to-bottom-btn ${!isAtBottom && isButtonReady ? 'visible' : ''}`}
          onClick={() => chatMessageRef.current.scrollTo({ top: chatMessageRef.current.scrollHeight, behavior: 'smooth' })}
        >
          <LuArrowDown />
        </button>
      </div>

      <InputContainer
        isTouch={isTouch}
        placeholder="프롬프트 입력"
        inputText={inputText}
        setInputText={setInputText}
        isLoading={isLoading}
        isRemoteStreaming={isRemoteStreaming}
        onSend={handleSend}
        onCancel={cancelRequest}
        isEditing={editingIndex !== null}
        onCancelEdit={cancelEdit}
        uploadedFiles={uploadedFiles}
        processFiles={processFiles}
        removeFile={removeFile}
        uploadingFiles={uploadingFiles}
        imageOnly={true}
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
    </div>
  );
}

export default React.memo(ImageChat);
