// src/pages/Main.js
import React, { useState, useEffect, useCallback, useRef, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaPaperPlane, FaStop } from "react-icons/fa";
import { GoPlus, GoGlobe, GoLightBulb, GoUnlock } from "react-icons/go";
import { ImSpinner8 } from "react-icons/im";
import { BiX } from "react-icons/bi";
import { RiVoiceAiFill } from "react-icons/ri";
import { FiPaperclip, FiMic } from "react-icons/fi";
import { ClipLoader } from "react-spinners";
import { SettingsContext } from "../contexts/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUpload } from "../hooks/useFileUpload";
import axios from "axios";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import modelsData from "../models.json";
import "../styles/Common.css";

function Main({ addConversation, isTouch }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [notice, setNotice] = useState("");
  const [noticeHash, setNoticeHash] = useState("");
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [showMediaOptions, setShowMediaOptions] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const recognitionRef = useRef(null);
  const textAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const optionsRef = useRef(null);
  const recordingTimerRef = useRef(null);

  const { 
    uploadedFiles, 
    processFiles, 
    removeFile
  } = useFileUpload([]);

  const {
    DEFAULT_MODEL,
    model,
    updateModel,
    isInference,
    isSearch,
    isDAN,
    canControlSystemMessage,
    canReadImage,
    canToggleInference,
    canToggleSearch,
    setTemperature,
    setReason,
    setSystemMessage,
    setIsImage,
    setIsSearch,
    setIsInference,
    setIsDAN
  } = useContext(SettingsContext);

  const models = modelsData.models;
  const uploadingFiles = uploadedFiles.some((file) => !file.content);

  useEffect(() => {
    const fetchNotice = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_FASTAPI_URL}/notice`);
        const { message, hash } = response.data;
        setNotice(message);
        setNoticeHash(hash);
        
        const storedHash = localStorage.getItem('noticeHash');
        if (!storedHash || storedHash !== hash) {
          setConfirmModal(true);
        }
      } catch (error) {}
    };
    
    fetchNotice();
  }, []);

  useEffect(() => {
    setIsImage(false);
    setIsSearch(false);
    setIsInference(false);
    setIsDAN(false);
    updateModel(DEFAULT_MODEL);
    setTemperature(0.5);
    setReason(0);
    setSystemMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (location.state?.errorModal) {
      setToastMessage(location.state.errorModal);
      setShowToast(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim() || uploadingFiles) return;
      try {
        const selectedModel = models.find((m) => m.model_name === model);
        if (!selectedModel) {
          throw new Error("선택한 모델이 유효하지 않습니다.");
        }
        setIsLoading(true);
        
        const response = await axios.post(
          `${process.env.REACT_APP_FASTAPI_URL}/new_conversation`, {},
          { 
            withCredentials: true
          }
        );
        
        const conversation_id = response.data.conversation_id;
        const created_at = response.data.created_at;
        
        const newConversation = {
          conversation_id,
          alias: "새 대화",
          starred: false,
          starred_at: null,
          created_at: created_at,
          isLoading: true
        };
        addConversation(newConversation);
        
        navigate(`/chat/${conversation_id}`, {
          state: {
            initialMessage: message,
            initialFiles: uploadedFiles,
          },
          replace: false,
        });
      } catch (error) {
        setToastMessage("새 대화를 시작하는 데 실패했습니다.");
        setShowToast(true);
        setIsLoading(false);
      }
    },
    [
      models,
      model,
      navigate,
      uploadedFiles,
      uploadingFiles,
      addConversation
    ]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    const hasUploadedImage = uploadedFiles.some((file) => {
      return (file.type && (file.type === "image" || file.type.startsWith("image/"))) || 
             /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name);
    });
    setIsImage(hasUploadedImage);
  },
  [setIsImage, uploadedFiles]);

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

  const handleSendButtonClick = useCallback(() => {
    if (isLoading) {
      cancelRequest();
      return;
    }
    
    if (inputText.trim())
      sendMessage(inputText);
    else
      navigate("/realtime");
  }, [inputText, sendMessage, navigate, isLoading, cancelRequest]);

  const formatRecordingTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="welcome-container">
        <motion.div
          className="welcome-message"
          initial={{ y: 5 }}
          animate={{ y: 0 }}
          exit={{ y: 5 }}
          transition={{ duration: 0.3 }}
        >
          무엇을 도와드릴까요?
        </motion.div>
      </div>

      <motion.div
        className="input-container main-input-container"
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <AnimatePresence initial={false}>
              {canToggleSearch && (
                <motion.div
                  key="search"
                  className={`function-button ${isSearch ? "active" : ""}`}
                  onClick={() => setIsSearch(!isSearch)}
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
                  검색
                </motion.div>
              )}
              {canToggleInference && (
                <motion.div
                  key="inference"
                  className={`function-button ${isInference ? "active" : ""}`}
                  onClick={() => setIsInference(!isInference)}
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
                  추론
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
                  DAN
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <button
          className={`send-button ${
            inputText.trim() || uploadedFiles.length > 0  ? "" : "realtime"
          }`}
          onClick={handleSendButtonClick}
          disabled={uploadingFiles || isRecording}
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

      <Toast
        type="error"
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  );
}

export default Main;