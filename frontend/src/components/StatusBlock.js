import React, { useEffect, useMemo, useState } from "react";
import { GoChevronRight, GoChevronUp } from "react-icons/go";
import { motion, AnimatePresence } from "framer-motion";
import { PulseLoader } from "react-spinners";
import "../styles/StatusBlock.css";

const STATUS_CONFIG = {
  waiting: {
    label: "",
    loading: true,
  },
  "image-generating": {
    label: "이미지 생성 중",
    loading: true,
  },
  "remote-streaming": {
    label: "다른 창에서 응답 중",
    loading: true,
  },
  thinking: {
    expandable: true,
    activeLabel: "생각하는 중",
    closedLabel: "생각 열기",
    openLabel: "생각 닫기",
  },
  citations: {
    expandable: true,
    closedLabel: "출처 열기",
    openLabel: "출처 닫기",
  },
  tool: {
    expandable: true,
  },
};

function StatusBlock({
  type,
  children,
  init = false,
  isActive = false,
  activeLabel,
  label: labelOverride,
  loading = false,
  expandable,
  expanded,
  onToggle,
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [displayedLabel, setDisplayedLabel] = useState("");
  const [isLabelFading, setIsLabelFading] = useState(false);
  const config = STATUS_CONFIG[type];
  const isControlled = typeof expanded === "boolean";
  const isExpanded = isControlled ? expanded : internalExpanded;
  const isExpandable = expandable ?? Boolean(config.expandable);
  const showSpinner = Boolean(loading || config.loading || (type === "thinking" && isActive));

  const label = useMemo(() => {
    if (labelOverride) return labelOverride;
    if (type === "thinking" && isActive) return activeLabel || config.activeLabel;
    if (isExpandable) return isExpanded ? config.openLabel : config.closedLabel;
    return config.label;
  }, [activeLabel, config, isActive, isExpanded, isExpandable, labelOverride, type]);
  const animateLabel = type === "thinking" && isActive;
  const renderedLabel = animateLabel ? displayedLabel : label;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
      return;
    }
    setInternalExpanded((prev) => !prev);
  };

  useEffect(() => {
    if (!animateLabel) {
      setIsLabelFading(false);
      return undefined;
    }

    if (label === displayedLabel) {
      return undefined;
    }

    if (!displayedLabel) {
      setDisplayedLabel(label);
      return undefined;
    }

    setIsLabelFading(true);
    const timer = setTimeout(() => {
      setDisplayedLabel(label);
      setIsLabelFading(false);
    }, 220);

    return () => clearTimeout(timer);
  }, [animateLabel, displayedLabel, label]);

  const statusContent = (
    <>
      {showSpinner && (
        <PulseLoader
          className="status-spinner"
          color="currentColor"
          size={4}
          margin={1.5}
          speedMultiplier={0.8}
        />
      )}
      {renderedLabel && (
        <span className={`status-label${animateLabel ? " animated" : ""}${isLabelFading ? " fading" : ""}`}>
          {renderedLabel}
        </span>
      )}
      {isExpandable && (
        isExpanded ? <GoChevronUp strokeWidth={1} /> : <GoChevronRight strokeWidth={1} />
      )}
    </>
  );

  const className = `status-block ${type}${init ? " init" : ""}`;

  return (
    <div className={className}>
      {isExpandable ? (
        <div
          className="status-block-header expandable"
          onClick={handleToggle}
        >
          {statusContent}
        </div>
      ) : (
        <div className="status-block-header">
          {statusContent}
        </div>
      )}

      {isExpandable && (
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              className="status-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

export default React.memo(StatusBlock);
