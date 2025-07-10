import React from 'react';
import { GoCheck, GoX, GoChevronDown, GoChevronUp } from 'react-icons/go';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { motion, AnimatePresence } from 'framer-motion';
import { useToolBlockState } from './MarkdownRenderers';
import '../styles/ToolBlock.css';

const ToolBlock = React.memo(({ toolData }) => {
  const { expandedBlocks, toggleExpanded } = useToolBlockState();
  const toolId = toolData.tool_id;
  const isExpanded = expandedBlocks[toolId] || false;

  const handleToggleExpanded = () => {
    toggleExpanded(toolId);
  };

  const renderIcon = () => {
    if (toolData.type === 'tool_use') {
      return toolData.isValid ? 
        <AiOutlineLoading3Quarters className="tool-icon loading" /> :
        <GoX className="tool-icon error" />;
    }
    
    if (toolData.type === 'tool_result') {
      return toolData.is_error ? 
        <GoX className="tool-icon error" /> : 
        <GoCheck className="tool-icon success" />;
    }
    
    return null;
  };

  const hasResult = toolData.type === 'tool_result' && toolData.result.trim();

  return (
    <div className="tool-block">
      <div className="tool-header">
        <div className="tool-content">
          {renderIcon()}
          <div className="tool-info">
            <span className="tool-server-name">{toolData.server_name.replace(/_/g, ' ')}</span>
            <span className="tool-tool-name">{toolData.tool_name}</span>
          </div>
        </div>
        
        {hasResult && (
          <button 
            className="tool-expand-btn"
            onClick={handleToggleExpanded}
          >
            {isExpanded ? <GoChevronUp /> : <GoChevronDown />}
          </button>
        )}
      </div>
      
      <AnimatePresence>
        {hasResult && isExpanded && (
          <motion.div
            className="tool-result"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <pre className="tool-result-content">{toolData.result}</pre>
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

export default ToolBlock; 