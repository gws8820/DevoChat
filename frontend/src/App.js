// src/App.js
import axios from "./utils/axiosConfig";
import { useEffect, useState, useCallback, useRef, useContext } from "react";
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
  return (
    <Router>
      <SettingsProvider>
        <ConversationsProvider>
          <AppContent />
        </ConversationsProvider>
      </SettingsProvider>
    </Router>
  );
}

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [toastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const shouldShowSidebar = isLoggedIn && !['/login', '/register'].includes(location.pathname);
  const shouldShowHeader = isLoggedIn && !['/login', '/register', '/view'].some(path => 
    location.pathname === path || location.pathname.startsWith(path + '/')
  );
  const shouldShowLogo = location.pathname.startsWith("/view");
  
  const isResponsive = window.innerWidth <= 768;
  const marginLeft = (isResponsive || !shouldShowSidebar) ? 0 : (isSidebarOpen ? 260 : 0);

  const chatMessageRef = useRef(null);
  const { fetchConversations } = useContext(ConversationsContext);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
    }
    
    const handleResize = () => {
      const isMobile = /android|iphone|ipod/i.test(
        (navigator.userAgent || navigator.vendor || window.opera).toLowerCase()
      );
      
      if (!isMobile) {
        if (window.innerWidth <= 768) 
          setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);
  
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
    <div style={{ display: "flex", position: "relative", margin: "0", overflow: "hidden", minHeight: "100vh" }}>
      <AnimatePresence>
        {shouldShowSidebar && (
          <motion.div
            initial={{ x: -260 }}
            animate={{ x: isSidebarOpen ? 0 : -260 }}
            exit={{ x: -260 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            style={{
              width: "260px",
              position: "fixed",
              left: 0,
              top: 0,
              height: "100vh",
              zIndex: 1000,
            }}
          >
            <Sidebar
              toggleSidebar={toggleSidebar}
              isSidebarOpen={isSidebarOpen}
              isResponsive={isResponsive}
              isTouch={isTouch}
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
          minHeight: "100vh",
        }}
        initial={{ marginLeft }}
        animate={{ marginLeft }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
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

        {shouldShowHeader && (
          <Header
            toggleSidebar={toggleSidebar}
            isSidebarOpen={isSidebarOpen}
            isTouch={isTouch}
            chatMessageRef={chatMessageRef}
          />
        )}

        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={isLoggedIn ? <Main isTouch={isTouch} /> : <Navigate to="/login" />} />
            <Route path="/chat/:conversation_id" element={isLoggedIn ? <Chat isTouch={isTouch} chatMessageRef={chatMessageRef} /> : <Navigate to="/login" />} />
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