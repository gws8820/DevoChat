import React, { useState, useEffect, useCallback, useRef, useContext, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { IoImageOutline, IoAttach } from "react-icons/io5";
import { LuArrowDown } from "react-icons/lu";
import { PulseLoader } from "react-spinners";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { motion, AnimatePresence } from "framer-motion";
import { parse as parseTld } from "tldts";
import { useFileUpload } from "../utils/useFileUpload";
import Message from "../components/Message";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import InputContainer from "../components/InputContainer";
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
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [userFixedScroll, setUserFixedScroll] = useState(false);
  const [deleteIndex, setdeleteIndex] = useState(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isButtonReady, setIsButtonReady] = useState(false);
  const [isRemoteStreaming, setIsRemoteStreaming] = useState(false);
  
  const { 
    uploadedFiles, 
    setUploadedFiles,
    processFiles, 
    removeFile
  } = useFileUpload([], userInfo);

  const abortControllerRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const touchStartYRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const {
    models,
    model,
    temperature,
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
    canControlTemp,
    canControlReason,
    canControlVerbosity,
    canControlSystemMessage,
    updateModel,
    setAlias,
    setTemperature,
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

  const setErrorMessage = useCallback((message) => {
    const errorMessage = { 
      role: "error", 
      content: message,
      id: generateMessageId()
    };
    setMessages((prev) => [...prev, errorMessage]);
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
    setTemperature(data.temperature);
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
    setTemperature,
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
    setToastMessage("메세지 전송 중 오류가 발생했습니다.");
    setShowToast(true);
    if (shouldPoll) pollRemote();
  }, [pollRemote]);

  const showDeleteError = useCallback((shouldPoll = false) => {
    setToastMessage("메세지 삭제 중 오류가 발생했습니다.");
    setShowToast(true);
    if (shouldPoll) pollRemote();
  }, [pollRemote]);

  const deleteMessages = useCallback(
    async (startIndex) => {
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

  const sendMessage = useCallback(
    async (message, files = uploadedFiles) => {
      if (!message.trim()) {
        setToastMessage("내용을 입력해주세요.");
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
      uploadedFiles.forEach((file) => { if (file.preview) URL.revokeObjectURL(file.preview); });
      setUploadedFiles([]);
      setIsLoading(true);
      setTimeout(() => {
        setScrollTrigger((v) => v + 1);
      }, 0);

      const extractUrls = (message) => {
        const urlPattern =
          /(?:https?:\/\/|www\.)[^\s<>()]+|(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(?::\d{1,5})?(?:\/[^\s<>()]*)?/gi;
        
        const cleanUrl = (url) => {
          if (!url) return url;
          
          const allowedEnd = /[A-Za-z0-9._~:%+&=;,@!?*#\-/]$/;
          while (url && !allowedEnd.test(url)) {
            if (url.length > 1 && url[url.length - 2] === '/') break;
            url = url.slice(0, -1);
          }
          return url;
        };

        const isValidDomainByPSL = (host) => {
          const r = parseTld(host);
          if (!r) return false;
          if (r.isIp === true) return false;
          return Boolean(r.domain && r.publicSuffix);
        };

        const normalizeAndValidate = (raw) => {
          if (!raw) return null;
          if (raw.includes("@")) return null;

          const tryValidate = (candidate) => {
            try {
              const withScheme =
                candidate.startsWith("http://") || candidate.startsWith("https://")
                  ? candidate
                  : "https://" + candidate;
              const u = new URL(withScheme);
              return isValidDomainByPSL(u.hostname);
            } catch {
              return false;
            }
          };

          let candidate = cleanUrl(raw);
          if (!candidate) return null;
          if (tryValidate(candidate)) return candidate;

          const maxTrim = Math.min(30, candidate.length);
          for (let i = 1; i <= maxTrim; i++) {
            const trimmed = candidate.slice(0, -i);
            if (trimmed.length < 4) break;
            if (tryValidate(trimmed)) return trimmed;
          }

          return null;
        };
        
        const matches = message.match(urlPattern) || [];
        const urls = matches
          .map((match) => normalizeAndValidate(match))
          .filter((url) => url && url.length > 3);
        
        return [...new Set(urls)];
      };

      const detectedUrls = extractUrls(message);
      
      if (detectedUrls.length > 0) {
        const previewPromises = detectedUrls.map(async (token) => {
          let url = token;
          if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
          }
          try {
            const res = await fetch(
              `${process.env.REACT_APP_FASTAPI_URL}/visit_url`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
              }
            );
            
            if (res.status === 401) {
              if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
                window.location.href = '/login?expired=true';
              }
              return;
            }
            if (res.status === 413) {
              setToastMessage("크기 제한을 초과하여 URL 인식에 실패했습니다.");
              setShowToast(true);
              return;
            }
            if (res.ok) {
              const data = await res.json();
              if (data.content) {
                return { type: "url", content: data.content };
              }
            }
          } catch (err) {}
          return null;
        });
        
        const urlPreviews = await Promise.all(previewPromises);
        urlPreviews.forEach((preview) => {
          if (preview !== null) {
            contentParts.push(preview);
          }
        });
      }
  
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
                temperature: canControlTemp,
                reason: canControlReason,
                verbosity: canControlVerbosity,
                instructions: canControlSystemMessage,
              },
              temperature: temperature,
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
          setErrorMessage("메세지 전송 중 오류가 발생했습니다: " + (detail || response.status));
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
                  setErrorMessage(data.error);
                  reader.cancel();
                  return;
                } else if (data.content) {
                  assistantText += data.content;
                  updateAssistantMessage(assistantText, false);
                }
              } catch (err) {
                setErrorMessage("스트리밍 중 오류가 발생했습니다: " + err.message);
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
        setErrorMessage("메세지 전송 중 오류가 발생했습니다: " + err.message);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [
      conversation_id,
      model,
      models,
      temperature,
      reason,
      verbosity,
      memory,
      instructions,
      updateAssistantMessage,
      updateTimestamp,
      setErrorMessage,
      isReasoning,
      isSearch,
      isResearch,
      isDAN,
      mcpList,
      uploadedFiles,
      setUploadedFiles,
      canControlTemp,
      canControlReason,
      canControlVerbosity,
      canControlSystemMessage,
      showSendError
    ]
  );

  const resendMesage = useCallback(
    async (messageContent, deleteIndex = null) => {
      if (isLoading || isRemoteStreaming) {
        showSendError(isRemoteStreaming);
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
      const nonTextContent = messageContent.filter(item => item.type !== "text");
      sendMessage(textContent, nonTextContent);
    },
    [
      deleteMessages,
      sendMessage,
      showSendError,
      isLoading,
      isRemoteStreaming
    ]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const sendEditedMessage = useCallback(
    (idx, updatedContent) => {
      resendMesage(updatedContent, idx);
    },
    [resendMesage]
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
      showDeleteError(isRemoteStreaming);
      return;
    }
    setdeleteIndex(idx);
    setConfirmModal(true);
  }, [isLoading, isRemoteStreaming, showDeleteError]);

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
    const hasImageHistory = messages.slice(-8).some((msg) => 
      Array.isArray(msg.content) && msg.content.some((item) => item.type === "image")
    );

    const hasUploadedImage = uploadedFiles.some((file) => {
      return (file.type && (file.type === "image" || file.type.startsWith("image/"))) || 
        /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name);
    });
  
    setHasImage(hasImageHistory || hasUploadedImage);
  }, [messages, setHasImage, uploadedFiles]);

  useEffect(() => {
    if (isInitialized) {
      chatMessageRef.current.scrollTop = chatMessageRef.current.scrollHeight;
    }
  }, [chatMessageRef, isInitialized]);
  
  useEffect(() => {
    if (scrollTrigger !== 0) {
      chatMessageRef.current.scrollTo({ top: chatMessageRef.current.scrollHeight, behavior: "smooth" });
    }
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

  useEffect(() => {
    if (isLoading && !userFixedScroll) { // Only During Streaming
      chatMessageRef.current.scrollTo({ top: chatMessageRef.current.scrollHeight, behavior: "auto" });
    }
  }, [chatMessageRef, messages, isLoading, userFixedScroll]);

  // userFixedScroll Logic
  useEffect(() => {
    const el = chatMessageRef.current;
    lastScrollTopRef.current = el.scrollTop;

    const handleWheel = (e) => {
      if (!isLoading) return;
      if (e.deltaY < 0) {
        setUserFixedScroll(true);
      } else if (e.deltaY > 0) {
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom <= 100) {
          setUserFixedScroll(false);
        }
      }
    };

    const handleTouchStart = (e) => {
      if (!isLoading) return;
      if (e.touches && e.touches.length) {
        touchStartYRef.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e) => {
      if (!isLoading) return;
      if (!e.touches || !e.touches.length) return;
      const currentY = e.touches[0].clientY;
      const startY = touchStartYRef.current;
      if (startY == null) return;
      if (currentY > startY + 5) {
        setUserFixedScroll(true);
      } else if (currentY < startY - 5) {
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom <= 100) {
          setUserFixedScroll(false);
        }
      }
    };

    const handleScroll = () => {
      if (!isLoading) return;
      lastScrollTopRef.current = el.scrollTop;
    };

    el.addEventListener("wheel", handleWheel, { passive: true });
    el.addEventListener("scroll", handleScroll, { passive: true });
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("scroll", handleScroll);
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
    };
  }, [chatMessageRef, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      setUserFixedScroll(false);
    }
  }, [isLoading]);

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
    const container = chatMessageRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
  // eslint-disable-next-line
  }, [messages.length]);

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
      }, canVision);
    },
    [processFiles, canVision]
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
              isComplete={msg.isComplete}
              onDelete={handleDelete}
              onRegenerate={handleRegenerate}
              onSendEditedMessage={sendEditedMessage}
              setScrollTrigger={setScrollTrigger}
              isTouch={isTouch}
              isLoading={isLoading}
              isLastMessage={idx === messages.length - 1}
              shouldRender={idx >= messages.length - 6}
            />
          )), [messages, handleDelete, handleRegenerate, sendEditedMessage, isTouch, isLoading]
        )}

        {isRemoteStreaming && (
          <div className="remote-streaming-wrap">
            <span className="remote-streaming">다른 창에서 응답 중</span>
          </div>
        )}

        {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
          <div style={{ margin: "18px 14px 24px" }}>
            <motion.div
              className="chat-loading-circle"
              initial={{ scale: 1 }}
              animate={{
                scale: [1, 1.1, 1],
                transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
              }}
            />
          </div>
        )}

        <AnimatePresence>
          {confirmModal && (
            <Modal
              message="정말 메세지를 삭제하시겠습니까?"
              onConfirm={async () => {
                if (isLoading || isRemoteStreaming) {
                  showDeleteError(isRemoteStreaming);
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
                    setToastMessage("메세지 삭제 중 오류가 발생했습니다.");
                    setShowToast(true);
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
        className={`scroll-to-bottom-btn ${!isAtBottom && isButtonReady ? 'visible' : ''}`}
        onClick={() => chatMessageRef.current.scrollTo({ top: chatMessageRef.current.scrollHeight, behavior: 'smooth' })}
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
        isSendDisabled={isRemoteStreaming}
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
      
      <Toast
        type="error"
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  );
}

export default React.memo(Chat);
