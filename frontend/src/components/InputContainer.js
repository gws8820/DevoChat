import React, { useState, useEffect, useRef, useContext, useCallback } from "react";
import { GoPlus, GoGlobe, GoLightBulb, GoTelescope, GoUnlock } from "react-icons/go";
import { ImSpinner8 } from "react-icons/im";
import { BiX } from "react-icons/bi";
import { FiPaperclip, FiMic, FiServer } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { ClipLoader } from "react-spinners";
import { FaPaperPlane, FaStop } from "react-icons/fa";
import { SettingsContext } from "../contexts/SettingsContext";
import MCPModal from "./MCPModal";
import Toast from "./Toast";
import "../styles/InputContainer.css";
 
function InputContainer({
  isTouch,
  placeholder,
  extraClassName = "",
  inputText,
  setInputText,
  isLoading,
  onSend,
  onCancel,
  uploadedFiles,
  processFiles,
  removeFile,
  uploadingFiles,
}) {
  const [isComposing, setIsComposing] = useState(false);
  const [showMediaOptions, setShowMediaOptions] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isMCPModalOpen, setIsMCPModalOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const optionsRef = useRef(null);
  const textAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const recordingTimerRef = useRef(null);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textAreaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const calculatedHeight = Math.max(textarea.scrollHeight, 40);
      const newHeight = Math.min(calculatedHeight, 250);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText, adjustTextareaHeight]);
  
  const formatRecordingTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const {
    isInference,
    isSearch,
    isDeepResearch,
    isDAN,
    mcpList,
    canControlSystemMessage,
    canToggleInference,
    canToggleSearch,
    canToggleDeepResearch,
    canToggleMCP,
    canReadImage,
    setIsDAN,
    setMCPList,
    toggleInference,
    toggleSearch,
    toggleDeepResearch,
  } = useContext(SettingsContext);

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

  const notifyError = useCallback((message) => {
    setToastMessage(message);
    setShowToast(true);
  }, []);

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
        await processFiles(filesToUpload, notifyError, canReadImage);
      }
    },
    [processFiles, canReadImage, notifyError]
  );

  const handlePlusButtonClick = useCallback((e) => {
    e.stopPropagation();
    setShowMediaOptions(!showMediaOptions);
  }, [showMediaOptions]);

  const handleFileClick = useCallback((e) => {
    e.stopPropagation();
    if (fileInputRef.current) fileInputRef.current.click();
    setShowMediaOptions(false);
  }, []);

  const handleFileDelete = useCallback((file) => {
    removeFile(file.id);
  }, [removeFile]);

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
          if (result.isFinal) finalText += transcript; else interimText += transcript;
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
        if (isRecording) recognition.start();
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      setShowMediaOptions(false);
    } catch (error) {
      setToastMessage("음성 인식을 시작하는 데 실패했습니다.");
      setShowToast(true);
    }
  }, [isRecording, handleRecordingStop, inputText, setInputText]);

  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(recordingTimerRef.current);
      setRecordingTime(0);
    }
    return () => clearInterval(recordingTimerRef.current);
  }, [isRecording]);

  const handleKeyDown = useCallback((event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !isComposing &&
      !isTouch &&
      !uploadingFiles
    ) {
      event.preventDefault();
      onSend(inputText);
    }
  }, [inputText, isComposing, isTouch, uploadingFiles, onSend]);

  const handleSendButtonClick = useCallback(() => {
    if (isLoading) {
      onCancel?.();
      return;
    }
    if (inputText.trim()) {
      onSend(inputText);
    } else {
      setToastMessage("내용을 입력해주세요.");
      setShowToast(true);
    }
  }, [isLoading, inputText, onSend, onCancel]);

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
    <motion.div
      className={`input-container ${extraClassName}`}
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
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
                    {file.preview ? (
                      <div className="file-object image">
                        <img
                          src={file.preview}
                          alt={file.name}
                        />
                        <BiX className="file-delete" onClick={() => handleFileDelete(file)} />
                        {!file.content && (
                          <div className="file-upload-overlay">
                            <ClipLoader size={20} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="file-object">
                        <span className="file-name">{file.name}</span>
                        <BiX className="file-delete" onClick={() => handleFileDelete(file)} />
                        {!file.content && (
                          <div className="file-upload-overlay">
                            <ClipLoader size={20} />
                          </div>
                        )}
                      </div>
                    )}
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
                <span>{`녹음 중... ${formatRecordingTime(recordingTime)}`}</span>
                <button className="stop-recording-button" onClick={handleRecordingStop}>
                  완료
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <textarea
            ref={textAreaRef}
            className="message-input"
            placeholder={placeholder}
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
            <motion.div
              className="function-button"
              onClick={handlePlusButtonClick}
              transition={{ type: "physics", velocity: 200, stiffness: 100, damping: 15 }}
              layout
            >
              <GoPlus style={{ strokeWidth: 0.5 }} />
            </motion.div>
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
                transition={{ type: "physics", velocity: 200, stiffness: 100, damping: 15 }}
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
                transition={{ type: "physics", velocity: 200, stiffness: 100, damping: 15 }}
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
                transition={{ type: "physics", velocity: 200, stiffness: 100, damping: 15 }}
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
                transition={{ type: "physics", velocity: 200, stiffness: 100, damping: 15 }}
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
        onClick={handleSendButtonClick}
        disabled={uploadingFiles || isRecording}
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

      <MCPModal
        isOpen={isMCPModalOpen}
        onClose={handleMCPModalClose}
        onConfirm={handleMCPModalConfirm}
        currentMCPList={mcpList}
      />

      <Toast
        type="error"
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </motion.div>
  );
}

export default InputContainer;