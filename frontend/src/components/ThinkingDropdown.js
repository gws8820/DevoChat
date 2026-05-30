import { useState, useEffect, useRef, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsContext } from "../contexts/SettingsContext";

function ThinkingModeDropdown() {
  const {
    isReasoning,
    reason,
    models,
    model,
    canToggleReasoning,
    setReason,
    toggleReasoning,
  } = useContext(SettingsContext);

  const selectedModel = models.find(m => m.model_name === model);
  const reasonLevels = selectedModel?.controls?.reason?.levels ?? [];

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isDropdownOpen) setIsSubmenuOpen(false);
  }, [isDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isDropdownOpen && wrapperRef.current && !wrapperRef.current.contains(e.target))
        setIsDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  const label = !isReasoning ? "Standard" : (reasonLevels.length > 0 && reason) ? `Thinking ${reason}` : "Thinking";

  const isStandardDisabled = !canToggleReasoning && isReasoning;
  const isThinkingDisabled = !canToggleReasoning && !isReasoning;

  return (
    <div
      className="thinking-button"
      ref={wrapperRef}
      onClick={() => setIsDropdownOpen(p => !p)}
    >
      {label}
      <AnimatePresence>
        {isDropdownOpen && (
          <motion.div
            className="thinking-dropdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`thinking-option${isStandardDisabled ? " disabled" : ""}`}
              onClick={isStandardDisabled ? (e) => e.stopPropagation() : (e) => { e.stopPropagation(); if (isReasoning) toggleReasoning(); setIsDropdownOpen(false); }}
            >
              <div className="thinking-option-content">
                <span className="thinking-option-label">Standard</span>
                <span className="thinking-option-desc">대부분의 질문에 적합</span>
              </div>
            </div>
            {reasonLevels.length > 0 && !isThinkingDisabled ? (
              <div
                className={`thinking-option thinking-has-submenu${isSubmenuOpen ? " open" : ""}`}
                onClick={(e) => { e.stopPropagation(); setIsSubmenuOpen(p => !p); }}
              >
                <div className="thinking-option-content">
                  <span className="thinking-option-label">Thinking</span>
                  <span className="thinking-option-desc">복잡한 문제 해결</span>
                </div>
                <span className="thinking-option-arrow">›</span>
                <div className="thinking-submenu">
                  {reasonLevels.map(level => (
                    <div
                      key={level}
                      className="thinking-sub-option"
                      onClick={(e) => { e.stopPropagation(); if (!isReasoning) toggleReasoning(); setReason(level); setIsDropdownOpen(false); }}
                    >
                      <span className="thinking-option-label">{level}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className={`thinking-option${isThinkingDisabled ? " disabled" : ""}`}
                onClick={isThinkingDisabled ? (e) => e.stopPropagation() : (e) => { e.stopPropagation(); if (!isReasoning) toggleReasoning(); setIsDropdownOpen(false); }}
              >
                <div className="thinking-option-content">
                  <span className="thinking-option-label">Thinking</span>
                  <span className="thinking-option-desc">복잡한 문제 해결</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ThinkingModeDropdown;
