// src/pages/Chat.js
import React, { useState, useEffect, useCallback, useRef, useContext } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { FaPaperPlane, FaStop } from "react-icons/fa";
import { IoImageOutline } from "react-icons/io5";
import { GoPlus, GoGlobe, GoLightBulb, GoTelescope, GoUnlock } from "react-icons/go";
import { ImSpinner8 } from "react-icons/im";
import { BiX } from "react-icons/bi";
import { FiPaperclip, FiMic, FiServer } from "react-icons/fi";
import { ClipLoader } from "react-spinners";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUpload } from "../utils/useFileUpload";
import axios from "../utils/axiosConfig";
import Message from "../components/Message";
import Modal from "../components/Modal";
import MCPModal from "../components/MCPModal";
import Toast from "../components/Toast";
import "../styles/Common.css";

function Chat({ isTouch, chatMessageRef, userInfo }) {
  const { conversation_id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isMCPModalOpen, setIsMCPModalOpen] = useState(false);
  const [scrollOnSend, setScrollOnSend] = useState(false);
  const [deleteIndex, setdeleteIndex] = useState(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showMediaOptions, setShowMediaOptions] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  
  const { 
    uploadedFiles, 
    setUploadedFiles,
    processFiles, 
    removeFile
  } = useFileUpload([]);

  const textAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const optionsRef = useRef(null);
  const recognitionRef = useRef(null);
  const recordingTimerRef = useRef(null);

  const {
    modelsData,
    model,
    temperature,
    reason,
    systemMessage,
    isInference,
    isSearch,
    isDeepResearch,
    isDAN,
    mcpList,
    canControlSystemMessage,
    canReadImage,
    canToggleInference,
    canToggleSearch,
    canToggleDeepResearch,
    canToggleMCP,
    updateModel,
    setAlias,
    setTemperature,
    setReason,
    setSystemMessage,
    setIsImage,
    setIsDAN, 
    setMCPList,
    toggleInference,
    toggleSearch,
    toggleDeepResearch
  } = useContext(SettingsContext);

  const { fetchConversations, updateConversation } = useContext(ConversationsContext);

  const models = modelsData.models;
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
  
      const validPrefixes = ["http://", "https://", "www."];
      const validDomainExtensions = [".com", ".net", ".kr"];
      
      const detectedUrls = message.split(/\s+/).filter((token) => {
        const lowerToken = token.toLowerCase();
        const startsWithValidPrefix = validPrefixes.some(prefix => lowerToken.startsWith(prefix));
        const endsWithValidExtension = validDomainExtensions.some(ext => lowerToken.endsWith(ext));
        
        return startsWithValidPrefix || endsWithValidExtension;
      });
      
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
              temperature,
              reason,
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
      systemMessage,
      updateAssistantMessage,
      setErrorMessage,
      isInference,
      isSearch,
      isDeepResearch,
      isDAN,
      mcpList,
      uploadedFiles,
      setUploadedFiles
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
                `${process.env.REACT_APP_FASTAPI_URL}/get_alias`,
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
              console.error("Alias generation failed:", err);
              updateConversation(conversation_id, "새 대화", false);
            }
          })();
        }
        
        else {
          const res = await axios.get(
            `${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}`,
            { withCredentials: true }
          );
          updateModel(res.data.model);
          setAlias(res.data.alias);
          setTemperature(res.data.temperature);
          setReason(res.data.reason);
          setSystemMessage(res.data.system_message);
          
          if (res.data.inference) toggleInference();
          if (res.data.search) toggleSearch();
          if (res.data.deep_research) toggleDeepResearch();
          setIsDAN(res.data.dan);
          setMCPList(res.data.mcp);

          const updatedMessages = res.data.messages.map((m) => {
            const messageWithId = m.id ? m : { ...m, id: generateMessageId() };
            return m.role === "assistant" ? { ...messageWithId, isComplete: true } : messageWithId;
          });
          setMessages(updatedMessages);
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
        setIsInitialized(true);
      }
    };

    initializeChat();
    // eslint-disable-next-line
  }, [conversation_id, location.state]);

  useEffect(() => {
    const hasImageHistory = messages.some((msg) => 
      Array.isArray(msg.content) && msg.content.some((item) => item.type === "image")
    );

    const hasUploadedImage = uploadedFiles.some((file) => {
      return (file.type && (file.type === "image" || file.type.startsWith("image/"))) || 
             /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name);
    });
  
    setIsImage(hasImageHistory || hasUploadedImage);
  }, [messages, setIsImage, uploadedFiles]);

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

  const handleKeyDown = useCallback(
    (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !isComposing &&
        !isTouch &&
        !uploadingFiles
      ) {
        event.preventDefault();
        sendMessage(inputText);
      }
    },
    [inputText, isComposing, isTouch, uploadingFiles, sendMessage]
  );

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textAreaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 250);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText, adjustTextareaHeight]);
  
  useEffect(() => {
    function handleClickOutside(event) {
      if (optionsRef.current && !optionsRef.current.contains(event.target)) {
        setShowMediaOptions(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handlePlusButtonClick = useCallback((e) => {
    e.stopPropagation();
    setShowMediaOptions(!showMediaOptions);
  }, [showMediaOptions]);

  const handleFileClick = useCallback((e) => {
    e.stopPropagation();
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
    setShowMediaOptions(false);
  }, []);

  const handleFileDelete = useCallback((file) => {
    removeFile(file.id);
  }, [removeFile]);

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

  const handlePaste = useCallback(
    async (e) => {
      const items = e.clipboardData.items;
      const filesToUpload = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            filesToUpload.push(file);
          }
        }
      }
      if (filesToUpload.length > 0) {
        e.preventDefault();
        await processFiles(filesToUpload, (errorMessage) => {
          setToastMessage(errorMessage);
          setShowToast(true);
        }, canReadImage);
      }
    },
    [processFiles, canReadImage]
  );

  const handleRecordingStop = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      clearInterval(recordingTimerRef.current);
      setRecordingTime(0);
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleRecordingStart = useCallback(async () => {
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        setToastMessage("이 브라우저는 음성 인식을 지원하지 않습니다.");
        setShowToast(true);
        return;
      }
      
      const recognition = new SpeechRecognition();
      recognition.lang = 'ko-KR';
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event) => {
        let finalText = '';
        let interimText = '';
        
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          
          if (result.isFinal)
            finalText += transcript;
          else 
            interimText += transcript;
        }
        
        const newText = inputText + finalText + interimText;
        setInputText(newText);
      };
      
      recognition.onerror = (event) => {
        setToastMessage(`음성 인식 오류가 발생했습니다. ${event.error}`);
        setShowToast(true);
        handleRecordingStop();
      };
      
      recognition.onend = () => {
        if (isRecording) {
          recognition.start();
        }
      };
      
      recognition.start();
      recognitionRef.current = recognition;
      
      setIsRecording(true);
      setShowMediaOptions(false);
    } catch (error) {
      setToastMessage("음성 인식을 시작하는 데 실패했습니다.");
      setShowToast(true);
    }
  }, [isRecording, handleRecordingStop, inputText]);

  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(recordingTimerRef.current);
      setRecordingTime(0);
    }
    
    return () => clearInterval(recordingTimerRef.current);
  }, [isRecording]);

  const formatRecordingTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleMCPClick = useCallback(() => {
    setIsMCPModalOpen(true);
    setShowMediaOptions(false);
  }, []);

  const handleMCPModalClose = useCallback(() => {
    setIsMCPModalOpen(false);
  }, []);

  const handleMCPModalConfirm = useCallback((selectedServers) => {
    setMCPList(selectedServers);
  }, [setMCPList]);
  
  return (
    <div
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!isInitialized && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100dvh",
            marginBottom: "30px",
          }}
        >
          <ClipLoader loading={true} size={50} />
        </div>
      )}
      <div className="chat-messages" ref={chatMessageRef}>
        <AnimatePresence>
          {messages.map((msg, idx) => (
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
          ))}
        </AnimatePresence>
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
            className="chat-message think"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: 0.5, delay: 1, ease: "easeOut" }}
          >
            생각하는 중...
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <motion.div
        className="input-container"
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
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
                      <div className="file-object">
                        <span className="file-name">{file.name}</span>
                        {!file.content && (
                          <div className="file-upload-overlay">
                            <ClipLoader size={20} />
                          </div>
                        )}
                      </div>
                      <BiX
                        className="file-delete"
                        onClick={() => handleFileDelete(file)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="input-area">
            <AnimatePresence>
              {isRecording && (
                <motion.div 
                  className="recording-indicator"
                  initial={{ y: 5, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 5, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="recording-dot"></div>
                  <span>
                    {`녹음 중... ${formatRecordingTime(recordingTime)}`}
                  </span>
                  <button className="stop-recording-button" onClick={handleRecordingStop}>
                    완료
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <textarea
              ref={textAreaRef}
              className="message-input"
              placeholder="답장 입력하기"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
            />
          </div>
          <div className="button-area">
            <div className="function-button-container" ref={optionsRef}>
              <AnimatePresence>
                <motion.div 
                  className="function-button plus-button" 
                  onClick={handlePlusButtonClick}
                  transition={{ 
                    type: "physics",
                    velocity: 200,
                    stiffness: 100,
                    damping: 15
                  }}
                  layout
                >
                  <GoPlus style={{ strokeWidth: 0.5 }} />
                </motion.div>
              </AnimatePresence>
              <AnimatePresence>
                {showMediaOptions && (
                  <motion.div 
                    className="media-options-dropdown"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="media-option" onClick={handleFileClick}>
                      <FiPaperclip />
                      파일 업로드
                    </div>
                    <div className="media-option" onClick={handleRecordingStart}>
                      <FiMic />
                      음성 인식
                    </div>
                    {canToggleMCP && (
                      <div className="media-option" onClick={handleMCPClick}>
                        <FiServer style={{ paddingLeft: "0.5px", color: "#5e5bff", strokeWidth: 2.5 }} />
                        <span className="mcp-text">MCP 서버</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <AnimatePresence initial={false}>
              {canToggleSearch && (
                <motion.div
                  key="search"
                  className={`function-button ${isSearch ? "active" : ""}`}
                  onClick={toggleSearch}
                  initial={{ x: -20, opacity: 0, scale: 0.8 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{
                    type: "physics",
                    velocity: 200,
                    stiffness: 100,
                    damping: 15
                  }}
                  layout
                >
                  <GoGlobe style={{ strokeWidth: 0.5 }} />
                  <span className="button-text">검색</span>
                </motion.div>
              )}
              {canToggleInference && (
                <motion.div
                  key="inference"
                  className={`function-button ${isInference ? "active" : ""}`}
                  onClick={toggleInference}
                  initial={{ x: -20, opacity: 0, scale: 0.8 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ 
                    type: "physics",
                    velocity: 200,
                    stiffness: 100,
                    damping: 15
                  }}
                  layout
                >
                  <GoLightBulb style={{ strokeWidth: 0.5 }} />
                  <span className="button-text">추론</span>
                </motion.div>
              )}
              {canToggleDeepResearch && (
                <motion.div
                  key="deep-research"
                  className={`function-button ${isDeepResearch ? "active" : ""}`}
                  onClick={toggleDeepResearch}
                  initial={{ x: -20, opacity: 0, scale: 0.8 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ 
                    type: "physics",
                    velocity: 200,
                    stiffness: 100,
                    damping: 15
                  }}
                  layout
                >
                  <GoTelescope style={{ strokeWidth: 0.5 }} />
                  <span className="button-text">딥 리서치</span>
                </motion.div>
              )}
              {canControlSystemMessage && (
                <motion.div
                  key="dan"
                  className={`function-button ${isDAN ? "active" : ""}`}
                  onClick={() => setIsDAN(!isDAN)}
                  initial={{ x: -20, opacity: 0, scale: 0.8 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ 
                    type: "physics",
                    velocity: 200,
                    stiffness: 100,
                    damping: 15
                  }}
                  layout
                >
                  <GoUnlock style={{ strokeWidth: 0.5 }} />
                  <span className="button-text">DAN</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <button
          className="send-button"
          onClick={() =>
            isLoading
              ? abortControllerRef.current?.abort()
              : sendMessage(inputText)
          }
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
      </motion.div>

      <input
        type="file"
        accept="*/*"
        multiple
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={async (e) => {
          const files = Array.from(e.target.files);
          await processFiles(files, (errorMessage) => {
            setToastMessage(errorMessage);
            setShowToast(true);
          }, canReadImage);
          e.target.value = "";
        }}
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
      
      <MCPModal
        isOpen={isMCPModalOpen}
        onClose={handleMCPModalClose}
        onConfirm={handleMCPModalConfirm}
        currentMCPList={mcpList}
        userInfo={userInfo}
      />

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