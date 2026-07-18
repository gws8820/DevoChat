import React, { useState, useContext, useRef, useEffect } from "react";
import { useLocation, useNavigate } from 'react-router-dom';
import { RiMenuLine, RiArrowRightSLine, RiShare2Line, RiLightbulbLine, RiEdit2Line, RiImage2Line, RiCloseLine } from "react-icons/ri";
import { SettingsContext } from "../contexts/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";
import logo from "../resources/logo.png";

import Tooltip from "./Tooltip";
import { useToast } from "../contexts/ToastContext";
import copyToClipboard from "../utils/copyToClipboard";
import "../styles/Header.css";

function Header({ toggleSidebar, isSidebarOpen, isTouch }) {
  const {
    models,
    model,
    imageModels,
    imageModel,
    verbosity,
    memory,
    instructions,
    hasImage,
    canControlVerbosity,
    canControlSystemMessage,
    isDAN,
    updateModel,
    updateImageModel,
    setVerbosity,
    setMemory,
    setInstructions,
    setIsDAN
  } = useContext(SettingsContext);

  const location = useLocation();
  const navigate = useNavigate();
  const { pathname } = location;
  const isLogoOnly = pathname.startsWith("/view") || pathname.startsWith("/share");
  const isImage = pathname.startsWith("/image");
  const match = pathname.match(/^\/(?:chat|image)\/([^/]+)/);

  const activeModels = isImage ? imageModels : models;
  const activeModel = isImage ? imageModel : model;
  const activeUpdateModel = isImage ? updateImageModel : updateModel;

  const selectedModel = activeModels.find(m => m.model_name === activeModel);
  const verbosityLevels = selectedModel?.controls?.verbosity?.levels ?? [];
  const conversation_id = match?.[1];

  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [isSystemMessageOpen, setIsSystemMessageOpen] = useState(false);
  const { showToast } = useToast();
  const [localMemory, setLocalMemory] = useState(memory);
  const [localVerbosity, setLocalVerbosity] = useState(verbosity);

  const modelModalRef = useRef(null);
  const controlPanelRef = useRef(null);
  const instructionsRef = useRef(null);
  const memTimerRef = useRef(null);
  const verbosityTimerRef = useRef(null);

  useEffect(() => { setLocalMemory(memory); }, [memory]);
  useEffect(() => { setLocalVerbosity(verbosity); }, [verbosity]);

  const handleMemoryChange = (val) => {
    setLocalMemory(val);
    clearTimeout(memTimerRef.current);
    memTimerRef.current = setTimeout(() => setMemory(val), 150);
  };

  const handleVerbosityChange = (val) => {
    setLocalVerbosity(val);
    clearTimeout(verbosityTimerRef.current);
    verbosityTimerRef.current = setTimeout(() => setVerbosity(val), 150);
  };

  const modelsList = activeModels.filter(m => !m.variants?.base);
  const currentModelAlias = activeModels.find(m => m.model_name === activeModel)?.model_alias || "모델 선택";

  const handleShare = async () => {
    try {
      if (!conversation_id) {
        throw new Error("공유할 대화를 찾을 수 없습니다.");
      }

      const res = await fetch(
        `${process.env.REACT_APP_FASTAPI_URL}/share`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ conversation_id })
        }
      );

      if (res.status === 401) {
        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          window.location.href = '/login?expired=true';
        }
        return;
      }

      if (!res.ok) {
        let detail = null;
        try { detail = (await res.json())?.detail; } catch {}
        throw new Error(detail || String(res.status));
      }

      const data = await res.json();
      const shareUrl = `${window.location.origin}${data.path}`;
      await copyToClipboard(shareUrl);
      showToast("공유 링크가 복사되었습니다.", "copy");
    } catch (error) {
      console.error('링크 생성 실패:', error);
      showToast(error.message || "링크 생성에 실패했습니다.");
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isModelModalOpen &&
        modelModalRef.current &&
        !modelModalRef.current.contains(event.target)
      ) {
        setIsModelModalOpen(false);
      }
      if (
        isControlPanelOpen &&
        controlPanelRef.current &&
        !controlPanelRef.current.contains(event.target) &&
        !event.target.closest(".slider-icon")
      ) {
        setIsControlPanelOpen(false);
      }
      if (
        isSystemMessageOpen &&
        instructionsRef.current &&
        !instructionsRef.current.contains(event.target) &&
        !event.target.closest(".system-message-icon")
      ) {
        setIsSystemMessageOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isModelModalOpen, isControlPanelOpen, isSystemMessageOpen]);

  if (isLogoOnly) return (
    <div className="header" style={{ padding: "0 20px" }}>
      <img src={logo} alt="DEVOCHAT" width="143.5px" onClick={() => navigate("/")} style={{ cursor: "pointer" }} />
    </div>
  );

  if (isImage || pathname === "/" || pathname.startsWith("/chat/") || pathname.startsWith("/realtime")) return (
    <div className="header">
      <div className="header-left">
        {!isSidebarOpen && (
          <div className="header-icon menu-icon">
            <RiMenuLine onClick={toggleSidebar} />
          </div>
        )}
        <div className="model-box" onClick={() => setIsModelModalOpen(true)}>
          {currentModelAlias}
          <RiArrowRightSLine className="expand-icon" />
        </div>
      </div>

      <div className="header-right">
        {conversation_id && (
          <div className="header-icon-wrapper">
            <Tooltip content="공유하기" position="left" isTouch={isTouch}>
              <div className="header-icon share-icon">
                <RiShare2Line onClick={handleShare} />
              </div>
            </Tooltip>
          </div>
        )}

        {!isImage && (
          <AnimatePresence initial={false}>
            <motion.div
              className="header-icon-wrapper"
              key="controls"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <Tooltip content="파라미터 설정" position="left" isTouch={isTouch}>
                <div className="header-icon slider-icon">
                  <RiLightbulbLine
                    onClick={() => {
                      setIsControlPanelOpen(!isControlPanelOpen);
                      setIsSystemMessageOpen(false);
                    }}
                    style={{ strokeWidth: 0.3 }}
                  />
                </div>
              </Tooltip>

              <AnimatePresence>
                {isControlPanelOpen && (
                  <motion.div
                    className="slider-container"
                    ref={controlPanelRef}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {canControlVerbosity && (
                      <div className="slider-section">
                        <div className="slider-label">
                          <span>답변 길이</span>
                          <span className="slider-value">{localVerbosity}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={verbosityLevels.length - 1}
                          step={1}
                          value={verbosityLevels.indexOf(localVerbosity)}
                          onChange={(e) => handleVerbosityChange(verbosityLevels[parseInt(e.target.value)])}
                          className="slider"
                        />
                      </div>
                    )}
                    <div className="slider-section">
                      <div className="slider-label">
                        <span>대화 기억</span>
                        <span className="slider-value">
                          {localMemory === 0 ? "기억 안함" : `${localMemory}턴`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={12}
                        step={1}
                        value={localMemory}
                        onChange={(e) => handleMemoryChange(parseInt(e.target.value))}
                        className="slider"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {canControlSystemMessage && (
              <motion.div
                className="header-icon-wrapper"
                key="system"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Tooltip content="지시어 설정" position="left" isTouch={isTouch}>
                  <div className="header-icon system-message-icon">
                    <RiEdit2Line
                      onClick={() => {
                        setIsSystemMessageOpen(!isSystemMessageOpen);
                        setIsControlPanelOpen(false);
                      }}
                      style={{ fontSize: "20px", strokeWidth: 0.3 }}
                    />
                  </div>
                </Tooltip>

                <AnimatePresence>
                  {isSystemMessageOpen && (
                    <motion.div
                      className="system-message-container"
                      ref={instructionsRef}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="system-message-label">
                        <span>시스템 지시어 설정</span>
                        <span
                          className={`dan-toggle ${isDAN ? "active" : ""}`}
                          onClick={() => setIsDAN(!isDAN)}
                        >
                          DAN
                        </span>
                      </div>
                      <textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        className="system-message-input"
                        placeholder="내용을 입력하세요."
                        rows={5}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {isModelModalOpen && (
          <motion.div
            className="hmodal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button className="hmodal-close" onClick={() => setIsModelModalOpen(false)}>
              <RiCloseLine />
            </button>
            <div className="hmodal" ref={modelModalRef}>
              <div className="model-list">
                {modelsList.map((m, index) => {
                  const visionDisabled = hasImage && !m.capabilities?.vision;
                  return (
                    <Tooltip
                      key={index}
                      content="이미지 미지원 모델"
                      position="overlay"
                      isTouch={isTouch}
                      enabled={visionDisabled}
                    >
                      <div
                        className={`model-item${visionDisabled ? " disabled" : ""}`}
                        onClick={() => {
                          if (visionDisabled) return;
                          activeUpdateModel(m.model_name);
                          setIsModelModalOpen(false);
                        }}
                      >
                        <div className="model-alias">
                          {m.model_alias}
                          <div className="model-badge">
                            {m.capabilities?.vision && (
                              <RiImage2Line className="image-badge" />
                            )}
                          </div>
                        </div>
                        <div className="model-description">{m.description}</div>
                        <div className="model-pricing">
                          {isImage
                            ? `${parseFloat(((parseFloat(m.billing?.in_billing) + parseFloat(m.billing?.out_billing)) * 100).toFixed(1))}$ / 100회`
                            : `In ${m.billing?.in_billing}$ / Out ${m.billing?.out_billing}$`
                          }
                        </div>
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return null;
}

export default React.memo(Header);
