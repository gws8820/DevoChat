import React, { useState, useEffect, useRef, useContext, useCallback } from "react";
import { FiCommand, FiPlus, FiArrowUp, FiMic, FiX, FiSquare } from "react-icons/fi";
import { GoPencil } from "react-icons/go";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsContext } from "../contexts/SettingsContext";
import ToolModal from "./ToolModal";
import ThinkingModeDropdown from "./ThinkingDropdown";
import { useToast } from "../contexts/ToastContext";
import "../styles/InputContainer.css";
import "../styles/FileTile.css";

const getFileExt = (name) =>
  name && name.includes(".") ? name.split(".").pop().toUpperCase() : "FILE";
 
function InputContainer({
  isTouch,
  placeholder,
  inputText,
  setInputText,
  isLoading,
  isRemoteStreaming = false,
  onSend,
  onCancel,
  isEditing = false,
  onCancelEdit,
  uploadedFiles,
  processFiles,
  removeFile,
  uploadingFiles,
  imageOnly = false,
}) {
  const [isComposing, setIsComposing] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isMCPModalOpen, setIsMCPModalOpen] = useState(false);

  const { showToast } = useToast();

  const textAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const inputTextRef = useRef(inputText);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textAreaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const calculatedHeight = Math.max(textarea.scrollHeight, 40);
      const newHeight = Math.min(calculatedHeight, 380);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    inputTextRef.current = inputText;
    adjustTextareaHeight();
  }, [inputText, adjustTextareaHeight]);

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isRecording) {
      setRecordingSeconds(0);
      return;
    }
    const id = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  const formatRecordingTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  
const {
    isSearch,
    isResearch,
    mcpList,
    canToggleSearch,
    canToggleResearch,
    canToggleMCP,
    setMCPList,
    toggleSearch,
    toggleResearch,
  } = useContext(SettingsContext);

  const handlePaste = useCallback(
    async (e) => {
      const files = Array.from(e.clipboardData.items)
        .filter(item => item.kind === "file")
        .map(item => item.getAsFile())
        .filter(file => file && (!imageOnly || file.type.startsWith("image/")));
      if (files.length > 0) {
        e.preventDefault();
        await processFiles(files);
      }
    },
    [processFiles, imageOnly]
  );

  const handleFileClick = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const handleFileDelete = useCallback((file) => {
    removeFile(file.id);
  }, [removeFile]);

  const handleRecordingStop = useCallback(() => {
    isRecordingRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const handleRecordingStart = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    let accumulatedText = inputTextRef.current;

    const startRecognition = () => {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ko-KR';
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let finalText = '';
        let interimText = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          if (result.isFinal) finalText += transcript; else interimText += transcript;
        }
        setInputText(accumulatedText + finalText + interimText);
        if (finalText) accumulatedText += finalText;
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') return;

        isRecordingRef.current = false;
        recognitionRef.current = null;
        setIsRecording(false);
        if (event.error === 'aborted' && event.message && event.message.includes('Dictation')) {
          showToast("받아쓰기가 비활성화되어 있습니다. 설정 → 일반 → 키보드 → 받아쓰기에서 활성화해 주세요.");
        } else if (event.error !== 'aborted') {
          showToast(`음성 인식 오류가 발생했습니다. ${event.error}`);
        }
      };

      recognition.onend = () => {
        if (!isRecordingRef.current) return;
        startRecognition();
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (e) {
        isRecordingRef.current = false;
        recognitionRef.current = null;
        setIsRecording(false);
      }
    };

    isRecordingRef.current = true;
    setIsRecording(true);
    if (navigator.vibrate) navigator.vibrate(100);
    startRecognition();
  }, [showToast, setInputText]);

const handleKeyDown = useCallback((event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !isComposing &&
      !isTouch &&
      !uploadingFiles &&
      !isLoading &&
      !isRemoteStreaming
    ) {
      event.preventDefault();
      onSend(inputText);
    }
  }, [inputText, isComposing, isTouch, uploadingFiles, isLoading, isRemoteStreaming, onSend]);

  const handleSendButtonClick = useCallback(() => {
    if (isRemoteStreaming) return;
    if (isLoading) {
      onCancel?.();
      return;
    }
    if (inputText.trim()) {
      onSend(inputText);
    }
  }, [isRemoteStreaming, isLoading, inputText, onSend, onCancel]);

  const handleMicClick = useCallback(() => {
    if (isRecording) {
      handleRecordingStop();
    } else {
      handleRecordingStart();
    }
  }, [isRecording, handleRecordingStop, handleRecordingStart]);

  const handleMCPClick = useCallback(() => {
    setIsMCPModalOpen(true);
  }, []);

  const handleMCPModalClose = useCallback(() => {
    setIsMCPModalOpen(false);
  }, []);

  const handleMCPModalConfirm = useCallback((selectedServers) => {
    setMCPList(selectedServers);
  }, [setMCPList]);

  const sendDisabled = uploadingFiles || isRemoteStreaming || (!isLoading && !inputText.trim());

  return (
    <motion.div 
      className={`input-container${isTouch ? " touch" : ""}`}
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3 }}
    >
        {isEditing && (
          <div className="edit-header">
            <div className="edit-header-title">
              <GoPencil style={{ strokeWidth: 0.6 }} />
              <span>편집</span>
            </div>
            <FiX className="edit-header-close" onClick={onCancelEdit} />
          </div>
        )}
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
                    {(file.preview || file.type === "image") ? (
                      <div className="file-object image">
                        <img
                          src={file.preview || `${process.env.REACT_APP_FASTAPI_URL}${file.content}`}
                          alt={file.name}
                        />
                        <FiX className="file-delete" onClick={() => handleFileDelete(file)} />
                        {!file.content && (
                          <div className="file-upload-overlay">
                            <span className="spinner" style={{ "--spinner-size": "1.2em", "--spinner-width": "1.8px" }} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="file-object">
                        <span className="file-name">{file.name}</span>
                        <span className="file-ext">{getFileExt(file.name)}</span>
                        <FiX className="file-delete" onClick={() => handleFileDelete(file)} />
                        {!file.content && (
                          <div className="file-upload-overlay">
                            <span className="spinner" style={{ "--spinner-size": "1.2em", "--spinner-width": "1.8px" }} />
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
          <div className="function-button" onClick={handleFileClick}>
            <FiPlus style={{ strokeWidth: 2 }} />
          </div>

          {!imageOnly && (
            <div
              className={`function-button ${(mcpList.length > 0 || isSearch || isResearch) ? "active" : ""}`}
              onClick={handleMCPClick}
            >
              <FiCommand style={{ strokeWidth: 2 }} />
            </div>
          )}

          {!imageOnly && <ThinkingModeDropdown />}

          <div className="button-spacer" />

          {isRecording && (
            <div className="recording-indicator" onClick={handleMicClick}>
              <span className="recording-dot" />
              <span>{formatRecordingTime(recordingSeconds)}</span>
            </div>
          )}

          <motion.div
            layout
            transition={{ duration: 0.2 }}
            className={`mic-button${isRecording ? " recording" : ""}`}
            onClick={handleMicClick}
          >
            <FiMic style={{ strokeWidth: 1.8 }} />
          </motion.div>

          <AnimatePresence initial={false} mode="popLayout">
            {!isRecording && (
              <motion.div
                key="send-button"
                layout
                className={`send-button${sendDisabled ? " disabled" : ""}`}
                onClick={handleSendButtonClick}
                initial={{ opacity: 0 }}
                animate={{ opacity: sendDisabled ? 0.6 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {isLoading ? <FiSquare style={{ fontSize: "13px", fill: "currentColor" }} /> : <FiArrowUp />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      <input
        type="file"
        accept={imageOnly ? "image/*" : "*/*"}
        multiple
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={async (e) => {
          const files = Array.from(e.target.files);
          await processFiles(files);
          e.target.value = "";
        }}
      />

      <ToolModal
        isOpen={isMCPModalOpen}
        onClose={handleMCPModalClose}
        onConfirm={handleMCPModalConfirm}
        currentMCPList={mcpList}
        canSearch={canToggleSearch}
        isSearch={isSearch}
        toggleSearch={toggleSearch}
        canResearch={canToggleResearch}
        isResearch={isResearch}
        toggleResearch={toggleResearch}
        canToggleMCP={canToggleMCP}
      />
    </motion.div>
  );
}

export default InputContainer;
