import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import mcpServers from '../mcp_servers.json';
import '../styles/MCPModal.css';

const MCPModal = ({ isOpen, onClose, onConfirm, currentMCPList, userInfo }) => {
  const [selectedServers, setSelectedServers] = useState([]);

  useEffect(() => {
    if (isOpen && currentMCPList) {
      setSelectedServers(currentMCPList);
    }
  }, [isOpen, currentMCPList]);

  const availableServers = mcpServers.filter(server => {
    if (userInfo?.admin) {
      return true;
    }
    return !server.admin;
  });

  const handleServerToggle = (serverId) => {
    setSelectedServers(prev => {
      if (prev.includes(serverId)) {
        return prev.filter(id => id !== serverId);
      } else {
        return [...prev, serverId];
      }
    });
  };

  const handleConfirm = () => {
    onConfirm(selectedServers);
    onClose();
  };

  const handleCancel = () => {
    setSelectedServers(currentMCPList || []);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="mcp-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={handleCancel}
        >
          <motion.div
            className="mcp-modal-content"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mcp-modal-header">
              MCP 서버 선택
            </div>

            <div className="mcp-modal-body">
              {availableServers.map((server) => (
                <div
                    key={server.id}
                    className={`mcp-server-item ${selectedServers.includes(server.id) ? 'selected' : ''}`}
                    onClick={() => handleServerToggle(server.id)}
                >
                  <div className="mcp-server-icon">
                    <img 
                      src={server.icon} 
                      alt={server.name}
                      height={35}
                    />
                  </div>
                  
                  <div className="mcp-server-name">
                    {server.name}
                  </div>
                  <div className="mcp-server-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedServers.includes(server.id)}
                      onChange={() => handleServerToggle(server.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mcp-modal-footer">
              <button 
                className="mcp-modal-button cancel"
                onClick={handleCancel}
              >
                취소
              </button>
              <button 
                className="mcp-modal-button confirm"
                onClick={handleConfirm}
              >
                확인
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MCPModal; 