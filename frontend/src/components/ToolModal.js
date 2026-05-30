import React, { useState, useEffect, useCallback } from 'react';
import { BiCheck } from 'react-icons/bi';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/ToolModal.css';

const ToolModal = ({ isOpen, onClose, onConfirm, currentMCPList, canSearch, isSearch, toggleSearch, canResearch, isResearch, toggleResearch, canToggleMCP }) => {
  const [selectedServers, setSelectedServers] = useState([]);
  const [availableServers, setAvailableServers] = useState([]);
  const [error, setError] = useState(null);

  const fetchMCPServers = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/mcp-servers`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error('서버 목록을 불러올 수 없습니다.');
      setAvailableServers(await response.json());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (isOpen && currentMCPList) setSelectedServers(currentMCPList);
  }, [isOpen, currentMCPList]);

  useEffect(() => {
    if (isOpen && canToggleMCP) fetchMCPServers();
  }, [isOpen, canToggleMCP, fetchMCPServers]);

  const handleServerToggle = (serverId) => {
    setSelectedServers(prev =>
      prev.includes(serverId) ? prev.filter(id => id !== serverId) : [...prev, serverId]
    );
  };

  const handleConfirm = () => {
    onConfirm(selectedServers);
    onClose();
  };

  const handleCancel = () => {
    setSelectedServers(currentMCPList || []);
    onClose();
  };

  const selectedCount = selectedServers.length + (isSearch ? 1 : 0) + (isResearch ? 1 : 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="tool-modal-overlay"
          onClick={handleCancel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="tool-modal-content"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="tool-modal-header">
              <span>도구 선택</span>
              <span className="tool-selected-count">{selectedCount}개 선택됨</span>
            </div>

            <div className="tool-modal-body">
              {!canSearch && !canResearch && !canToggleMCP ? (
                <div className="tool-error-text">사용 가능한 도구가 없습니다.</div>
              ) : (
                <>
                  {canSearch && (
                    <div
                      className={`tool-server-item${isSearch ? ' selected' : ''}`}
                      onClick={toggleSearch}
                    >
                      <div className="tool-server-info">
                        <div className="tool-server-name">Web Search</div>
                        <div className="tool-server-description">실시간 웹 검색</div>
                      </div>
                      {isSearch && <BiCheck className="tool-check-icon" />}
                    </div>
                  )}
                  {canResearch && (
                    <div
                      className={`tool-server-item${isResearch ? ' selected' : ''}`}
                      onClick={toggleResearch}
                    >
                      <div className="tool-server-info">
                        <div className="tool-server-name">Research</div>
                        <div className="tool-server-description">심층 조사 수행</div>
                      </div>
                      {isResearch && <BiCheck className="tool-check-icon" />}
                    </div>
                  )}
                  {canToggleMCP && (
                    error ? (
                      <div className="tool-error-text">{error}</div>
                    ) : (
                      availableServers.map((server) => {
                        const selected = selectedServers.includes(server.id);
                        return (
                          <div
                            key={server.id}
                            className={`tool-server-item${selected ? ' selected' : ''}`}
                            onClick={() => handleServerToggle(server.id)}
                          >
                            <div className="tool-server-info">
                              <div className="tool-server-name">{server.name?.replace(/_/g, ' ')}</div>
                              {server.description && (
                                <div className="tool-server-description">{server.description}</div>
                              )}
                            </div>
                            {selected && <BiCheck className="tool-check-icon" />}
                          </div>
                        );
                      })
                    )
                  )}
                </>
              )}
            </div>

            <div className="tool-modal-footer">
              <button className="tool-btn-cancel" onClick={handleCancel}>취소</button>
              <button className="tool-btn-confirm" onClick={handleConfirm}>확인</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ToolModal;
