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
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [scrollOnSend, setScrollOnSend] = useState(false);
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
    isImage,
    isInference,
    isSearch,
    isDAN,
    isFunctionOn,
    setIsInference,
    setIsSearch,
    setIsDAN,
    setIsFunctionOn,
  } = useContext(SettingsContext);

  const models = modelsData.models;
  const allowedExtensions = useMemo(
    () =>
      /\.(pdf|doc|docx|pptx|xlsx|csv|txt|rtf|html|htm|odt|eml|epub|msg|json|wav|mp3|ogg)$/i,
    []
  );

  const getFileId = useCallback((file) => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }, []);

  const uploadFiles = useCallback(
    async (file) => {
      if (file.type.startsWith("image/")) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(
          `${process.env.REACT_APP_FASTAPI_URL}/upload`,
          {
            method: "POST",
            body: formData,
          }
        );
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        return { type: "image", name: data.file_name, content: data.file_path, id: getFileId(file) };
      } else {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({ type: "file", name: file.name, content: reader.result, id: getFileId(file) });
          reader.onerror = () =>
            reject(new Error(`파일 변환 중 오류가 발생했습니다: ${reader.error}`));
          reader.readAsDataURL(file);
        });
      }
    },
    [getFileId]
  );

  const processFiles = useCallback(
    async (files) => {
      const maxAllowed = 5;
      let acceptedFiles = [];
      const currentCount = uploadedFiles.length;
      const remaining = maxAllowed - currentCount;

      if (files.length > remaining) {
        setErrorModal("최대 업로드 가능한 파일 개수를 초과했습니다.");
        setTimeout(() => setErrorModal(null), 3000);
        acceptedFiles = files.slice(0, remaining);
      } else {
        acceptedFiles = files;
      }
      setUploadedFiles((prev) => [
        ...prev,
        ...acceptedFiles.map((file) => ({
          id: getFileId(file),
          name: file.name,
          isUploading: true,
        })),
      ]);

      await Promise.all(
        acceptedFiles.map(async (file) => {
          try {
            const result = await uploadFiles(file);
            setUploadedFiles((prev) =>
              prev.map((item) =>
                item.id === getFileId(file)
                  ? { ...result, isUploading: false }
                  : item
              )
            );
          } catch (err) {
            setErrorModal("파일 처리 중 오류가 발생했습니다: " + err.message);
            setTimeout(() => setErrorModal(null), 3000);
            setUploadedFiles((prev) =>
              prev.filter((item) => item.id !== getFileId(file))
            );
          }
        })
      );
    },
    [getFileId, uploadFiles, uploadedFiles]
  );

  useEffect(() => {
    if (isFunctionOn) {
      if (isSearch && isInference) {
        updateModel("sonar-reasoning");
      } else if (isSearch) {
        updateModel("sonar");
      } else if (isInference) {
        updateModel("o1");
      }
    }
    // eslint-disable-next-line
  }, [isSearch, isInference, isFunctionOn]);

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

  const sendMessage = useCallback(
    async (message, files = uploadedFiles) => {
      if (!message.trim() && files.length === 0) return;

      setIsLoadingResponse(true);
      setScrollOnSend(true);

      const contentParts = [];
      if (message.trim()) {
        contentParts.push({ type: "text", text: message });
      }
      if (files.length > 0) {
        contentParts.push(...files);
      }

      setMessages((prev) => [...prev, { role: "user", content: contentParts }]);
      setInputText("");
      setUploadedFiles([]);

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
              ...(selectedModel.search_billing && { search_billing: selectedModel.search_billing }),
              temperature,
              reason,
              system_message: systemMessage,
              user_message: contentParts,
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
        setIsLoadingResponse(false);
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

  useEffect(() => {
    const initializeChat = async () => {
      try {
        setIsLoadingChat(true);
        setIsImage(false);
        setIsInference(false);
        setIsSearch(false);

        const res = await axios.get(
          `${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}`,
          { withCredentials: true }
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
        setIsLoadingChat(false);
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
        updateModel("gpt-4o");
      }
    }
  }, [uploadedFiles, messages, model, models, setIsImage, updateModel]);

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
          if (file && (file.type.startsWith("image/") || allowedExtensions.test(file.name))) {
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

  const handleDelete = useCallback((idx) => {
    setdeleteIndex(idx);
    setConfirmModal(true);
  }, []);

  const handleRegenerate = useCallback(
    async (startIndex) => {
      try {
        const previousMessage = messages[startIndex - 1];
        if (!previousMessage) return;

        let newInputText = "";
        let newUploadedFiles = [];

        previousMessage.content.forEach((part) => {
          if (part.type === "text") {
            newInputText += part.text;
          } else {
            newUploadedFiles.push(part);
          }
        });

        await deleteMessages(startIndex - 1);
        setInputText(newInputText.trim());
        setUploadedFiles(newUploadedFiles);
        sendMessage(newInputText, newUploadedFiles);
      } catch (err) {
        setErrorModal("메세지 재생성 중 오류가 발생하였습니다.");
        setTimeout(() => setErrorModal(null), 2000);
      }
    },
    [messages, deleteMessages, sendMessage, setErrorModal]
  );

  const handleEdit = useCallback(
    async (idx) => {
      try {
        const message = messages[idx];
        if (!message) return;

        let newInputText = "";
        let newUploadedFiles = [];

        message.content.forEach((part) => {
          if (part.type === "text") {
            newInputText += part.text;
          } else {
            newUploadedFiles.push(part);
          }
        });

        await deleteMessages(idx);

        setInputText(newInputText.trim());
        setUploadedFiles(newUploadedFiles);

        const hasImage = newUploadedFiles.some(
          (file) =>
            file.type === "image" || (file.type && file.type.startsWith("image/"))
        );
        setIsImage(hasImage);
      } catch (err) {
        setErrorModal("메세지 수정 중 오류가 발생했습니다: " + err.message);
        setTimeout(() => setErrorModal(null), 2000);
      }
    },
    [messages, deleteMessages, setIsImage, setErrorModal]
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
      if (event.key === "Enter" && !event.shiftKey && !isComposing && !isTouch) {
        event.preventDefault();
        sendMessage(inputText);
      }
    },
    [inputText, isComposing, isTouch, sendMessage]
  );

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textAreaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 180);
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
      {isLoadingChat && (
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
              onEdit={handleEdit}
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
                              {file.isUploading && (
                                <div
                                  className="file-upload-overlay"
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    backgroundColor: "rgba(255,255,255,0.8)",
                                    zIndex: 2,
                                  }}
                                >
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
                isImage ? "disabled" : isSearch ? "active" : ""
              }`}
              onClick={() => {
                const newSearch = !isSearch;
                setIsSearch(newSearch);
                setIsFunctionOn(newSearch || isInference);
                if (!newSearch && !isInference) {
                  updateModel("gpt-4o");
                }
              }}
            >
              <GoGlobe style={{ strokeWidth: 0.5 }} />
              검색
            </div>
            <div
              className={`function-button ${isInference ? "active" : ""}`}
              onClick={() => {
                const newInference = !isInference;
                setIsInference(newInference);
                setIsFunctionOn(isSearch || newInference);
                if (!isSearch && !newInference) {
                  updateModel("gpt-4o");
                }
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
        <button
          className="send-button"
          onClick={() => {
            if (isLoadingResponse) {
              abortControllerRef.current?.abort();
            } else {
              sendMessage(inputText);
            }
          }}
          disabled={(uploadedFiles.some((file) => file.isUploading))}
          aria-label={isLoadingResponse ? "전송 중단" : "메시지 전송"}
        >
          {isLoadingResponse ? (
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
        accept="image/*, .pdf, .doc, .docx, .pptx, .xlsx, .csv, .txt, .rtf, .html, .htm, .odt, .eml, .epub, .msg, .json, .wav, .mp3, .ogg"
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
            <CiWarning style={{ marginRight: "4px", fontSize: "16px" }} />
            {errorModal}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Chat;