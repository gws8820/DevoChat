import React, { useState, useEffect, useCallback, useRef, useContext, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { IoImageOutline, IoAttach } from "react-icons/io5";
import { LuArrowDown } from "react-icons/lu";
import { PulseLoader } from "react-spinners";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUpload } from "../utils/useFileUpload";
import Message from "../components/Message";
import Modal from "../components/Modal";
import { useToast } from "../contexts/ToastContext";
import InputContainer from "../components/InputContainer";
import StatusBlock from "../components/StatusBlock";
import "../styles/Common.css";

function Chat({ isTouch, chatMessageRef, userInfo }) {
  const { conversation_id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [deleteIndex, setdeleteIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editBackup, setEditBackup] = useState(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [activeTurn, setActiveTurn] = useState(false);
  const [isRemoteStreaming, setIsRemoteStreaming] = useState(false);

  const { showToast } = useToast();

  const {
    uploadedFiles,
    setUploadedFiles,
    processFiles,
    removeFile
  } = useFileUpload([], userInfo, "chat");

  const abortControllerRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const scrollFixRef = useRef(null);

  const {
    models,
    model,
    reason,
    verbosity,
    memory,
    instructions,
    isReasoning,
    isSearch,
    isResearch,
    isDAN,
    mcpList,
    canVision,
    canControlReason,
    canControlVerbosity,
    canControlSystemMessage,
    updateModel,
    setAlias,
    setReason,
    setVerbosity,
    setMemory,
    setInstructions,
    setIsDAN,
    setHasImage,
    setMCPList
  } = useContext(SettingsContext);

  const {
    fetchConversations,
    updateAlias,
    updateTimestamp
  } = useContext(ConversationsContext);

  const uploadingFiles = uploadedFiles.some((file) => !file.content);

  const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const updateAssistantMessage = useCallback((message, isComplete = false) => {
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        return prev.map((msg, i) =>
          i === prev.length - 1 ? { ...msg, content: message, isComplete } : msg
        );
      } else {
        const newMessage = { 
          role: "assistant", 
          content: message, 
          isComplete,
          id: generateMessageId()
        };
        return [...prev, newMessage];
      }
    });
  }, []);

  const applyData = useCallback((data) => {
    updateModel(data.model, {
      isReasoning: data.reasoning,
      isSearch: data.web_search,
      isResearch: data.research
    });
    setAlias(data.alias);
    setInstructions(data.instructions);
    setIsDAN(data.dan);
    setMCPList(data.mcp ?? []);
    setReason(data.reason);
    setVerbosity(data.verbosity);
    setMemory(data.memory);
    const initialMessages = data.conversation.map((m) => {
      const messageWithId = m.id ? m : { ...m, id: generateMessageId() };
      return m.role === "assistant" ? { ...messageWithId, isComplete: true } : messageWithId;
    });
    setMessages(initialMessages);
    setIsInitialized(true);
  }, [
    updateModel,
    setAlias,
    setInstructions,
    setIsDAN,
    setMCPList,
    setReason,
    setVerbosity,
    setMemory
  ]);

  const pollRemote = useCallback((initialData = null) => {
    if (initialData) applyData(initialData);
    clearInterval(pollIntervalRef.current);
    setIsRemoteStreaming(true);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const pollRes = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/chat/conversation/${conversation_id}`, {
          credentials: 'include'
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

  const deleteMessages = useCallback(
    async (startIndex) => {
      setActiveTurn(false);
      let savedMessages;
      setMessages((prevMessages) => {
        savedMessages = prevMessages;
        return prevMessages.slice(0, startIndex);
      });

      try {
        const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}/${startIndex}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        if (res.status === 401) {
          if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
            window.location.href = '/login?expired=true';
          }
        }
        if (!res.ok) {
          const error = new Error('delete failed');
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

  const scrollToEnd = useCallback((behavior = "smooth") => {
    const container = chatMessageRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, [chatMessageRef]);

  const scrollToEndSettled = useCallback(() => {
    const container = chatMessageRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight });
    requestAnimationFrame(() => container.scrollTo({ top: container.scrollHeight }));
  }, [chatMessageRef]);

  const scrollLastUserToTop = useCallback((behavior = "smooth") => {
    const container = chatMessageRef.current;
    const userWraps = container?.querySelectorAll(".user-wrap");
    const lastUserWrap = userWraps?.[userWraps.length - 1];
    if (!container || !lastUserWrap) return;

    const top = lastUserWrap.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top, behavior });
  }, [chatMessageRef]);

  const checkIsAtBottom = useCallback(() => {
    const container = chatMessageRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsAtBottom(distance <= 50);
  }, [chatMessageRef]);

  useEffect(() => {
    const fix = scrollFixRef.current;
    if (!fix) return;
    scrollFixRef.current = null;
    if (fix === "top") scrollLastUserToTop();
    else scrollToEndSettled();
  }, [messages, scrollLastUserToTop, scrollToEndSettled]);

  const sendMessage = useCallback(
    async (message, files = uploadedFiles) => {
      if (!message.trim()) {
        showToast("내용을 입력해주세요.");
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
      setActiveTurn(true);
      scrollFixRef.current = "top";

      const controller = new AbortController();
      abortControllerRef.current = controller;
  
      try {
        const selectedModel = models.find((m) => m.model_name === model);
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
              reasoning: isReasoning,
              web_search: isSearch,
              research: isResearch,
              dan: isDAN,
              mcp: mcpList,
              stream: selectedModel.capabilities.stream,
              control: {
                reason: canControlReason,
                verbosity: canControlVerbosity,
                instructions: canControlSystemMessage,
              },
              reason: reason,
              verbosity: verbosity,
              memory: memory,
              instructions,
              message: contentParts,
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
        if (response.status === 409) {
          setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id));
          setInputText(message);
          showSendError(true);
          return;
        }
        if (!response.ok) {
          let detail = null;
          try { detail = (await response.json())?.detail; } catch {}
          showToast("메세지 전송 중 오류가 발생했습니다: " + (detail || response.status));
          return;
        }

        updateTimestamp(conversation_id, new Date().toISOString());
  
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let partialData = "";
        let assistantText = "";
  
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          partialData += chunk;
  
          const lines = partialData.split("\n\n");
          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            if (line.startsWith("data: ")) {
              const jsonData = line.replace("data: ", "");
              try {
                const data = JSON.parse(jsonData);
                if (data.error) {
                  showToast(data.error);
                  reader.cancel();
                  return;
                } else if (data.content) {
                  assistantText += data.content;
                  updateAssistantMessage(assistantText, false);
                }
              } catch (err) {
                showToast("스트리밍 중 오류가 발생했습니다: " + err.message);
                reader.cancel();
                return;
              }
            }
          }
          partialData = lines[lines.length - 1];
        }
        
        updateAssistantMessage(assistantText, true);
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
      model,
      models,
      reason,
      verbosity,
      memory,
      instructions,
      updateAssistantMessage,
      updateTimestamp,
      isReasoning,
      isSearch,
      isResearch,
      isDAN,
      mcpList,
      uploadedFiles,
      setUploadedFiles,
      canControlReason,
      canControlVerbosity,
      canControlSystemMessage,
      showSendError,
      showToast
    ]
  );

  const resendMesage = useCallback(
    async (messageContent, deleteIndex = null) => {
      if (isLoading || isRemoteStreaming) {
        showToast("응답 생성 중에는 재생성할 수 없습니다.");
        return;
      }

      setIsLoading(true);
      if (deleteIndex !== null) {
        try {
          await deleteMessages(deleteIndex);
        } catch (err) {
          if (err.status === 400 || err.status === 409) {
            showSendError(true);
          } else {
            showSendError();
          }
          setIsLoading(false);
          return;
        }
      }

      const textContent = messageContent.find(item => item.type === "text")?.text || "";
      const nonTextContent = messageContent.filter(item => item.type !== "text" && item.type !== "url");
      sendMessage(textContent, nonTextContent);
    },
    [
      deleteMessages,
      sendMessage,
      showSendError,
      isLoading,
      isRemoteStreaming,
      showToast
    ]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startEdit = useCallback(
    (idx) => {
      if (isLoading || isRemoteStreaming) {
        showToast("응답 생성 중에는 편집할 수 없습니다.");
        return;
      }
      const target = messages[idx];
      if (!target) return;

      const text = target.content.find((item) => item.type === "text")?.text || "";
      const files = target.content
        .filter((item) => item.type === "image" || item.type === "file")
        .map((item) => ({ ...item, preview: undefined, id: generateMessageId() }));

      setEditBackup(messages);
      setMessages(messages.slice(0, idx));
      setUploadedFiles(files);
      setInputText(text);
      setEditingIndex(idx);
      setActiveTurn(false);
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

  const handleRegenerate = useCallback(
    (startIndex) => {
      const previousMessage = messages[startIndex - 1];
      if (!previousMessage) return;

      resendMesage(previousMessage.content, startIndex - 1);
    },
    [messages, resendMesage]
  );

  const handleDelete = useCallback((idx) => {
    if (isLoading || isRemoteStreaming) {
      showToast("응답 생성 중에는 삭제할 수 없습니다.");
      return;
    }
    setdeleteIndex(idx);
    setConfirmModal(true);
  }, [isLoading, isRemoteStreaming, showToast]);

  useEffect(() => {
    const initializeChat = async () => {
      try {
        if (location.state?.initialMessage && messages.length === 0) {
          setIsInitialized(true);
          const initialMessage = location.state.initialMessage;
          const initialFiles = location.state.initialFiles;
          
          window.history.replaceState({}, '', location.pathname);

          if (initialFiles && initialFiles.length > 0) {
            sendMessage(initialMessage, initialFiles);
          } else {
            sendMessage(initialMessage);
          }
          
          (async () => {
            try {
              const aliasResponse = await fetch(
                `${process.env.REACT_APP_FASTAPI_URL}/chat/get_alias`,
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
          setActiveTurn(false);
          const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/chat/conversation/${conversation_id}`, {
            credentials: 'include'
          });
          if (!res.ok) {
            if (res.status === 404) {
              fetchConversations();
              navigate("/", { state: { errorModal: "대화를 찾을 수 없습니다." } });
            } else {
              fetchConversations();
              navigate("/", { state: { errorModal: "대화를 불러오는 중 오류가 발생했습니다." } });
            }
            return;
          }
          const data = await res.json();

          if (data.is_streaming) {
            pollRemote(data);
          } else {
            scrollFixRef.current = "bottom";
            applyData(data);
          }
        }
      } catch (err) {
        if (err.response && err.response.status === 404) {
          fetchConversations();
          navigate("/", { state: { errorModal: "대화를 찾을 수 없습니다." } });
        } else {
          fetchConversations();
          navigate("/", { state: { errorModal: "대화를 불러오는 중 오류가 발생했습니다." } });
        }
      } finally {
        if (!isInitialized) setIsInitialized(true);
      }
    };

    initializeChat();
    return () => clearInterval(pollIntervalRef.current);
    // eslint-disable-next-line
  }, [conversation_id, location.state]);

  useEffect(() => {
    const recentMessages = memory > 0 ? messages.slice(-memory) : [];
    const hasImageHistory = recentMessages.some((msg) =>
      Array.isArray(msg.content) && msg.content.some((item) => item.type === "image")
    );

    const hasUploadedImage = uploadedFiles.some((file) => {
      return (file.type && (file.type === "image" || file.type.startsWith("image/"))) ||
        /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name);
    });

    setHasImage(hasImageHistory || hasUploadedImage);
  }, [messages, memory, setHasImage, uploadedFiles]);

  useEffect(() => {
    if (!isRemoteStreaming) return;
    scrollToEnd("auto");
  }, [isRemoteStreaming, scrollToEnd]);

  useEffect(() => {
    const container = chatMessageRef.current;
    if (!container) return;
    container.addEventListener('scroll', checkIsAtBottom);
    return () => { container.removeEventListener('scroll', checkIsAtBottom); };
  }, [chatMessageRef, checkIsAtBottom]);

  useEffect(() => {
    checkIsAtBottom();
  }, [messages.length, checkIsAtBottom]);

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
      await processFiles(files);
    },
    [processFiles]
  );

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
        {useMemo(() => {
          const turns = [];
          messages.forEach((msg, idx) => {
            if (msg.role === "user" || turns.length === 0) {
              turns.push([{ msg, idx }]);
            } else {
              turns[turns.length - 1].push({ msg, idx });
            }
          });
          return turns.map((turn, turnIdx) => (
            <div
              key={turn[0].msg.id}
              className={`chat-turn ${activeTurn && turnIdx === turns.length - 1 ? 'active' : ''}`}
            >
              {turn.map(({ msg, idx }) => (
                <Message
                  key={msg.id}
                  messageIndex={idx}
                  role={msg.role}
                  content={msg.content}
                  isComplete={msg.isComplete}
                  onDelete={handleDelete}
                  onRegenerate={handleRegenerate}
                  onEdit={startEdit}
                  disableActions={editingIndex !== null}
                  isTouch={isTouch}
                  isLoading={isLoading}
                  isLastMessage={idx === messages.length - 1}
                  shouldRender={idx >= messages.length - 6}
                />
              ))}
              {isLoading && turnIdx === turns.length - 1 && messages[messages.length - 1]?.role === "user" && (
                <div className="assistant-wrap">
                  <StatusBlock type="waiting" init />
                </div>
              )}
            </div>
          ));
        }, [messages, handleDelete, handleRegenerate, startEdit, editingIndex, isTouch, isLoading, activeTurn])}

        {isRemoteStreaming && (
          <StatusBlock type="remote-streaming" />
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

      </div>
      <button
        className={`scroll-to-bottom-btn ${!isAtBottom ? 'visible' : ''}`}
        onClick={() => scrollToEnd()}
      >
        <LuArrowDown />
      </button>
      </div>

      <InputContainer
        isTouch={isTouch}
        placeholder="답장 입력"
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
              {canVision ? (
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
    </div>
  );
}

export default React.memo(Chat);
