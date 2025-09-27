import React, { useEffect, useRef, useState, useContext } from "react";
import { useLocation } from 'react-router-dom';
import { RiMenuLine, RiArrowRightSLine, RiShare2Line } from "react-icons/ri";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from 'uuid';
import Tooltip from "./Tooltip";
import Toast from "./Toast";
import { SettingsContext } from "../contexts/SettingsContext";
import "../styles/Header.css";

function ImageHeader({ toggleSidebar, isSidebarOpen, isTouch, chatMessageRef }) {
  const { 
    imageModel, 
    imageModels, 
    updateImageModel,
    alias
  } = useContext(SettingsContext);
  
  const location = useLocation();
  const match = location.pathname.match(/^\/(?:chat|image)\/([^/]+)/);
  const conversation_id = match?.[1];

  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("error");
  const [showToast, setShowToast] = useState(false);
  
  const modelModalRef = useRef(null);
  
  let imageModelsList = imageModels.filter((m) => {
    if (m.variants?.base) return false;
    return true;
  });

  const currentModelAlias = imageModels.find((m) => m.model_name === imageModel)?.model_alias || "모델 선택";

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

export default ImageHeader;