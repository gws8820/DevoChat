import React, { useState, useContext, useRef, useEffect } from "react";
import { useLocation } from 'react-router-dom';
import { RiMenuLine, RiArrowRightSLine, RiShare2Line, RiLightbulbLine, RiEdit2Line } from "react-icons/ri";
import { GoCopy } from "react-icons/go";
import { SettingsContext } from "../contexts/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from 'uuid';
import Tooltip from "./Tooltip";
import modelsData from "../models.json";
import "../styles/Header.css";

function Header({ toggleSidebar, isSidebarVisible, isTouch, chatMessageRef }) {
  const {
    model,
    modelType,
    alias,
    temperature,
    reason,
    systemMessage,
    updateModel,
    setTemperature,
    setReason,
    setSystemMessage,
    isImage,
    isSearchButton,
    isInferenceButton
  } = useContext(SettingsContext);

  const location = useLocation();
  const conversation_id = location.pathname.split('/chat/')[1];

  const models = modelsData.models;
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isTempSliderOpen, setIsTempSliderOpen] = useState(false);
  const [isReasonSliderOpen, setIsReasonSliderOpen] = useState(false);
  const [isSystemMessageOpen, setIsSystemMessageOpen] = useState(false);
  const [copyModal, setCopyModal] = useState(false);

  const modelModalRef = useRef(null);
  const tempSliderRef = useRef(null);
  const reasonSliderRef = useRef(null);
  const systemMessageRef = useRef(null);

  let modelsList = models.filter((m) => {
    if (isImage && !m.capabilities?.image) return false;
    
    if ((isSearchButton && !m.capabilities?.search) || 
        (!isSearchButton && m.hidden === "search")) return false;
    
    if ((isInferenceButton && !m.inference) || 
        (!isInferenceButton && m.hidden === "inference")) return false;
    
    if (m.hidden === "all" && (!isSearchButton || !isInferenceButton)) return false;
    
    return true;
  });

  const currentModelAlias = models.find((m) => m.model_name === model)?.model_alias || "모델 선택";

  const getTempPosition = (value) => {
    const percent = value * 100;
    if (percent < 10) {
      return {
        left: "3%",
        transform: "translateX(-3%)",
      };
    } else if (percent > 90) {
      return {
        left: "97%",
        transform: "translateX(-97%)",
      };
    } else {
      return {
        left: `${percent}%`,
        transform: `translateX(-${percent}%)`,
      };
    }
  };

  const getReasonPosition = (value) => {
    if (value === 1) {
      return {
        color: "rgb(214, 70, 70)",
        left: "calc(0% - 2px)",
        transform: "translateX(0)",
      };
    } else if (value === 2) {
      return { left: "50%", transform: "translateX(-50%)" };
    } else if (value === 3) {
      return {
        color: "rgb(2, 133, 255)",
        left: "calc(100% + 4px)",
        transform: "translateX(-100%)",
      };
    }
    return {};
  };
  const reasonLabels = ["low", "medium", "high"];

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
        setCopyModal(true);
        setTimeout(() => setCopyModal(false), 2000);
      } catch (err) {
        console.error("복사 실패:", err);
      }

      const res = await fetch(
        `${process.env.REACT_APP_FASTAPI_URL}/upload_page`,
        {
          method: "POST",
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

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || res.status);
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
        isTempSliderOpen &&
        tempSliderRef.current &&
        !tempSliderRef.current.contains(event.target) &&
        !event.target.closest(".slider-icon")
      ) {
        setIsTempSliderOpen(false);
      }
      if (
        isSystemMessageOpen &&
        systemMessageRef.current &&
        !systemMessageRef.current.contains(event.target) &&
        !event.target.closest(".system-message-icon")
      ) {
        setIsSystemMessageOpen(false);
      }
      if (
        isReasonSliderOpen &&
        reasonSliderRef.current &&
        !reasonSliderRef.current.contains(event.target) &&
        !event.target.closest(".slider-icon")
      ) {
        setIsReasonSliderOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [
    isModelModalOpen,
    isTempSliderOpen,
    isSystemMessageOpen,
    isReasonSliderOpen,
  ]);

  return (
    <div className="header">
      <div className="header-left">
        {!isSidebarVisible && (
          <Tooltip content="사이드바 열기" position="right" isTouch={isTouch}>
            <div className="header-icon toggle-icon">
              <RiMenuLine onClick={toggleSidebar} />
            </div>
          </Tooltip>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentModelAlias}
            className="model-box"
            onClick={() => setIsModelModalOpen(true)}
            initial={{ x: -5, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {currentModelAlias}
            <RiArrowRightSLine className="expand-icon" />
          </motion.div>
        </AnimatePresence>
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

        <div className="header-icon-wrapper">
          <Tooltip
            content={
              modelType === "default"
                ? "온도 (창의성) 설정"
                : modelType === "reason"
                ? "추론 성능 설정"
                : "온도/추론 성능 설정"
            }
            position="left"
            isTouch={isTouch}
          >
            <div className="header-icon slider-icon">
              <RiLightbulbLine
                onClick={() => {
                  if (modelType === "default") {
                    setIsTempSliderOpen(!isTempSliderOpen);
                    setIsSystemMessageOpen(false);
                    setIsReasonSliderOpen(false);
                  } else if (modelType === "reason") {
                    setIsReasonSliderOpen(!isReasonSliderOpen);
                    setIsSystemMessageOpen(false);
                    setIsTempSliderOpen(false);
                  }
                }}
                className={
                  modelType === "default" || modelType === "reason" ? "" : "disabled"
                }
                style={{ strokeWidth: 0.3 }}
              />
            </div>
          </Tooltip>
          
          <AnimatePresence>
            {isTempSliderOpen && (
              <motion.div
                className="slider-container"
                ref={tempSliderRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="slider-wrapper">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
                    onChange={(e) =>
                      setTemperature(parseFloat(e.target.value))
                    }
                    className="temperature-slider"
                  />
                  <div
                    className="slider-value"
                    style={getTempPosition(temperature)}
                  >
                    {temperature}
                  </div>
                </div>
              </motion.div>
            )}
            {isReasonSliderOpen && (
              <motion.div
                className="slider-container"
                ref={reasonSliderRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="slider-wrapper">
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="1"
                    value={reason}
                    onChange={(e) => setReason(parseInt(e.target.value))}
                    className="reason-slider"
                  />
                  <div
                    className="slider-value"
                    style={getReasonPosition(reason)}
                  >
                    {reasonLabels[reason - 1]}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="header-icon-wrapper">
          <Tooltip content="지시어 설정" position="left" isTouch={isTouch}>
            <div className="header-icon system-message-icon">
              <RiEdit2Line
                onClick={() => {
                  if (modelType !== "none") {
                    setIsSystemMessageOpen(!isSystemMessageOpen);
                    setIsTempSliderOpen(false);
                    setIsReasonSliderOpen(false);
                  }
                }}
                className={modelType === "none" ? "disabled" : ""}
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
                <input
                  type="text"
                  value={systemMessage}
                  onChange={(e) => setSystemMessage(e.target.value)}
                  className="system-message-input"
                  placeholder="지시어를 입력하세요."
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {isModelModalOpen && (
          <motion.div
            className="hmodal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
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
                    <div className="model-alias">{m.model_alias}</div>
                    <div className="model-description">{m.description}</div>
                    <div className="model-pricing">In {m.in_billing}$ / Out {m.out_billing}$</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {copyModal && (
          <motion.div
            className="copy-modal"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, }}
            transition={{ duration: 0.3 }}
          >
            <GoCopy style={{ flexShrink: 0, marginRight: "6px", fontSize: "14px" }} />
            공유 링크가 복사되었습니다.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Header;