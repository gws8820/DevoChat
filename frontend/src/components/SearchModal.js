import React, { useEffect, useRef, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RiCloseLine } from "react-icons/ri";
import { IoMdStar } from "react-icons/io";
import "../styles/SearchModal.css";

function SearchModal({
  isVisible,
  onClose,
  searchQuery,
  setChangeQuery,
  sortedConversations,
  onSelectConversation,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isVisible]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return sortedConversations;
    
    const query = searchQuery.toLowerCase().trim();
    return sortedConversations.filter(conv => 
      conv.alias.toLowerCase().includes(query)
    );
  }, [sortedConversations, searchQuery]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="search-modal-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="search-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="search-modal-input-container">
              <input
                type="text"
                placeholder="검색어를 입력하세요."
                value={searchQuery}
                onChange={(e) => setChangeQuery(e.target.value)}
                className="search-modal-input"
                ref={inputRef}
              />
              <div className="search-close" onClick={onClose}>
                <RiCloseLine />
              </div>
            </div>
            <div className="search-results">
              {filteredConversations.map((conv) => (
                <div
                  key={conv.conversation_id}
                  className="conversation-item search"
                  onClick={() => {
                    onSelectConversation(conv.conversation_id);
                    onClose();
                  }}
                >
                  <span className="conversation-text search">{conv.alias}</span>
                  {conv.starred && (
                    <div className={`star-icon ${conv.starred ? `starred` : ''} no-click`}>
                      <IoMdStar />
                    </div>
                  )}
                </div>
              ))}
              {filteredConversations.length === 0 && searchQuery.trim() && (
                <div className="no-result">검색 결과가 없습니다.</div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SearchModal;
