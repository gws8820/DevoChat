import React, { useState } from "react";
import "../styles/Tooltip.css";

function Tooltip({ content, children, position = "bottom", isTouch = false, enabled = true }) {
  const [visible, setVisible] = useState(false);

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
        <div className={`tooltip-box tooltip-${position}`}>
          {content}
        </div>
      )}
    </span>
  );
}

export default Tooltip;