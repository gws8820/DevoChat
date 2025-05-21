// src/App.js
import axios from "axios";
import { useEffect, useState, useCallback, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Main from "./pages/Main";
import Chat from "./pages/Chat";
import View from "./pages/View";
import Realtime from "./pages/Realtime";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { SettingsProvider } from "./contexts/SettingsContext";
import logo from "./logo.png";

function App() {
  return (
    <Router>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </Router>
  );
}

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(null);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [errorModal, setErrorModal] = useState(null);

  const chatMessageRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();
  
  const shouldShowLayout = location.pathname === "/" || location.pathname.startsWith("/chat");
  const shouldShowLogo = location.pathname.startsWith("/view");
  const isResponsive = window.innerWidth <= 768;
  const marginLeft = shouldShowLayout && !isResponsive && isSidebarVisible ? 260 : 0;
  
  const addConversation = (newConversation) => {
    setConversations((prevConversations) => [
      ...prevConversations,
      newConversation,
    ]);
  };

  const deleteConversation = (conversation_id) => {
    setConversations((prevConversations) =>
      prevConversations.filter(
        (conv) => conv.conversation_id !== conversation_id
      )
    );
  };

  const deleteAllConversation = () => {
    setConversations([]);
  };

  const updateConversation = (conversation_id, newAlias, isLoading = undefined) => {
    setConversations((prevConversations) =>
      prevConversations.map((conv) =>
        conv.conversation_id === conversation_id
          ? { 
              ...conv, 
              alias: newAlias,
              ...(isLoading !== undefined && { isLoading })
            }
          : conv
      )
    );
  };

  const toggleStarConversation = (conversation_id, starred) => {
    setConversations(prevConversations => 
      prevConversations.map(conv => 
        conv.conversation_id === conversation_id 
          ? { ...conv, starred, starred_at: starred ? new Date().toISOString() : null }
          : conv
      )
    );
  };

  const fetchConversations = async () => {
    setIsLoadingChat(true);
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_FASTAPI_URL}/conversations`,
        { withCredentials: true }
      );
      setConversations(response.data.conversations);
    } catch (error) {
      setErrorModal("대화를 불러오는 데 실패했습니다.");
      setTimeout(() => setErrorModal(null), 2000);
    } finally {
      setIsLoadingChat(false);
    }
  };

  useEffect(() => {
    async function checkLoginStatus() {
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_FASTAPI_URL}/auth/status`,
          { withCredentials: true }
        );
        setIsLoggedIn(response.data.logged_in);
        if (response.data.logged_in) {
          fetchConversations();
        }
      } catch (error) {
        setIsLoggedIn(false);
      }
    }
    checkLoginStatus();
  }, []);

  useEffect(() => {
    setIsSidebarVisible(window.innerWidth > 768);

    const isMobile = /android|iphone|ipod/i.test(
      (navigator.userAgent || navigator.vendor || window.opera).toLowerCase()
    );
    if (!isMobile) {
      const handleResize = () => setIsSidebarVisible(window.innerWidth > 768);
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
    
    return undefined;
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarVisible((prev) => !prev);
  }, []);
  
  useEffect(() => {
    window.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch')
        setIsTouch(true);
      else
        setIsTouch(false);
    });
  }, []);

  useEffect(() => {
    if (!isTouch) return;
  
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTarget = null;
    const threshold = 50;
    const excludedClasses = ['.header', '.context-menu', '.message-edit', '.input-container', '.katex-display', '.code-block'];
  
    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTarget = e.touches[0].target;
    };
  
    const handleTouchEnd = (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
  
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
        const isExcluded = excludedClasses.some(cls => touchStartTarget && touchStartTarget.closest(cls));
        if (!isExcluded) {
            if (diffX > 0 && !isSidebarVisible) {
                toggleSidebar();
            } else if (diffX < 0 && isSidebarVisible) {
                toggleSidebar();
            }
        }
      }
    };
    
    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchend", handleTouchEnd);
  
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isTouch, isSidebarVisible, toggleSidebar]);

  return isLoggedIn !== null ? (
    <div style={{ display: "flex", position: "relative", margin: "0", overflow: "hidden" }}>
      {shouldShowLayout && (() => {
        const sidebarProps = {
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
          fetchConversations
        };
        
        return !isResponsive ? (
          <motion.div
            initial={{ x: isSidebarVisible ? 0 : -260 }}
            animate={{ x: isSidebarVisible ? 0 : -260 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              bottom: 0,
              width: 260,
              zIndex: 20,
            }}
          >
            <Sidebar {...sidebarProps} />
          </motion.div>
        ) : (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: isSidebarVisible ? 0 : -260,
              width: 260,
              height: "100%",
              transition: "left 0.3s ease-in-out",
              zIndex: 20,
            }}
          >
            <Sidebar {...sidebarProps} />
          </div>
        );
      })()}

      {isResponsive && isSidebarVisible && shouldShowLayout && (
        <div
          onClick={toggleSidebar}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 10,
          }}
        />
      )}

      <motion.div
        style={{
          flex: 1,
          position: "relative",
        }}
        initial={{ marginLeft }}
        animate={{ marginLeft }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {shouldShowLayout && (
          <Header
            toggleSidebar={toggleSidebar}
            isSidebarVisible={isSidebarVisible}
            isTouch={isTouch}
            chatMessageRef={chatMessageRef}
          />
        )}

        {shouldShowLogo && (
            <div className="header" style={{ padding: "0 20px" }}>
              <img src={logo} alt="DEVOCHAT" width="143.5px" onClick={() => navigate("/")} style={{ cursor: "pointer" }} />
            </div>
        )}

        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route
              path="/"
              element={
                isLoggedIn ? (
                  <Main addConversation={addConversation} isTouch={isTouch} />
                ) : (
                  <Navigate to="/login" />
                )
              }
            />
            <Route
              path="/chat/:conversation_id"
              element={
                isLoggedIn ? (
                  <Chat 
                    fetchConversations={fetchConversations} 
                    updateConversation={updateConversation}
                    isTouch={isTouch} 
                    chatMessageRef={chatMessageRef} 
                  />
                ) : (
                  <Navigate to="/login" />
                )
              }
            />
            <Route
              path="/view/:conversation_id"
              element={<View />}
            />
            <Route
              path="/realtime"
              element={isLoggedIn ? <Realtime /> : <Navigate to="/login" />}
            />
            <Route
              path="/admin"
              element={isLoggedIn ? <Admin /> : <Navigate to="/login" />}
            />
            <Route
              path="/login"
              element={isLoggedIn ? <Navigate to="/" /> : <Login />}
            />
            <Route
              path="/register"
              element={isLoggedIn ? <Navigate to="/" /> : <Register />}
            />
          </Routes>
        </AnimatePresence>
      </motion.div>
    </div>
  ) : null;
}

export default App;