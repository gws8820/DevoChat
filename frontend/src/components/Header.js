import React, { useState, useContext, useRef, useEffect } from "react";
import { useLocation } from 'react-router-dom';
import { RiMenuLine, RiArrowRightSLine, RiShare2Line, RiLightbulbLine, RiEdit2Line, RiImage2Line } from "react-icons/ri";
import { SettingsContext } from "../contexts/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from 'uuid';

import Tooltip from "./Tooltip";
import Toast from "./Toast";
import "../styles/Header.css";

function Header({ toggleSidebar, isSidebarOpen, isTouch, chatMessageRef }) {
  const {
    models,
    model,
    alias,
    temperature,
    reason,
    verbosity,
    systemMessage,
    hasImage,
    canControlTemp,
    canControlReason,
    canControlVerbosity,
    canControlSystemMessage,
    updateModel,
    setTemperature,
    setReason,
    setVerbosity,
    setSystemMessage
  } = useContext(SettingsContext);

  const location = useLocation();
  const match = location.pathname.match(/^\/(?:chat|image)\/([^/]+)/);
  const conversation_id = match?.[1];

  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [isSystemMessageOpen, setIsSystemMessageOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("error");
  const [showToast, setShowToast] = useState(false);

  const modelModalRef = useRef(null);
  const controlPanelRef = useRef(null);
  const systemMessageRef = useRef(null);

  let modelsList = models.filter((m) => {
    if (hasImage && !m.capabilities?.image) return false;
    if (m.variants?.base) return false;
    return true;
  });

  const currentModelAlias = models.find((m) => m.model_name === model)?.model_alias || "모델 선택";

  const toPercent = (value, max = 1) => {
    const pct = Math.round((value / max) * 100);
    return `${pct}%`;
  };

  const handleShare = async () => {
    try {
      const uniqueId = uuidv4();

      const containerClone = chatMessageRef.current.cloneNode(true);
      const elementsToRemove = containerClone.querySelectorAll('.message-function, .copy-button');
      elementsToRemove.forEach(el => {
        el.remove();
      });
      
      const htmlContent = containerClone.outerHTML;
      const stylesheets = [];
      
      const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
      linkElements.forEach(link => {
        if (link.href) {
          stylesheets.push(link.href);
        }
      });
      const styleElements = document.querySelectorAll('style');
      styleElements.forEach(style => {
        stylesheets.push(style.outerHTML);
      });

      try {
        await navigator.clipboard.writeText(`https://share.devochat.com/id/${uniqueId}`);
        setToastMessage("공유 링크가 복사되었습니다.");
        setToastType("copy");
        setShowToast(true);
      } catch (err) {
        console.error("복사 실패:", err);
      }

      const res = await fetch(
        `${process.env.REACT_APP_FASTAPI_URL}/upload_page`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            unique_id: uniqueId,
            html: htmlContent,
            stylesheets,
            title: alias
          })
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

    } catch (error) {
      console.error('링크 생성 실패:', error);
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
        systemMessageRef.current &&
        !systemMessageRef.current.contains(event.target) &&
        !event.target.closest(".system-message-icon")
      ) {
        setIsSystemMessageOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [
    isModelModalOpen,
    isControlPanelOpen,
    isSystemMessageOpen,
  ]);

  return (
    <div className="header">
      <div className="header-left">
        {!isSidebarOpen && (
          <Tooltip content="사이드바 열기" position="right" isTouch={isTouch}>
            <div className="header-icon menu-icon">
              <RiMenuLine onClick={toggleSidebar} />
            </div>
          </Tooltip>
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

        <AnimatePresence initial={false}>
          {(canControlTemp || canControlReason || canControlVerbosity) && (
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
                    {canControlTemp && (
                      <div className="slider-section">
                        <div className="slider-label">
                          <span>창의성</span>
                          <span className="slider-value">
                            {toPercent(temperature, 2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.01}
                          max={2}
                          step={0.01}
                          value={temperature}
                          onChange={(e) =>
                            setTemperature(parseFloat(e.target.value))
                          }
                          className="slider"
                        />
                      </div>
                    )}
                    {canControlReason && (
                      <div className="slider-section">
                        <div className="slider-label">
                          <span>추론 강도</span>
                          <span className="slider-value">
                            {toPercent(reason)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.01}
                          max={1}
                          step={0.01}
                          value={reason}
                          onChange={(e) => setReason(parseFloat(e.target.value))}
                          className="slider"
                        />
                      </div>
                    )}
                    {canControlVerbosity && (
                      <div className="slider-section">
                        <div className="slider-label">
                          <span>답변 길이</span>
                          <span className="slider-value">
                            {toPercent(verbosity)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.01}
                          max={1}
                          step={0.01}
                          value={verbosity}
                          onChange={(e) => setVerbosity(parseFloat(e.target.value))}
                          className="slider"
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
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
                    ref={systemMessageRef}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="system-message-label">
                      <span>시스템 지시어 설정</span>
                    </div>
                    <textarea
                      value={systemMessage}
                      onChange={(e) => setSystemMessage(e.target.value)}
                      className="system-message-input"
                      placeholder="내용을 입력하세요."
                      rows={4}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
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
            <div className="hmodal" ref={modelModalRef}>
              <div className="model-list">
                {modelsList.map((m, index) => (
                  <div
                    className="model-item"
                    key={index}
                    onClick={() => {
                      updateModel(m.model_name);
                      setIsModelModalOpen(false);
                    }}
                  >
                    <div className="model-alias">
                      {m.model_alias}
                      <div className="model-badge">
                        {m.capabilities?.image && (
                          <RiImage2Line className="image-badge" />
                        )}
                        {m.capabilities?.mcp && (
                          <span className="mcp-badge">MCP</span>
                        )}
                      </div>
                    </div>
                    <div className="model-description">{m.description}</div>
                    <div className="model-pricing">In {m.billing?.in_billing}$ / Out {m.billing?.out_billing}$</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast
        type={toastType}
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
        duration={2000}
      />
    </div>
  );
}

export default Header;