// src/App.js
import axios from "./utils/axiosConfig";
import { useEffect, useState, useCallback, useRef, useContext, useMemo } from "react";
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
import Toast from "./components/Toast";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ConversationsProvider, ConversationsContext } from "./contexts/ConversationsContext";
import logo from "./logo.png";

function App() {
  const [modelsData, setModelsData] = useState(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const modelsResponse = await axios.get(
          `${process.env.REACT_APP_FASTAPI_URL}/models`
        );
        setModelsData(modelsResponse.data);
      } catch (error) {
        console.error("Failed to fetch models:", error);
        setModelsData({ models: [] });
      }
    };
    fetchModels();
  }, []);

  if (modelsData === null) return null;

  return (
    <Router>
      <SettingsProvider modelsData={modelsData}>
        <ConversationsProvider>
          <AppContent />
        </ConversationsProvider>
      </SettingsProvider>
    </Router>
  );
}

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [isResponsive, setIsResponsive] = useState(window.innerWidth <= 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userSidebarOpen, setUserSidebarOpen] = useState(null);
  const [isTouch, setIsTouch] = useState(false);
  const [toastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const shouldShowLayout = useMemo(() => {
    return isLoggedIn && (location.pathname === '/' || location.pathname.startsWith('/chat/'));
  }, [isLoggedIn, location.pathname]);

  const shouldShowLogo = useMemo(() => {
    return location.pathname.startsWith("/view");
  }, [location.pathname]);

  const chatMessageRef = useRef(null);
  const { fetchConversations } = useContext(ConversationsContext);

  useEffect(() => {
    const handleResize = () => {
      setIsResponsive(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
          try {
            const userResponse = await axios.get(
              `${process.env.REACT_APP_FASTAPI_URL}/auth/user`,
              { withCredentials: true }
            );
            setUserInfo(userResponse.data);
          } catch (error) {
            console.error("Failed to fetch user info.", error);
          }
        }
      } catch (error) {
        setIsLoggedIn(false);
        setUserInfo(null);
      }
    }
    checkLoginStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isResponsive) {
      setIsSidebarOpen(false);
    } else {
      if (userSidebarOpen !== null) {
        setIsSidebarOpen(userSidebarOpen);
      } else {
        setIsSidebarOpen(true);
      }
    }
  }, [isResponsive, userSidebarOpen]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => {
      const newState = !prev;
      if (!isResponsive) setUserSidebarOpen(newState);
      return newState;
    });
  }, [isResponsive]);
  
  useEffect(() => {
    const handlePointerDown = (event) => {
      if (event.pointerType === 'touch') 
        setIsTouch(true);
      else
        setIsTouch(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isTouch) return;
  
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTarget = null;
    let hadTextSelectionAtStart = false;

    const threshold = 50;
    const excludedClasses = ['.header', '.context-menu', '.message-edit', '.input-container', '.katex-display', '.code-block', '.mcp-modal-overlay', '.modal-overlay'];
  
    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTarget = e.touches[0].target;
      hadTextSelectionAtStart = window.getSelection && window.getSelection().toString().length > 0;
    };
  
    const handleTouchEnd = (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndTarget = e.changedTouches[0].target;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
  
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
        const hasTextSelectionNow = window.getSelection && window.getSelection().toString().length > 0;
        const isStartExcluded = excludedClasses.some(cls => touchStartTarget && touchStartTarget.closest(cls));
        const isEndExcluded = excludedClasses.some(cls => touchEndTarget && touchEndTarget.closest(cls));
        
        if (!hadTextSelectionAtStart && !hasTextSelectionNow && !isStartExcluded && !isEndExcluded) {
          if (diffX > 0 && !isSidebarOpen) {
            toggleSidebar();
          } else if (diffX < 0 && isSidebarOpen) {
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
  }, [isTouch, isSidebarOpen, toggleSidebar]);

  if (isLoggedIn === null) return null;

  return (
    <div style={{ display: "flex", margin: "0" }}>
      <AnimatePresence>
        {shouldShowLayout && (
          <motion.div
            style={{
              width: "260px",
              position: "fixed",
              left: 0,
              top: 0,
              height: "100vh",
              zIndex: 1000,
              transform: isSidebarOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.3s ease",
            }}
          >
            <Sidebar
              toggleSidebar={toggleSidebar}
              isSidebarOpen={isSidebarOpen}
              isResponsive={isResponsive}
              isTouch={isTouch}
              userInfo={userInfo}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {isResponsive && isSidebarOpen && (
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
          height: "100dvh",
          marginLeft: (!isResponsive && isSidebarOpen) ? "260px" : "0",
          transition: "margin-left 0.3s ease",
        }}
      >
        {shouldShowLogo && (
          <div className="header" style={{ padding: "0 20px" }}>
            <img
              src={logo}
              alt="DEVOCHAT"
              width="143.5px"
              onClick={() => navigate("/")}
              style={{ cursor: "pointer" }}
            />
          </div>
        )}

        {shouldShowLayout && (
          <Header
            toggleSidebar={toggleSidebar}
            isSidebarOpen={isSidebarOpen}
            isTouch={isTouch}
            chatMessageRef={chatMessageRef}
          />
        )}

        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={isLoggedIn ? <Main isTouch={isTouch} userInfo={userInfo} /> : <Navigate to="/login" />} />
            <Route path="/chat/:conversation_id" element={isLoggedIn ? <Chat isTouch={isTouch} chatMessageRef={chatMessageRef} userInfo={userInfo} /> : <Navigate to="/login" />} />
            <Route path="/view/:conversation_id" element={<View />} />
            <Route path="/realtime" element={isLoggedIn ? <Realtime /> : <Navigate to="/login" />} />
            <Route path="/admin" element={isLoggedIn ? <Admin /> : <Navigate to="/login" />} />
            <Route path="/login" element={isLoggedIn ? <Navigate to="/" /> : <Login />} />
            <Route path="/register" element={isLoggedIn ? <Navigate to="/" /> : <Register />} />
          </Routes>
        </AnimatePresence>
      </motion.div>

      <Toast
        type="error"
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  );
}

export default App;