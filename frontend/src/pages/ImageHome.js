import React, { useState, useEffect, useCallback, useRef, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { IoImageOutline } from "react-icons/io5";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { useFileUpload } from "../utils/useFileUpload";
import Toast from "../components/Toast";
import InputContainer from "../components/InputContainer";
import "../styles/Common.css";

function ImageHome({ isTouch, userInfo }) {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const abortControllerRef = useRef(null);

  const welcomeMessage = useMemo(() => {
    const h = new Date().getHours();
    const name = userInfo?.name?.split(' ')[0];

    const morning = [
      `좋은 아침이에요, ${name}님.`,
      "아침에 떠오르는 이미지가 있나요?",
      "오늘 하루도 잘 부탁드려요.",
    ];
    const afternoon = [
      `즐거운 오후입니다, ${name}님!`,
      "오후엔 어떤 장면을 그려볼까요?",
    ];
    const evening = [
      "오늘 하루 수고 많으셨어요.",
      "벌써 하루가 끝나가네요.",
    ];
    const night = [
      `늦은 밤이네요, ${name}님.`,
      "밤에 떠오른 그 장면, 그려드릴게요.",
    ];
    const general = [
      `반갑습니다, ${name}님.`,
      `오늘도 잘 부탁드려요, ${name}님.`,
      "어떤 이미지를 만들어 드릴까요?",
      "어떤 장면을 상상하고 계신가요?",
      "어떤 그림을 그려볼까요?",
      "상상하는 장면을 설명해 주세요.",
      `잘 오셨어요, ${name}님.`,
    ];

    let pool;
    if (h >= 5 && h < 12) pool = morning;
    else if (h >= 12 && h < 17) pool = afternoon;
    else if (h >= 17 && h < 21) pool = evening;
    else pool = night;

    const combined = [...pool, ...general];
    return combined[Math.floor(Math.random() * combined.length)];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    canVision,
    maxImageInput,
    switchImageMode,
    setHasImage
  } = useContext(SettingsContext);

  const { addConversation } = useContext(ConversationsContext);

  const {
    uploadedFiles,
    processFiles,
    removeFile
  } = useFileUpload([]);

  const uploadingFiles = uploadedFiles.some((file) => !file.content);

  useEffect(() => {
    const hasUploadedImages = uploadedFiles.length > 0;
    switchImageMode(hasUploadedImages);
    setHasImage(hasUploadedImages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFiles, switchImageMode]);

  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim() || uploadingFiles) return;
      try {
        setIsLoading(true);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/image/new_conversation`, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        if (!res.ok) {
          throw new Error('새 대화를 시작하는 데 실패했습니다.');
        }
        
        const data = await res.json();
        const newConversation = {
          type: "image",
          conversation_id: data.conversation_id,
          alias: "새 대화",
          starred: false,
          starred_at: null,
          created_at: data.created_at,
          updated_at: data.updated_at,
          isLoading: true
        };
        addConversation(newConversation);

        navigate(`/image/${data.conversation_id}`, {
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
      } finally {
        abortControllerRef.current = null;
      }
    },
    [navigate, uploadedFiles, uploadingFiles, addConversation]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
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
      if (!canVision) {
        e.stopPropagation();
        return;
      }
      
      const imageFiles = files.filter((file) => file.type && file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        setToastMessage("이미지만 업로드할 수 있습니다.");
        setShowToast(true);
        return;
      }
      await processFiles(imageFiles, (errorMessage) => {
        setToastMessage(errorMessage);
        setShowToast(true);
      }, canVision, maxImageInput);
    },
    [processFiles, canVision, maxImageInput]
  );

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
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {welcomeMessage}
        </motion.div>
      </div>

      <InputContainer
        isTouch={isTouch}
        placeholder="프롬프트 입력"
        inputText={inputText}
        setInputText={setInputText}
        isLoading={isLoading}
        onSend={sendMessage}
        onCancel={cancelRequest}
        uploadedFiles={uploadedFiles}
        processFiles={processFiles}
        removeFile={removeFile}
        uploadingFiles={uploadingFiles}
        imageOnly={true}
      />

      <AnimatePresence>
        {isDragActive && canVision && (
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
              <div className="drag-text">여기에 이미지를 추가하세요</div>
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

export default React.memo(ImageHome);
