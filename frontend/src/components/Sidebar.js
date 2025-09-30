// src/components/Sidebar.js
import React, { useEffect, useState, useRef, useContext, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { RiMenuLine } from "react-icons/ri";
import { LuSearch, LuSquarePen, LuAudioLines, LuImage } from "react-icons/lu";
import { IoMdStar } from "react-icons/io";
import { FaUserCircle } from "react-icons/fa";
import { ClipLoader } from "react-spinners";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { motion, AnimatePresence } from "framer-motion";
import Modal from "./Modal";
import Tooltip from "./Tooltip";
import Toast from "./Toast";
import SearchModal from "./SearchModal";
import logo from "../logo.png";
import "../styles/Sidebar.css";

const ConversationItem = React.memo(({
  conv,
  currentConversationId,
  renamingConversationId,
  renameInputValue,
  setRenameInputValue,
  handleRename,
  setRenamingConversationId,
  handleNavigate,
  handleConversationContextMenu,
  handleTouchStart,
  handleTouchEnd,
  handleTouchMove,
  toggleStar,
  isTouch
}) => {
  const isRenaming = renamingConversationId === conv.conversation_id;
  const isActive = currentConversationId === conv.conversation_id;

  return (
    <motion.li
      key={conv.conversation_id}
      layout
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ 
        type: "tween",
        duration: 0.3,
        ease: "easeInOut"
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        handleConversationContextMenu(e, conv.conversation_id)
      }}
      onTouchStart={(e) => handleTouchStart(e, conv.conversation_id)}
      onTouchEnd={(e) => handleTouchEnd(e, conv.conversation_id)}
      onTouchMove={handleTouchMove}
      onTouchCancel={(e) => handleTouchEnd(e, conv.conversation_id)}
    >
      <div
        className={`conversation-item ${isActive ? "active-conversation" : ""}`}
        onClick={!isTouch ? () => {
          if (!isRenaming) {
            handleNavigate(conv.conversation_id);
          }
        } : undefined}
      >
        {isRenaming ? (
          <input
            type="text"
            className="rename-input"
            value={renameInputValue}
            onChange={(e) => setRenameInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleRename(conv.conversation_id, renameInputValue);
              } else if (e.key === "Escape") {
                setRenamingConversationId(null);
                setRenameInputValue("");
              }
            }}
            enterKeyHint="done"
            onBlur={() => {
              if (renameInputValue.trim()) {
                handleRename(conv.conversation_id, renameInputValue);
              } else {
                setRenamingConversationId(null);
                setRenameInputValue("");
              }
            }}
            autoFocus
          />
        ) : (
          <>
            {conv.isLoading ? (
              <motion.span
                key="loading"
                className="loading-text"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                로딩 중...
              </motion.span>
            ) : (
              <motion.span
                key="alias"
                className="conversation-text"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                {conv.alias}
              </motion.span>
            )}
          </>
        )}

        <div 
          className={`star-icon ${conv.starred ? `starred ${isTouch ? 'no-click' : ''}` : isTouch ? 'no-click hidden' : ''}`}  
          onClick={isTouch ? undefined : (e) => {toggleStar(conv.conversation_id, e)}}
        >
          <IoMdStar />
        </div>
      </div>
    </motion.li>
  );
});

function Sidebar({
  toggleSidebar,
  isSidebarOpen,
  isResponsive,
  isTouch,
  userInfo,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDropdown, setIsDropdown] = useState(false);
  const [modalMessage, setModalMessage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState(null);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [renamingConversationId, setRenamingConversationId] = useState(null);
  const [renameInputValue, setRenameInputValue] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });
  const userContainerRef = useRef(null);
  const longPressTimer = useRef(null);
  const contextMenuProtected = useRef(false);

  const { setAlias } = useContext(SettingsContext); 
  const { 
    conversations, 
    isLoadingChat, 
    deleteConversation, 
    deleteAllConversation, 
    updateConversation, 
    toggleStarConversation 
  } = useContext(ConversationsContext);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      
      if (a.starred && b.starred) {
        if (!a.starred_at) return 1;
        if (!b.starred_at) return -1;
        return new Date(b.starred_at) - new Date(a.starred_at);
      }
      
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [conversations]);

  const handleNavigate = useCallback((conversation_id) => {
    const conv = conversations.find(
      (c) => c.conversation_id === conversation_id
    );
    if (!conv) {
      setToastMessage("대화가 존재하지 않습니다.");
      setShowToast(true);
      return;
    }
    const targetPath = conv.type === 'image' ? `/image/${conversation_id}` : `/chat/${conversation_id}`;
    navigate(targetPath);
    if (isResponsive) toggleSidebar();
  }, [conversations, navigate, isResponsive, toggleSidebar]);

  const toggleStar = useCallback(async (conversation_id, e) => {
    e.stopPropagation();
    try {
      const conversation = conversations.find(c => c.conversation_id === conversation_id);
      if (!conversation) return;

      toggleStarConversation(conversation_id, !conversation.starred);
      
      const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}/star`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: !conversation.starred })
      });
      if (res.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          window.location.href = '/login?expired=true';
      }
      if (!res.ok) {
        throw new Error('즐겨찾기 토글이 실패했습니다.');
      }
    } catch (error) {
      setToastMessage("즐겨찾기 토글이 실패했습니다.");
      const conversation = conversations.find(c => c.conversation_id === conversation_id);
      if (conversation) {
        toggleStarConversation(conversation_id, conversation.starred);
      }
      setShowToast(true);
    }
  }, [conversations, toggleStarConversation]);

  const handleTouchStart = useCallback((e, conversation_id) => {
    setContextMenu(prev => ({ ...prev, visible: false }));
    
    longPressTimer.current = setTimeout(() => {
      setSelectedConversationId(conversation_id);
      setContextMenu({
        visible: true,
        x: e.touches[0].pageX,
        y: e.touches[0].pageY,
      });
      
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
      
      contextMenuProtected.current = true;
      setTimeout(() => {
        contextMenuProtected.current = false;
      }, 500);
      
      const preventDefaultOnce = (evt) => {
        evt.preventDefault();
        document.removeEventListener('contextmenu', preventDefaultOnce);
      };
      document.addEventListener('contextmenu', preventDefaultOnce);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback((e, conversation_id) => {
    if (contextMenu.visible) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      
      if (renamingConversationId !== conversation_id) {
        handleNavigate(conversation_id);
      }
    }
  }, [contextMenu.visible, renamingConversationId, handleNavigate]);

  const handleTouchMove = useCallback((e) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const match = location.pathname.match(/^\/(?:chat|image)\/([^/]+)/);
  const currentConversationId = match ? match[1] : null;

  const handleRename = useCallback(async (conversation_id, newAlias) => {
    try {
      updateConversation(conversation_id, newAlias);
      setRenamingConversationId(null);
      setRenameInputValue("");
  
      if (conversation_id === currentConversationId) {
        setAlias(newAlias);
      }
  
      const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}/rename`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: newAlias })
      });
      if (res.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        window.location.href = '/login?expired=true';
      }
      if (!res.ok) {
        throw new Error('대화 이름 편집에 실패했습니다.');
      }
    } catch (error) {
      console.error("Failed to rename conversation.", error);
      setToastMessage("대화 이름 편집에 실패했습니다.");
      setShowToast(true);
    }
  }, [updateConversation, currentConversationId, setAlias]);

  const handleDelete = useCallback(async (conversation_id) => {
    try {
      deleteConversation(conversation_id);
      if (currentConversationId === conversation_id)
        navigate("/");

      const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        window.location.href = '/login?expired=true';
      }
      if (!res.ok) {
        throw new Error('대화 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error("Failed to delete conversation.", error);
      setToastMessage("대화 삭제에 실패했습니다.");
      setShowToast(true);
    }
  }, [deleteConversation, currentConversationId, navigate]);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  const handleAdminClick = useCallback(() => {
    navigate("/admin");
    setIsDropdown(false);
    if (isResponsive) toggleSidebar();
  }, [navigate, isResponsive, toggleSidebar]);

  const handleDeleteAll = useCallback(() => {
    setModalMessage("정말 모든 대화를 삭제하시겠습니까?");
    setModalAction("deleteAll");
    setShowModal(true);
    setIsDropdown(false);
  }, []);

  const handleLogoutClick = useCallback(() => {
    setModalMessage("정말 로그아웃 하시겠습니까?");
    setModalAction("logout");
    setShowModal(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (modalAction === "deleteAll") {
      try {
        deleteAllConversation();
        navigate("/");

        {
          const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/conversation/all`, {
            method: 'DELETE',
            credentials: 'include'
          });
          if (res.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
            window.location.href = '/login?expired=true';
          }
          if (!res.ok) {
            throw new Error('대화 삭제에 실패했습니다.');
          }
        }
      } catch (error) {
        console.error("Failed to delete conversations.", error);
        setToastMessage("대화 삭제에 실패했습니다.");
        setShowToast(true);
      }
    } else if (modalAction === "logout") {
      try {
        {
          const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          if (res.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
            window.location.href = '/login?expired=true';
          }
          if (!res.ok) {
            let detail = null;
            try { detail = (await res.json())?.detail; } catch {}
            throw new Error(detail || '알 수 없는 오류가 발생했습니다.');
          }
        }
        window.location.href = '/login';
      } catch (error) {
        const detail = error.response?.data?.detail;
        setToastMessage(
          !Array.isArray(detail) && detail
            ? detail
            : "알 수 없는 오류가 발생했습니다."
        );
        setShowToast(true);
      }
    }
    setShowModal(false);
    setModalAction(null);
  }, [modalAction, deleteAllConversation, navigate]);

  const cancelDelete = useCallback(() => {
    setShowModal(false);
    setModalAction(null);
  }, []);

  const handleNewConversation = useCallback(() => {
    navigate("/");
    if (isResponsive) toggleSidebar();
  }, [navigate, isResponsive, toggleSidebar]);

  const handleRealtimeConversation = useCallback(() => {
    navigate("/realtime");
    if (isResponsive) toggleSidebar();
  }, [navigate, isResponsive, toggleSidebar]);

  const handleImageGeneration = useCallback(() => {
    navigate("/image");
    if (isResponsive) toggleSidebar();
  }, [navigate, isResponsive, toggleSidebar]);

  const handleConversationContextMenu = useCallback((e, conversation_id) => {
    e.preventDefault();
    if (renamingConversationId !== null) return;
    
    setSelectedConversationId(conversation_id);
    setContextMenu({
      visible: true,
      x: e.pageX,
      y: e.pageY,
    });
  }, [renamingConversationId]);
  
  useEffect(() => {
    const handleClickOutsideContextMenu = () => {
      if (contextMenu.visible && !contextMenuProtected.current) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    document.addEventListener("click", handleClickOutsideContextMenu);
    return () =>
      document.removeEventListener("click", handleClickOutsideContextMenu);
  }, [contextMenu.visible]);

  useEffect(() => {
    const handleClickOutsideDropdown = (e) => {
      if (
        userContainerRef.current &&
        !userContainerRef.current.contains(e.target)
      ) {
        setIsDropdown(false);
      }
    };
    if (isDropdown) {
      document.addEventListener("click", handleClickOutsideDropdown);
    }
    return () => {
      document.removeEventListener("click", handleClickOutsideDropdown);
    };
  }, [isDropdown]);

  useEffect(() => {
      setIsSearchVisible(false);
      setSearchQuery("");
  }, [isSidebarOpen]);

  

  const handleCustomAction = useCallback((action) => {
    if (action === "star") {
      if (selectedConversationId) {
        const conv = conversations.find(
          (c) => c.conversation_id === selectedConversationId
        );
        if (conv) {
          toggleStar(conv.conversation_id, { stopPropagation: () => {} });
        }
      }
    } else if (action === "rename") {
      if (selectedConversationId) {
        const conv = conversations.find(
          (c) => c.conversation_id === selectedConversationId
        );
        if (conv) {
          setRenameInputValue(conv.alias);
        }
        setRenamingConversationId(selectedConversationId);
      }
    } else if (action === "delete") {
      if (selectedConversationId) {
        handleDelete(selectedConversationId);
      }
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [selectedConversationId, conversations, toggleStar, handleDelete]);

  const toggleSearch = useCallback(() => {
    setIsSearchVisible(!isSearchVisible);
    if (isSearchVisible) {
      setSearchQuery("");
    }
  }, [isSearchVisible]);

  return (
    <>
      <div className="sidebar">
        <div className="header sidebar-header">
          <div className="header-left">
            <div className="logo">
              <img src={logo} alt="DEVOCHAT" className="logo-image" />
            </div>
          </div>
          <div className="header-right">
            <Tooltip content="사이드바 닫기" position="bottom" isTouch={isTouch}>
              <div className="header-icon">
                <RiMenuLine onClick={toggleSidebar} />
              </div>
            </Tooltip>
          </div>
        </div>

        <div className="newtask-container">
          <div className="new-task search" onClick={toggleSearch}>
            <LuSearch />
            검색
          </div>
          <div className="new-task" onClick={handleNewConversation}>
            <LuSquarePen />
            새 대화
          </div>
          <div className="new-task" onClick={handleRealtimeConversation}>
            <LuAudioLines />
            실시간 대화
          </div>
          <div className="new-task" onClick={handleImageGeneration}>
            <LuImage />
            이미지 생성
          </div>
        </div>

        <div className={`conversation-container ${isLoadingChat ? "loading" : ""}`}>
          {isLoadingChat ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <ClipLoader loading={true} size={40} />
            </motion.div>
          ) : (
            <>
              <div className="conversation-header">
                대화 기록
              </div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                style={{ 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column'
                }}
              >
                {sortedConversations.length > 0 ? (
                  sortedConversations
                    .slice()
                    .map((conv) => (
                      <ConversationItem
                        key={conv.conversation_id}
                        conv={conv}
                        currentConversationId={currentConversationId}
                        renamingConversationId={renamingConversationId}
                        renameInputValue={renameInputValue}
                        setRenameInputValue={setRenameInputValue}
                        handleRename={handleRename}
                        setRenamingConversationId={setRenamingConversationId}
                        handleNavigate={handleNavigate}
                        handleConversationContextMenu={handleConversationContextMenu}
                        handleTouchStart={handleTouchStart}
                        handleTouchEnd={handleTouchEnd}
                        handleTouchMove={handleTouchMove}
                        toggleStar={toggleStar}
                        isTouch={isTouch}
                      />
                    ))
                ) : (
                  <div className="no-result">
                    {conversations.length === 0 ? "대화 내역이 없습니다." : "검색 결과가 없습니다."}
                  </div>
                )}
              </motion.div>
            </>
          )}
        </div>

        <div className="user-container" ref={userContainerRef}>
          <div className="user-info" onClick={() => setIsDropdown(!isDropdown)}>
            <FaUserCircle className="user-icon" />
            <div className="user-name">{userInfo?.name}</div>
          </div>

          <AnimatePresence>
            {isDropdown && (
              <motion.div
                className="user-dropdown"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <div onClick={handleRefresh} className="dropdown-item user-billing">
                  <div className="billing-text">
                    {userInfo?.billing?.toFixed(2)}$ 사용됨
                  </div>
                  <div className="refresh-button">
                    페이지 새로고침
                  </div>
                </div>
                {userInfo?.admin && (
                  <div
                    onClick={handleAdminClick}
                    className="dropdown-item"
                  >
                    사용자 관리
                  </div>
                )}
                <div onClick={handleDeleteAll} className="dropdown-item">
                  전체 대화 삭제
                </div>
                <div
                  onClick={handleLogoutClick}
                  className="dropdown-item"
                  style={{ color: "red" }}
                >
                  로그아웃
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <SearchModal
        isVisible={isSearchVisible}
        onClose={toggleSearch}
        searchQuery={searchQuery}
        setChangeQuery={setSearchQuery}
        sortedConversations={sortedConversations}
        onSelectConversation={(id) => handleNavigate(id)}
      />

      <AnimatePresence>
        {contextMenu.visible && (
          <motion.div
            className="context-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute",
              top: contextMenu.y,
              left: contextMenu.x,
            }}
          >
            <ul>
              {selectedConversationId && (
                <>
                  {conversations.find(c => c.conversation_id === selectedConversationId)?.starred ? (
                    <li onClick={() => handleCustomAction("star")}>즐겨찾기 해제</li>
                  ) : (
                    <li onClick={() => handleCustomAction("star")}>즐겨찾기</li>
                  )}
                  <li onClick={() => handleCustomAction("rename")}>이름 편집</li>
                  <li onClick={() => handleCustomAction("delete")}>삭제</li>
                </>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <Modal
            message={modalMessage}
            onConfirm={confirmDelete}
            onCancel={cancelDelete}
            showCancelButton={modalAction !== "notify"}
          />
        )}
      </AnimatePresence>

      <Toast
        type="error"
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </>
  );
}

export default Sidebar;