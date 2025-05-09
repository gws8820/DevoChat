// src/components/Sidebar.js
import React, { useEffect, useState, useRef, useContext, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaUserCircle } from "react-icons/fa";
import { RiSearchLine, RiMenuLine, RiCloseLine  } from "react-icons/ri";
import { IoMdStar } from "react-icons/io";
import { CiWarning } from "react-icons/ci";
import { ClipLoader } from "react-spinners";
import { SettingsContext } from "../contexts/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import Modal from "./Modal";
import Tooltip from "./Tooltip";
import logo from "../logo.png";
import "../styles/Sidebar.css";

function Sidebar({
  toggleSidebar,
  isSidebarVisible,
  isTouch,
  conversations,
  isLoadingChat,
  errorModal,
  deleteConversation,
  deleteAllConversation,
  updateConversation,
  toggleStarConversation,
  setErrorModal,
  isResponsive,
  fetchConversations,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [userInfo, setUserInfo] = useState(null);
  const [isDropdown, setIsDropdown] = useState(false);
  const [modalMessage, setModalMessage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState(null);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [renamingConversationId, setRenamingConversationId] = useState(null);
  const [renameInputValue, setRenameInputValue] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });
  const hasNavigatedRef = useRef(false);
  const userContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  const longPressTimer = useRef(null);

  const { setAlias } = useContext(SettingsContext);  

  const starringConversationId = useState(null);

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

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return sortedConversations;
    
    const query = searchQuery.toLowerCase().trim();
    return sortedConversations.filter(conv => 
      conv.alias.toLowerCase().includes(query)
    );
  }, [sortedConversations, searchQuery]);

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_FASTAPI_URL}/auth/user`,
          { withCredentials: true }
        );
        setUserInfo(response.data);
      } catch (error) {
        console.error("Failed to fetch user info.", error);
      }
    };
    fetchUserInfo();
  }, []);

  useEffect(() => {
    if (errorModal && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      fetchConversations();
      navigate("/");
      setTimeout(() => {
        hasNavigatedRef.current = false;
      }, 2500);
    }
  }, [errorModal, fetchConversations, navigate]);

  const handleTouchStart = (e, conversation_id) => {
    setContextMenu({ ...contextMenu, visible: false });
    longPressTimer.current = setTimeout(() => {
      setSelectedConversationId(conversation_id);
      setContextMenu({
        visible: true,
        x: e.touches[0].pageX,
        y: e.touches[0].pageY,
      });
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const currentConversationId = location.pathname.startsWith("/chat/")
    ? location.pathname.split("/chat/")[1]
    : null;

  const handleRename = async (conversation_id, newAlias) => {
    try {
      updateConversation(conversation_id, newAlias);
      setRenamingConversationId(null);
      setRenameInputValue("");
  
      if (conversation_id === currentConversationId) {
        setAlias(newAlias);
      }
  
      await axios.put(
        `${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}/rename`,
        { alias: newAlias },
        { withCredentials: true }
      );
    } catch (error) {
      console.error("Failed to rename conversation.", error);
      setErrorModal("대화 이름 편집에 실패했습니다.");
      setTimeout(() => setErrorModal(null), 2000);
    }
  };

  const handleDelete = async (conversation_id) => {
    try {
      deleteConversation(conversation_id);
      if (currentConversationId === conversation_id)
        navigate("/");

      await axios.delete(
        `${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}`,
        { withCredentials: true }
      );
    } catch (error) {
      console.error("Failed to delete conversation.", error);
      setErrorModal("대화 삭제에 실패했습니다.");
      setTimeout(() => setErrorModal(null), 2000);
    }
  };

  const handleDeleteAll = () => {
    setModalMessage("정말 모든 대화를 삭제하시겠습니까?");
    setModalAction("deleteAll");
    setShowModal(true);
    setIsDropdown(false);
  };

  const handleLogoutClick = () => {
    setModalMessage("정말 로그아웃 하시겠습니까?");
    setModalAction("logout");
    setShowModal(true);
  };

  const confirmDelete = async () => {
    if (modalAction === "deleteAll") {
      try {
        deleteAllConversation();
        navigate("/");

        await axios.delete(
          `${process.env.REACT_APP_FASTAPI_URL}/conversation/all`,
          { withCredentials: true }
        );
      } catch (error) {
        console.error("Failed to delete conversations.", error);
        setErrorModal("대화 삭제에 실패했습니다.");
        setTimeout(() => setErrorModal(null), 2000);
      }
    } else if (modalAction === "logout") {
      try {
        await axios.post(
          `${process.env.REACT_APP_FASTAPI_URL}/logout`,
          {},
          { withCredentials: true }
        );
        window.location.reload();
      } catch (error) {
        const detail = error.response?.data?.detail;
        setErrorModal(
          !Array.isArray(detail) && detail
            ? detail
            : "알 수 없는 오류가 발생했습니다."
        );
        setTimeout(() => setErrorModal(null), 2000);
      }
    }
    setShowModal(false);
    setModalAction(null);
  };

  const cancelDelete = () => {
    setShowModal(false);
    setModalAction(null);
  };

  const handleNavigate = (conversation_id) => {
    const conversationExists = conversations.find(
      (c) => c.conversation_id === conversation_id
    );
    if (!conversationExists) {
      setErrorModal("대화가 존재하지 않습니다.");
      setTimeout(() => setErrorModal(null), 2000);
      return;
    }
    navigate(`/chat/${conversation_id}`);
    if (isResponsive) toggleSidebar();
  };

  const handleNewConversation = () => {
    navigate("/");
    if (isResponsive) toggleSidebar();
  };

  const handleConversationContextMenu = (e, conversation_id) => {
    e.preventDefault();
    if (renamingConversationId !== null) return;
    
    setSelectedConversationId(conversation_id);
    setContextMenu({
      visible: true,
      x: e.pageX,
      y: e.pageY,
    });
  };
  
  useEffect(() => {
    const handleClickOutsideContextMenu = () => {
      if (contextMenu.visible) {
        setContextMenu({ ...contextMenu, visible: false });
      }
    };
    document.addEventListener("click", handleClickOutsideContextMenu);
    return () =>
      document.removeEventListener("click", handleClickOutsideContextMenu);
  }, [contextMenu]);

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
  }, [isSidebarVisible]);

  useEffect(() => {
    if (isSearchVisible && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchVisible]);

  const handleCustomAction = (action) => {
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
    setContextMenu({ ...contextMenu, visible: false });
  };

  const toggleSearch = () => {
    setIsSearchVisible(!isSearchVisible);
    if (isSearchVisible) {
      setSearchQuery("");
    }
  };

  const toggleStar = async (conversation_id, e) => {
    e.stopPropagation();
    try {
      const conversation = conversations.find(c => c.conversation_id === conversation_id);
      if (!conversation) return;

      toggleStarConversation(conversation_id, !conversation.starred);
      
      await axios.put(
        `${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}/star`,
        { starred: !conversation.starred },
        { withCredentials: true }
      );
    } catch (error) {
      console.error("Failed to toggle star status:", error);
      setErrorModal("별표 상태 변경에 실패했습니다.");
      const conversation = conversations.find(c => c.conversation_id === conversation_id);
      if (conversation) {
        toggleStarConversation(conversation_id, conversation.starred);
      }
      setTimeout(() => setErrorModal(null), 2000);
    }
  };

  return (
    <>
      <div
        className={`sidebar ${isResponsive && isSidebarVisible ? "visible" : ""}`}
      >
        <div className="header sidebar-header">
          <div className="header-left">
            <div className="logo">
              <img src={logo} alt="DEVOCHAT" className="logo-image" />
            </div>
          </div>
          <div className="header-right">
            <Tooltip content="검색" position="bottom" isTouch={isTouch}>
              <div className="header-icon open-search" onClick={toggleSearch}>
                <RiSearchLine />
              </div>
            </Tooltip>
            <Tooltip content="사이드바 닫기" position="bottom" isTouch={isTouch}>
              <div className="header-icon toggle-icon">
                <RiMenuLine onClick={toggleSidebar} />
              </div>
            </Tooltip>
          </div>
        </div>

        <AnimatePresence>
          {isSearchVisible && (
            <motion.div 
              className="search-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              ref={searchInputRef}
            >
              <div className="search-container">
                <input
                  type="text"
                  placeholder="검색어를 입력하세요."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <div className="header-icon close-search" onClick={toggleSearch}>
                  <RiCloseLine  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="newconv-container">
          <button onClick={handleNewConversation} className="new-conversation">
            새 대화 시작
          </button>
        </div>

        <div className={`conversation-container ${isLoadingChat ? "loading" : ""}`}>
          {isLoadingChat ? (
            <ClipLoader loading={true} size={40} />
          ) : (
            <AnimatePresence>
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
                {filteredConversations.length > 0 ? (
                  filteredConversations
                    .slice()
                    .map((conv) => (
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
                        onContextMenu={(e) =>
                          handleConversationContextMenu(e, conv.conversation_id)
                        }
                        onTouchStart={(e) => handleTouchStart(e, conv.conversation_id)}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchMove}
                        onTouchCancel={handleTouchEnd}
                      >
                        <motion.div
                          className={`conversation-item ${
                            currentConversationId === conv.conversation_id
                              ? "active-conversation"
                              : ""
                          }`}
                          layout
                          onClick={() => {
                            if (renamingConversationId !== conv.conversation_id) {
                              handleNavigate(conv.conversation_id);
                            }
                          }}
                        >
                          {renamingConversationId === conv.conversation_id ? (
                            <input
                              type="text"
                              className="rename-input"
                              value={renameInputValue}
                              onChange={(e) => setRenameInputValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleRename(conv.conversation_id, renameInputValue);
                                }
                              }}
                              enterKeyHint="done"
                              onBlur={() => {
                                setRenamingConversationId(null);
                                setRenameInputValue("");
                              }}
                              autoFocus
                            />
                          ) : (
                            <span className="conversation-text">{conv.alias}</span>
                          )}

                          <motion.div 
                            className={`star-icon ${conv.starred ? 'starred' : ''} ${isTouch && !conv.starred ? 'disabled' : ''}`}  
                            onClick={(e) => {toggleStar(conv.conversation_id, e)}}
                          >
                            {starringConversationId === conv.conversation_id ? (
                              <ClipLoader size={14} color="#666" />
                            ) : (
                              <IoMdStar />
                            )}
                          </motion.div>
                        </motion.div>
                      </motion.li>
                    ))
                ) : (
                  <div className="no-search-results">
                    검색 결과가 없습니다.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
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
                <div className="user-billing">
                  {userInfo?.billing?.toFixed(2)}$ 사용됨
                </div>
                <div onClick={handleDeleteAll} className="dropdown-button">
                  전체 대화 삭제
                </div>
                <div
                  onClick={handleLogoutClick}
                  className="dropdown-button"
                  style={{ color: "red" }}
                >
                  로그아웃
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

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
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {errorModal && (
          <motion.div
            className="error-modal"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <CiWarning style={{ flexShrink: 0, marginRight: "4px", fontSize: "16px" }} />
            {errorModal}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default Sidebar;