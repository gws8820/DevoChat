// src/components/Header.js
import React, { useState, useContext, useRef, useEffect } from "react";
import { BsLayoutTextSidebar, BsChevronRight, BsSliders, BsCodeSlash } from "react-icons/bs";
import { SettingsContext } from "../contexts/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";
import Tooltip from "./Tooltip";
import modelsData from "../models.json";
import "../styles/Header.css";

function Header({ toggleSidebar, isSidebarVisible, isTouch }) {
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
    isImage,
    isInference,
    isSearch,
    isFunctionOn,
  } = useContext(SettingsContext);

  const models = modelsData.models;
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isTempSliderOpen, setIsTempSliderOpen] = useState(false);
  const [isReasonSliderOpen, setIsReasonSliderOpen] = useState(false);
  const [isSystemMessageOpen, setIsSystemMessageOpen] = useState(false);

  const modelModalRef = useRef(null);
  const tempSliderRef = useRef(null);
  const reasonSliderRef = useRef(null);
  const systemMessageRef = useRef(null);

  let modelsList = models.filter((m) => {
    if (isFunctionOn) {
      if (isSearch && !m.capabilities?.search) return false;
      if (isInference && !m.inference) return false;
    }
    if (isImage && !m.capabilities?.image) return false;
    return true;
  });

  const currentModelAlias =
    models.find((m) => m.model_name === model)?.model_alias || "모델 선택";

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
        {!isSidebarVisible &&
          (isTouch ? (
            <div className="header-icon toggle-icon">
              <BsLayoutTextSidebar
                onClick={toggleSidebar}
                style={{ strokeWidth: 0.3 }}
              />
            </div>
          ) : (
            <Tooltip content="사이드바 열기" position="right">
              <div className="header-icon toggle-icon">
                <BsLayoutTextSidebar
                  onClick={toggleSidebar}
                  style={{ strokeWidth: 0.3 }}
                />
              </div>
            </Tooltip>
          ))}
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
            <BsChevronRight className="expand-icon" />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="header-right">
        {isTouch ? (
          <div className="header-icon slider-icon">
            <BsSliders
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
            <AnimatePresence>
              {isTempSliderOpen && (
                <motion.div
                  className="slider-container"
                  ref={tempSliderRef}
                  initial={{ x: 5, opacity: 0, translateY: "-50%" }}
                  animate={{ x: 0, opacity: 1, translateY: "-50%" }}
                  exit={{ x: 5, opacity: 0, translateY: "-50%" }}
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
                  initial={{ x: 5, opacity: 0, translateY: "-50%" }}
                  animate={{ x: 0, opacity: 1, translateY: "-50%" }}
                  exit={{ x: 5, opacity: 0, translateY: "-50%" }}
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
        ) : (
          <Tooltip
            content={
              modelType === "default"
                ? "온도 (창의성) 설정"
                : modelType === "reason"
                ? "추론 성능 설정"
                : "온도/추론 성능 설정"
            }
            position="left"
          >
            <div className="header-icon slider-icon">
              <BsSliders
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
              <AnimatePresence>
                {isTempSliderOpen && (
                  <motion.div
                    className="slider-container"
                    ref={tempSliderRef}
                    initial={{ x: 5, opacity: 0, translateY: "-50%" }}
                    animate={{ x: 0, opacity: 1, translateY: "-50%" }}
                    exit={{ x: 5, opacity: 0, translateY: "-50%" }}
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
                    initial={{ x: 5, opacity: 0, translateY: "-50%" }}
                    animate={{ x: 0, opacity: 1, translateY: "-50%" }}
                    exit={{ x: 5, opacity: 0, translateY: "-50%" }}
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
          </Tooltip>
        )}

        {isTouch ? (
          <div className="header-icon system-message-icon">
            <BsCodeSlash
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
            <AnimatePresence>
              {isSystemMessageOpen && (
                <motion.div
                  className="system-message-container"
                  ref={systemMessageRef}
                  initial={{ x: 50, opacity: 0, translateY: "-50%" }}
                  animate={{ x: 0, opacity: 1, translateY: "-50%" }}
                  exit={{ x: 50, opacity: 0, translateY: "-50%" }}
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
        ) : (
          <Tooltip content="지시어 설정" position="left">
            <div className="header-icon system-message-icon">
              <BsCodeSlash
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
              <AnimatePresence>
                {isSystemMessageOpen && (
                  <motion.div
                    className="system-message-container"
                    ref={systemMessageRef}
                    initial={{ x: 50, opacity: 0, translateY: "-50%" }}
                    animate={{ x: 0, opacity: 1, translateY: "-50%" }}
                    exit={{ x: 50, opacity: 0, translateY: "-50%" }}
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
          </Tooltip>
        )}
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
    </div>
  );
}

export default Header;