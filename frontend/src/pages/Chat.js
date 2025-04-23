import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { FaPaperPlane, FaStop } from "react-icons/fa";
import { GoPlus, GoGlobe, GoLightBulb, GoUnlock } from "react-icons/go";
import { ImSpinner8 } from "react-icons/im";
import { BiX } from "react-icons/bi";
import { CiWarning } from "react-icons/ci";
import { ClipLoader } from "react-spinners";
import { SettingsContext } from "../contexts/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import modelsData from "../models.json";
import Message from "../components/Message";
import Modal from "../components/Modal";
import "../styles/Common.css";

function Chat({ fetchConversations, isTouch }) {
  const { conversation_id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [scrollOnSend, setScrollOnSend] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [deleteIndex, setdeleteIndex] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [errorModal, setErrorModal] = useState(null);

  const textAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const thinkingIntervalRef = useRef(null);

  const {
    DEFAULT_MODEL,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_SEARCH_MODEL,
    DEFAULT_INFERENCE_MODEL,
    DEFAULT_SEARCH_INFERENCE_MODEL,
    model,
    modelType,
    temperature,
    reason,
    systemMessage,
    updateModel,
    setTemperature,
    setReason,
    setSystemMessage,
    setIsImage,
    isInference,
    isSearch,
    isDAN,
    isSearchButton,
    isInferenceButton,
    setIsInference,
    setIsSearch,
    setIsDAN,
    setIsSearchButton,
    setIsInferenceButton
  } = useContext(SettingsContext);

  const models = modelsData.models;
  const uploadingFiles = uploadedFiles.some((file) => !file.content);
  const allowedExtensions = useMemo(
    () =>
      /\.(zip|pdf|doc|docx|pptx|xlsx|csv|txt|text|rtf|html|htm|odt|eml|epub|msg|json|wav|mp3|ogg|md|markdown|xml|tsv|yml|yaml|py|pyw|rb|pl|java|c|cpp|h|hpp|v|js|jsx|ts|tsx|css|scss|less|cs|sh|bash|bat|ps1|ini|conf|cfg|toml|tex|r|swift|scala|hs|erl|ex|exs|go|rs|php)$/i,
    []
  );
  const maxFileSize = 50 * 1024 * 1024;

  const generateRandomId = useCallback(() => {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
  }, []);

  const uploadFiles = useCallback(
    async (file, uniqueId) => {
      const formData = new FormData();
      formData.append("file", file);

      if (file.type.startsWith("image/")) {
        const res = await fetch(
          `${process.env.REACT_APP_FASTAPI_URL}/upload/image`,
          {
            method: "POST",
            body: formData,
          }
        );
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        return {
          id: uniqueId,
          type: data.type,
          name: data.name,
          content: data.content,
        };
      } else {
        const res = await fetch(
          `${process.env.REACT_APP_FASTAPI_URL}/upload/file`,
          {
            method: "POST",
            body: formData,
          }
        );
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        return {
          id: uniqueId,
          type: data.type,
          name: data.name,
          content: data.content,
        };
      }
    },
    []
  );

  const processFiles = useCallback(
    async (files) => {
      const maxAllowed = 10;
      let acceptedFiles = [];
      const currentCount = uploadedFiles.length;
      const remaining = maxAllowed - currentCount;
      
      const sizeAcceptedFiles = files.filter((file) => file.size <= maxFileSize);
      const rejectedSizeFiles = files.filter((file) => file.size > maxFileSize);
      if (rejectedSizeFiles.length > 0) {
        setErrorModal("50MB를 초과하는 파일은 업로드할 수 없습니다.");
        setTimeout(() => setErrorModal(null), 3000);
      }
      
      if (sizeAcceptedFiles.length > remaining) {
        setErrorModal("최대 업로드 가능한 파일 개수를 초과했습니다.");
        setTimeout(() => setErrorModal(null), 3000);
        acceptedFiles = sizeAcceptedFiles.slice(0, remaining);
      } else {
        acceptedFiles = sizeAcceptedFiles;
      }
      
      const filePairs = acceptedFiles.map((file) => {
        const uniqueId = generateRandomId();
        return { file, uniqueId };
      });

      setUploadedFiles((prev) => [
        ...prev,
        ...filePairs.map(({ file, uniqueId }) => ({
          id: uniqueId,
          name: file.name,
        })),
      ]);

      await Promise.all(
        filePairs.map(async ({ file, uniqueId }) => {
          try {
            const result = await uploadFiles(file, uniqueId);
            setUploadedFiles((prev) =>
              prev.map((item) =>
                item.id === uniqueId ? result : item
              )
            );
          } catch (err) {
            setErrorModal("파일 처리 중 오류가 발생했습니다.");
            setTimeout(() => setErrorModal(null), 3000);
            setUploadedFiles((prev) =>
              prev.filter((item) => item.id !== uniqueId)
            );
          }
        })
      );
    },
    [uploadedFiles, maxFileSize, generateRandomId, uploadFiles]
  );

  const updateAssistantMessage = useCallback((message, isComplete = false) => {
    if (thinkingIntervalRef.current) {
      clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
      setIsThinking(false);
    }
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        return prev.map((msg, i) =>
          i === prev.length - 1 ? { ...msg, content: message, isComplete } : msg
        );
      } else {
        return [...prev, { role: "assistant", content: message, isComplete }];
      }
    });
  }, []);

  const setErrorMessage = useCallback((message) => {
    setMessages((prev) => [...prev, { role: "error", content: message }]);
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
          setErrorModal("메세지 삭제 중 오류가 발생했습니다.");
          setTimeout(() => setErrorModal(null), 2000);
        });
    },
    [conversation_id]
  );

  const sendMessage = useCallback(
    async (message, files = uploadedFiles) => {
      if (!message.trim()) return;

      const contentParts = [];
      contentParts.push({ type: "text", text: message });
      if (files.length > 0) {
        contentParts.push(...files);
      }
  
      setMessages((prev) => [
        ...prev,
        { role: "user", content: contentParts },
      ]);
      setInputText("");
      setUploadedFiles([]);
      setIsLoading(true);
      requestAnimationFrame(() => {
        setScrollOnSend(true);
      });
  
      const tokens = message.split(/\s+/);
      const domainExtensions = [
        ".com", ".cn", ".tk", ".de", ".net", ".uk", ".org",
        ".nl", ".ru", ".br", ".au", ".fr", ".eu", ".za",
        ".it", ".pl", ".in", ".ir", ".co", ".info", ".es",
        ".ro", ".ch", ".us", ".ca", ".be", ".jp", ".biz",
        ".club", ".kr", ".se", ".mx", ".tv", ".dev", ".top",
        ".xyz", ".live", ".website", ".store", ".ai", ".io", ".online",
        ".ph", ".vn", ".gr", ".pt", ".bg", ".id", ".hu", ".ly"
      ]
      const detectedUrls = tokens.filter((token) =>
        domainExtensions.some((ext) => token.toLowerCase().includes(ext))
      );
  
      if (detectedUrls && detectedUrls.length > 0) {
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
            if (res.ok) {
              const data = await res.json();
              if (data.content) {
                return { type: "url", content: data.content };
              }
            }
          } catch (err) {
          }
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
          setThinkingText("생각 중");
          let dotCount = 0;
          thinkingIntervalRef.current = setInterval(() => {
            dotCount++;
            const dots = ".".repeat(dotCount % 6);
            setThinkingText(`생각 중${dots}`);
          }, 1000);
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
              ...(selectedModel.search_billing && {
                search_billing: selectedModel.search_billing,
              }),
              temperature,
              reason,
              system_message: systemMessage,
              user_message: contentParts,
              search: selectedModel.capabilities?.search,
              dan: isDAN,
              stream: selectedModel.stream,
            }),
            credentials: "include",
            signal: controller.signal,
          }
        );
  
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
        if (thinkingIntervalRef.current) {
          clearInterval(thinkingIntervalRef.current);
          thinkingIntervalRef.current = null;
          setIsThinking(false);
        }
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
      isDAN,
      uploadedFiles,
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
        setErrorModal("메세지 처리 중 오류가 발생했습니다.");
        setTimeout(() => setErrorModal(null), 2000);
      }
    },
    [deleteMessages, sendMessage, setErrorModal]
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
    if(isInitialized) {
      if (isSearchButton && isInferenceButton)
        updateModel(DEFAULT_SEARCH_INFERENCE_MODEL);
      else if (isSearchButton)
        updateModel(DEFAULT_SEARCH_MODEL);
      else if (isInferenceButton)
        updateModel(DEFAULT_INFERENCE_MODEL);
      else
        updateModel(DEFAULT_MODEL);
    }
    // eslint-disable-next-line
  }, [isSearchButton, isInferenceButton]);

  useEffect(() => {
    const initializeChat = async () => {
      try {
        const res = await axios.get(
          `${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}`
        );
        updateModel(res.data.model);
        setTemperature(res.data.temperature);
        setReason(res.data.reason);
        setSystemMessage(res.data.system_message);

        const updatedMessages = res.data.messages.map((m) =>
          m.role === "assistant" ? { ...m, isComplete: true } : m
        );
        setMessages(updatedMessages);

        if (location.state?.initialMessage && updatedMessages.length === 0) {
          if (location.state.initialFiles && location.state.initialFiles.length > 0) {
            sendMessage(location.state.initialMessage, location.state.initialFiles);
          } else {
            sendMessage(location.state.initialMessage);
          }
        }
      } catch (err) {
        if (err.response && err.response.status === 404) {
          fetchConversations();
          navigate("/", { state: { errorModal: "대화를 찾을 수 없습니다." } });
        } else {
          fetchConversations();
          navigate("/", { state: { errorModal: "데이터를 불러오는 중 오류가 발생했습니다." } });
        }
      } finally {
        setIsInitialized(true);
      }
    };

    initializeChat();
    // eslint-disable-next-line
  }, [conversation_id, location.state]);

  useEffect(() => {
    const hasUploadedImage = uploadedFiles.some((file) => {
      if (file.type && (file.type === "image" || file.type.startsWith("image/"))) {
        return true;
      }
      return /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name);
    });
  
    const hasMessageImage = messages.some((msg) => {
      if (Array.isArray(msg.content)) {
        return msg.content.some((item) => item.type === "image");
      }
      return false;
    });
  
    const newIsImage = hasUploadedImage || hasMessageImage;
    setIsImage(newIsImage);
  
    if (newIsImage) {
      const selectedModel = models.find((m) => m.model_name === model);
      if (selectedModel && !selectedModel.capabilities?.image) {
        updateModel(DEFAULT_IMAGE_MODEL);
      }
    }
  }, 
  [
    DEFAULT_IMAGE_MODEL,
    model,
    models,
    setIsImage,
    updateModel,
    uploadedFiles,
    messages
  ]);

  const handleFileClick = useCallback((e) => {
    e.stopPropagation();
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileDelete = useCallback((file) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id));
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
      const acceptedFiles = files.filter(
        (file) =>
          file.type.startsWith("image/") || allowedExtensions.test(file.name)
      );
      const rejectedFiles = files.filter(
        (file) =>
          !file.type.startsWith("image/") && !allowedExtensions.test(file.name)
      );

      if (rejectedFiles.length > 0) {
        setErrorModal("지원되는 형식이 아닙니다.");
        setTimeout(() => setErrorModal(null), 2000);
      }

      if (acceptedFiles.length > 0) {
        await processFiles(acceptedFiles);
      }
    },
    [allowedExtensions, processFiles]
  );

  const handlePaste = useCallback(
    async (e) => {
      const items = e.clipboardData.items;
      const filesToUpload = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (
            file &&
            (file.type.startsWith("image/") || allowedExtensions.test(file.name))
          ) {
            filesToUpload.push(file);
          }
        }
      }
      if (filesToUpload.length > 0) {
        e.preventDefault();
        await processFiles(filesToUpload);
      }
    },
    [allowedExtensions, processFiles]
  );

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
      <div className="chat-messages">
        <AnimatePresence>
          {messages.map((msg, idx) => (
            <Message
              key={idx}
              messageIndex={idx}
              role={msg.role}
              content={msg.content}
              isComplete={msg.isComplete}
              onDelete={handleDelete}
              onRegenerate={handleRegenerate}
              onSendEditedMessage={sendEditedMessage}
              setScrollOnSend={setScrollOnSend}
              isTouch={isTouch}
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
            {thinkingText}
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <motion.div
        className="input-container chat-input-container"
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
                            initial={{ y: 4, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 4, opacity: 0 }}
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
              </motion.div>
            )}
          </AnimatePresence>
          <div className="input-area">
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
            <div className="function-button" onClick={handleFileClick}>
              <GoPlus style={{ strokeWidth: 0.5 }} />
            </div>
            <div
              className={`function-button ${
                isSearch ? "active" : ""
              }`}
              onClick={() => {
                setIsSearch(!isSearch);
                setIsSearchButton(!isSearch);
              }}
            >
              <GoGlobe style={{ strokeWidth: 0.5 }} />
              검색
            </div>
            <div
              className={`function-button ${isInference ? "active" : ""}`}
              onClick={() => {
                setIsInference(!isInference);
                setIsInferenceButton(!isInference);
              }}
            >
              <GoLightBulb style={{ strokeWidth: 0.5 }} />
              추론
            </div>
            <div
              className={`function-button ${
                modelType === "none" ? "disabled" : isDAN ? "active" : ""
              }`}
              onClick={() => {
                if (modelType !== "none") {
                  setIsDAN(!isDAN);
                }
              }}
            >
              <GoUnlock style={{ strokeWidth: 0.5 }} />
              DAN
            </div>
          </div>
        </div>

        <div
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
        </div>
      </motion.div>

      <input
        type="file"
        accept="image/*, .zip, .pdf, .doc, .docx, .pptx, .xlsx, .csv, .txt, .text, .rtf, .html, .htm, .odt, .eml, .epub, .msg, .json, .wav, .mp3, .ogg, .md, .markdown, .xml, .tsv, .yml, .yaml, .py, .pyw, .rb, .pl, .java, .c, .cpp, .h, .hpp, .v, .js, .jsx, .ts, .tsx, .css, .scss, .less, .cs, .sh, .bash, .bat, .ps1, .ini, .conf, .cfg, .toml, .tex, .r, .swift, .scala, .hs, .erl, .ex, .exs, .go, .rs, .php"
        multiple
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={async (e) => {
          const files = Array.from(e.target.files);
          await processFiles(files);
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
            transition={{ duration: 0.5 }}
          >
            여기에 파일을 끌어서 추가하세요
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {errorModal && (
          <motion.div
            className="error-modal"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <CiWarning style={{ flexShrink: 0, marginRight: "4px", fontSize: "16px" }} />
            {errorModal}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Chat;