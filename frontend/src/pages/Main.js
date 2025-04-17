// src/pages/Main.js
import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaPaperPlane, FaStop } from "react-icons/fa";
import { GoPlus, GoGlobe, GoLightBulb, GoUnlock } from "react-icons/go";
import { ImSpinner8 } from "react-icons/im";
import { BiX } from "react-icons/bi";
import { CiWarning } from "react-icons/ci";
import { RiVoiceAiFill } from "react-icons/ri";
import { SettingsContext } from "../contexts/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import Modal from "../components/Modal";
import modelsData from "../models.json";
import "../styles/Common.css";
import { ClipLoader } from "react-spinners";

function Main({ addConversation, isTouch }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [errorModal, setErrorModal] = useState(location.state?.errorModal || null);

  const textAreaRef = useRef(null);
  const fileInputRef = useRef(null);

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
    isInference,
    isSearch,
    isDAN,
    isSearchButton,
    isInferenceButton,
    setTemperature,
    setReason,
    setSystemMessage,
    setIsImage,
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
  const generateRandomHash = useCallback(() => {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
  }, []);

  const notice = 'OpenAI o3, o4-mini가 추가되었습니다!';
  const noticeHash = btoa(encodeURIComponent(notice));

  useEffect(() => {
    setIsImage(false);
    setIsInference(false);
    setIsSearch(false);
    setIsDAN(false);
    updateModel(DEFAULT_MODEL);
    setTemperature(0.5);
    setReason(0);
    setSystemMessage("");
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (isSearchButton && isInferenceButton)
      updateModel(DEFAULT_SEARCH_INFERENCE_MODEL);
    else if (isSearchButton)
      updateModel(DEFAULT_SEARCH_MODEL);
    else if (isInferenceButton)
      updateModel(DEFAULT_INFERENCE_MODEL);
    else
      updateModel(DEFAULT_MODEL);
    // eslint-disable-next-line
  }, [isSearchButton, isInferenceButton]);

  useEffect(() => {
    const storedHash = localStorage.getItem('noticeHash');
    if (!storedHash || storedHash !== noticeHash) {
      setConfirmModal(true);
    }
  }, [noticeHash]);

  useEffect(() => {
    if (location.state?.errorModal) {
      setErrorModal(location.state.errorModal);
      setTimeout(() => {
        setErrorModal(null);
        window.history.replaceState({}, document.title);
      }, 2000);
    }
  }, [location.state]);

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
        const uniqueId = generateRandomHash();
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
    [uploadedFiles, maxFileSize, generateRandomHash, uploadFiles]
  );

  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim()) return;
      try {
        const selectedModel = models.find((m) => m.model_name === model);
        if (!selectedModel) {
          throw new Error("선택한 모델이 유효하지 않습니다.");
        }
        setIsLoading(true);

        const response = await axios.post(
          `${process.env.REACT_APP_FASTAPI_URL}/new_conversation`,
          {
            model: selectedModel.model_name,
            temperature: temperature,
            reason: reason,
            system_message: systemMessage,
            user_message: message,
          },
          { withCredentials: true }
        );

        const { conversation_id, alias } = response.data;
        const newConversation = { conversation_id, alias };
        addConversation(newConversation);
        navigate(`/chat/${conversation_id}`, {
          state: {
            initialMessage: message,
            initialFiles: uploadedFiles,
          },
          replace: false,
        });
      } catch (error) {
        setErrorModal("새 대화를 시작하는 데 실패했습니다.");
        setTimeout(() => setErrorModal(null), 2000);
      } finally {
        setIsLoading(false);
      }
    },
    [
      models,
      model,
      temperature,
      reason,
      systemMessage,
      navigate,
      addConversation,
      uploadedFiles,
    ]
  );

  useEffect(() => {
    const hasUploadedImage = uploadedFiles.some((file) => {
      if (file.type && (file.type === "image" || file.type.startsWith("image/"))) {
        return true;
      }
      return /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name);
    });
    setIsImage(hasUploadedImage);

    if (hasUploadedImage) {
      const selectedModel = models.find((m) => m.model_name === model);
      if (selectedModel && !selectedModel.capabilities?.image) {
        updateModel(DEFAULT_IMAGE_MODEL);
      }
    }
  },
  [
    DEFAULT_IMAGE_MODEL,
    models,
    model,
    setIsImage,
    updateModel,
    uploadedFiles,
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
        setTimeout(() => setErrorModal(null), 3000);
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
      const newHeight = Math.min(textarea.scrollHeight, 180);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText, adjustTextareaHeight]);

  const handleSendButtonClick = useCallback(() => {
    if (inputText.trim())
      sendMessage(inputText);
    else
      navigate("/realtime");
  }, [inputText, sendMessage, navigate]);

  return (
    <div
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <motion.div
        className="welcome-message"
        initial={{ y: 5 }}
        animate={{ y: 0 }}
        exit={{ y: 5 }}
        transition={{ duration: 0.3 }}
      >
        무엇을 도와드릴까요?
      </motion.div>

      <motion.div
        className="input-container main-input-container"
        initial={{ y: 5 }}
        animate={{ y: 0 }}
        exit={{ y: 5 }}
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
          onClick={handleSendButtonClick}
          disabled={uploadingFiles}
          aria-label={
            isLoading
              ? "전송 중단"
              : inputText.trim() || uploadedFiles.length > 0
              ? "메시지 전송"
              : "실시간 대화"
          }
        >
          {isLoading ? (
            <div className="loading-container">
              <ImSpinner8 className="spinner" />
              <FaStop className="stop-icon" />
            </div>
          ) : inputText.trim() || uploadedFiles.length > 0 ? (
            <FaPaperPlane />
          ) : (
            <RiVoiceAiFill style={{ fontSize: "23px", strokeWidth: 0.3 }}/>
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

      <AnimatePresence>
        {errorModal && (
          <motion.div
            className="error-modal"
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
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

export default Main;