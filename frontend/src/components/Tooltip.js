import React, { useState } from "react";
import "../styles/Tooltip.css";

function Tooltip({ content, children, position = "bottom" }) {
  const [visible, setVisible] = useState(false);

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