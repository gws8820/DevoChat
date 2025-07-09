import React from 'react';
import { GoCheck, GoX, GoChevronDown, GoChevronUp } from 'react-icons/go';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCPBlockState } from './MarkdownRenderers';
import '../styles/MCPBlock.css';

const MCPBlock = React.memo(({ toolData }) => {
  const { expandedBlocks, toggleExpanded } = useMCPBlockState();
  const toolId = toolData.tool_id;
  const isExpanded = expandedBlocks[toolId] || false;

  const handleToggleExpanded = () => {
    toggleExpanded(toolId);
  };

  const renderIcon = () => {
    if (toolData.type === 'mcp_tool_use') {
      return toolData.isValid ? 
        <AiOutlineLoading3Quarters className="mcp-icon loading" /> :
        <GoX className="mcp-icon error" />;
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
            <span className="mcp-server-name">{toolData.server_name.replace(/_/g, ' ')}</span>
            <span className="mcp-tool-name">{toolData.tool_name}</span>
          </div>
        </div>
        
        {hasResult && (
          <button 
            className="mcp-expand-btn"
            onClick={handleToggleExpanded}
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
}, (prevProps, nextProps) => {
  const prevData = prevProps.toolData;
  const nextData = nextProps.toolData;
  
  return (
    prevData.type === nextData.type &&
    prevData.tool_id === nextData.tool_id &&
    prevData.server_name === nextData.server_name &&
    prevData.tool_name === nextData.tool_name &&
    prevData.is_error === nextData.is_error &&
    prevData.result === nextData.result &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.isLastMessage === nextProps.isLastMessage
  );
});

export default MCPBlock; 