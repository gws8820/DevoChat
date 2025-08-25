import React, { useEffect, useRef, useState, useContext } from "react";
import { RiMenuLine, RiArrowRightSLine } from "react-icons/ri";
import { motion, AnimatePresence } from "framer-motion";
import Tooltip from "./Tooltip";
import { SettingsContext } from "../contexts/SettingsContext";
import "../styles/Header.css";

function ImageHeader({ toggleSidebar, isSidebarOpen, isTouch }) {
  const { 
    imageModel, 
    imageModels, 
    updateImageModel
  } = useContext(SettingsContext);
  
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const modelModalRef = useRef(null);
  
  let imageModelsList = imageModels.filter((m) => {
    if (m.variants?.base) return false;
    return true;
  });

  const currentModelAlias = imageModels.find((m) => m.model_name === imageModel)?.model_alias || "모델 선택";

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isModelModalOpen && modelModalRef.current && !modelModalRef.current.contains(event.target)) {
        setIsModelModalOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isModelModalOpen]);

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
                {imageModelsList?.map((m, index) => (
                  <div
                    className="model-item"
                    key={index}
                    onClick={() => {
                      updateImageModel(m.model_name);
                      setIsModelModalOpen(false);
                    }}
                  >
                    <div className="model-alias">{m.model_alias}</div>
                    <div className="model-description">{m.description}</div>
                    <div className="model-pricing">{parseFloat(((parseFloat(m.billing?.in_billing) + parseFloat(m.billing?.out_billing)) * 100).toFixed(1))}$ / 100회</div>
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

export default ImageHeader;