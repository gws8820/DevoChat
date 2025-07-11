import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipLoader } from "react-spinners";
import '../styles/MCPModal.css';

const MCPModal = ({ isOpen, onClose, onConfirm, currentMCPList, userInfo }) => {
  const [selectedServers, setSelectedServers] = useState([]);
  const [availableServers, setAvailableServers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMCPServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/mcp-servers`);
      if (!response.ok) {
        throw new Error('서버 목록을 불러올 수 없습니다.');
      }
      
      const servers = await response.json();
      
      const filteredServers = servers.filter(server => {
        if (userInfo?.admin) {
          return true;
        }
        return !server.admin;
      });
      
      setAvailableServers(filteredServers);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userInfo?.admin]);

  useEffect(() => {
    if (isOpen && currentMCPList) {
      setSelectedServers(currentMCPList);
    }
  }, [isOpen, currentMCPList]);

  useEffect(() => {
    if (isOpen) {
      fetchMCPServers();
    }
  }, [isOpen, fetchMCPServers]);

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
              {loading && (
                <div className="mcp-loading-container">
                  <ClipLoader loading={true} size={40} />
                </div>
              )}
              
              {error && (
                <div className="mcp-error-container">
                  <div className="mcp-error-text">{error}</div>
                </div>
              )}
              
              {!loading && !error && availableServers.map((server) => (
                <div
                    key={server.id}
                    className={`mcp-server-item ${selectedServers.includes(server.id) ? 'selected' : ''}`}
                    onClick={() => handleServerToggle(server.id)}
                >
                  <div className="mcp-server-icon">
                    <img 
                      src={`${process.env.REACT_APP_FASTAPI_URL}${server.icon}`} 
                      alt=""
                      height={35}
                    />
                  </div>
                  
                  <div className="mcp-server-name">
                    {server.name.replace(/_/g, ' ')}
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
                disabled={loading}
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