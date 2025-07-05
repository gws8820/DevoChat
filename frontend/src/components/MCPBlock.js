import React, { useState } from 'react';
import { GoCheck, GoX, GoChevronDown, GoChevronUp } from 'react-icons/go';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/MCPBlock.css';

const MCPBlock = ({ toolData }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(prev => !prev);
  };

  const renderIcon = () => {
    if (toolData.type === 'mcp_tool_use') {
      return <AiOutlineLoading3Quarters className="mcp-icon loading" />;
    }
    
    if (toolData.type === 'mcp_tool_result') {
      return toolData.is_error ? 
        <GoX className="mcp-icon error" /> : 
        <GoCheck className="mcp-icon success" />;
    }
    
    return null;
  };

  const hasResult = toolData.type === 'mcp_tool_result';

  return (
    <div className="mcp-block">
      <div className="mcp-header">
        <div className="mcp-content">
          {renderIcon()}
          <div className="mcp-info">
            <span className="mcp-server-name">{toolData.server_name}</span>
            <span className="mcp-tool-name">{toolData.tool_name}</span>
          </div>
        </div>
        
        {hasResult && (
          <button 
            className="mcp-expand-btn"
            onClick={toggleExpanded}
          >
            {isExpanded ? <GoChevronUp /> : <GoChevronDown />}
          </button>
        )}
      </div>
      
      <AnimatePresence>
        {hasResult && isExpanded && (
          <motion.div
            className="mcp-result"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <pre className="mcp-result-content">{toolData.result}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MCPBlock; 