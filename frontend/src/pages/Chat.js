import React, { useState, useEffect, useCallback, useRef, useContext, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { IoImageOutline } from "react-icons/io5";
import { ClipLoader } from "react-spinners";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUpload } from "../utils/useFileUpload";
import axios from "../utils/axiosConfig";
import Message from "../components/Message";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import InputContainer from "../components/InputContainer";
import "../styles/Common.css";

function Chat({ isTouch, chatMessageRef }) {
  const { conversation_id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [scrollOnSend, setScrollOnSend] = useState(false);
  const [deleteIndex, setdeleteIndex] = useState(null);
  const [confirmModal, setConfirmModal] = useState(false);
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

  const {
    models,
    model,
    temperature,
    reason,
    verbosity,
    systemMessage,
    isInference,
    isSearch,
    isDeepResearch,
    isDAN,
    mcpList,
    canReadImage,
    canControlTemp,
    canControlReason,
    canControlVerbosity,
    updateModel,
    setAlias,
    setTemperature,
    setReason,
    setVerbosity,
    setSystemMessage,
    setIsDAN,
    setHasImage,
    setMCPList,
  } = useContext(SettingsContext);

  const {
    fetchConversations,
    updateConversation
  } = useContext(ConversationsContext);

  const uploadingFiles = uploadedFiles.some((file) => !file.content);

  const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const updateAssistantMessage = useCallback((message, isComplete = false) => {
    setIsThinking(prev => prev ? false : prev);
    
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

  const deleteMessages = useCallback(
    async (startIndex) => {
      setMessages((prevMessages) => prevMessages.slice(0, startIndex));

      return axios
        .delete(
          `${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}/${startIndex}`,
          { withCredentials: true }
        )
        .catch((err) => {
          setToastMessage("메세지 삭제 중 오류가 발생했습니다.");
          setShowToast(true);
        });
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
      setUploadedFiles([]);
      setIsLoading(true);
      requestAnimationFrame(() => {
        setScrollOnSend(true);
      });
  
      const extractUrls = (message) => {
        const validTlds = [
          ".com", ".net", ".org", ".info", ".biz", ".xyz", ".tech", ".io", ".ai", ".gg", 
          ".tv", ".me", ".app", ".dev", ".shop", ".store", ".co", ".kr", ".us", ".uk", 
          ".eu", ".de", ".fr", ".jp", ".cn", ".au", ".ca", ".in", ".es", ".it", ".nl", 
          ".se", ".no", ".fi", ".pl", ".ch", ".be", ".at"
        ];
        
        const tldPattern = validTlds
          .sort((a, b) => b.length - a.length)
          .map(tld => tld.replace(/\./g, "\\."))
          .join("|");
        
        const urlPattern = new RegExp(
          `(?:https?:\\/\\/|http:\\/\\/|www\\.)?` +
          `[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?` +
          `(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*` +
          `(?:${tldPattern})` +
          `(?::\\d{1,5})?` +
          `(?:\\/[A-Za-z0-9._~\\-/%+&=:;,@!?'*]*)?` +
          `(?:\\?[A-Za-z0-9._~\\-/%&=+,:;@!?'*]*)?` +
          `(?:#[A-Za-z0-9._~\\-/%&=+,:;@!?'*]*)?`,
          "gi"
        );
        
        const cleanUrl = (url) => {
          if (!url) return url;
          
          const allowedEnd = /[A-Za-z0-9._~:%+&=;,@!?*#\-/]$/;
          while (url && !allowedEnd.test(url)) {
            if (url.length > 1 && url[url.length - 2] === '/') break;
            url = url.slice(0, -1);
          }
          return url;
        };
        
        const matches = message.match(urlPattern) || [];
        const urls = matches
          .filter(match => !match.includes('@'))
          .map(match => cleanUrl(match))
          .filter(url => url && url.length > 3);
        
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
        if (isInference) {
          setIsThinking(true);
          setScrollOnSend(true);
        }
  
        const response = await fetch(
          `${process.env.REACT_APP_FASTAPI_URL}${selectedModel.endpoint}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversation_id,
              model: selectedModel.model_name,
              in_billing: selectedModel.in_billing,
              out_billing: selectedModel.out_billing,
              temperature: canControlTemp ? temperature : 1,
              reason: canControlReason ? reason : 0,
              verbosity: canControlVerbosity ? verbosity : 0,
              system_message: systemMessage,
              user_message: contentParts,
              inference: isInference,
              search: isSearch,
              deep_research: isDeepResearch,
              dan: isDAN,
              mcp: mcpList,
              stream: selectedModel.capabilities.stream,
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
                  setErrorMessage("서버 오류가 발생했습니다: " + data.error);
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
        setErrorMessage("메시지 전송 중 오류가 발생했습니다: " + err.message);
      } finally {
        setIsThinking(prev => prev ? false : prev);
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
      systemMessage,
      updateAssistantMessage,
      setErrorMessage,
      isInference,
      isSearch,
      isDeepResearch,
      isDAN,
      mcpList,
      uploadedFiles,
      setUploadedFiles,
      canControlTemp,
      canControlReason,
      canControlVerbosity
    ]
  );

  const resendMesage = useCallback(
    async (messageContent, deleteIndex = null) => {
      setIsLoading(true);
      try {
        if (deleteIndex !== null) {
          await deleteMessages(deleteIndex);
        }
        
        const textContent = messageContent.find(item => item.type === "text")?.text || "";
        const nonTextContent = messageContent.filter(item => item.type !== "text");
        
        sendMessage(textContent, nonTextContent);
      } catch (err) {
        setToastMessage("메세지 처리 중 오류가 발생했습니다.");
        setShowToast(true);
      }
    },
    [deleteMessages, sendMessage]
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
    setdeleteIndex(idx);
    setConfirmModal(true);
  }, []);

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
                updateConversation(conversation_id, aliasData.alias, false);
              }
            } catch (err) {
              updateConversation(conversation_id, "새 대화", false);
            }
          })();
        }
        
        else {
          const res = await axios.get(
            `${process.env.REACT_APP_FASTAPI_URL}/chat/conversation/${conversation_id}`,
            { withCredentials: true }
          );
          
          updateModel(res.data.model, {
            isInference: res.data.inference,
            isSearch: res.data.search,
            isDeepResearch: res.data.deep_research
          });

          setAlias(res.data.alias);
          setTemperature(res.data.temperature);
          setReason(res.data.reason);
          setVerbosity(res.data.verbosity);
          setSystemMessage(res.data.system_message);
          setIsDAN(res.data.dan);
          setMCPList(res.data.mcp);

          const initialMessages = res.data.messages.map((m) => {
            const messageWithId = m.id ? m : { ...m, id: generateMessageId() };
            return m.role === "assistant" ? { ...messageWithId, isComplete: true } : messageWithId;
          });
          
          setMessages(initialMessages);
          setIsInitialized(true);
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
    // eslint-disable-next-line
  }, [conversation_id, location.state]);

  useEffect(() => {
    const hasImageHistory = messages.slice(-6).some((msg) => 
      Array.isArray(msg.content) && msg.content.some((item) => item.type === "image")
    );

    const hasUploadedImage = uploadedFiles.some((file) => {
      return (file.type && (file.type === "image" || file.type.startsWith("image/"))) || 
        /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name);
    });
  
    setHasImage(hasImageHistory || hasUploadedImage);
  }, [messages, setHasImage, uploadedFiles]);

  useEffect(() => {
    const chatContainer = messagesEndRef.current?.parentElement;
    if (!chatContainer) return;
    const handleScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = chatContainer;
      if (scrollHeight - scrollTop - clientHeight > 50) {
        setIsAtBottom(false);
      } else {
        setIsAtBottom(true);
      }
    };
    chatContainer.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => chatContainer.removeEventListener("scroll", handleScroll);
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
              isComplete={msg.isComplete}
              onDelete={handleDelete}
              onRegenerate={handleRegenerate}
              onSendEditedMessage={sendEditedMessage}
              setScrollOnSend={setScrollOnSend}
              isTouch={isTouch}
              isLoading={isLoading}
              isLastMessage={idx === messages.length - 1}
            />
          )), [messages, handleDelete, handleRegenerate, sendEditedMessage, isTouch, isLoading]
        )}

        <AnimatePresence>
          {confirmModal && (
            <Modal
              message="정말 메세지를 삭제하시겠습니까?"
              onConfirm={() => {
                deleteMessages(deleteIndex);
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

        {isThinking && (
          <motion.div
            className="chat-message loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1, ease: "easeOut" }}
          >
            생각하는 중...
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <InputContainer
        isTouch={isTouch}
        placeholder="답장 입력"
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
      
      <Toast
        type="error"
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  );
}

export default Chat;