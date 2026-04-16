import React, { useState } from "react";
import "../styles/Tooltip.css";

const SUPPORTED_POSITIONS = new Set(["top", "right", "bottom", "left", "overlay"]);

function Tooltip({ content, children, position = "bottom", isTouch = false, enabled = true }) {
  const [visible, setVisible] = useState(false);
  const normalizedPosition = SUPPORTED_POSITIONS.has(position) ? position : "bottom";

  if (isTouch || !enabled) {
    return children;
  }

  return (
    <span
      className="tooltip-wrapper"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className={`tooltip-box tooltip-${normalizedPosition}`}>
          {content}
        </div>
      )}
    </span>
  );
}

export default Tooltip;
