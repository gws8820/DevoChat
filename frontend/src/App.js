// src/App.js
import { useEffect, useState, useCallback, useRef, useContext, useMemo } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { BarLoader } from "react-spinners";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ImageHeader from "./components/ImageHeader";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import ImageChat from "./pages/ImageChat";
import ImageHome from "./pages/ImageHome";
import View from "./pages/View";
import Realtime from "./pages/Realtime";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Toast from "./components/Toast";
import { SettingsProvider } from "./contexts/SettingsContext";
import { SettingsContext } from "./contexts/SettingsContext";
import { ConversationsProvider, ConversationsContext } from "./contexts/ConversationsContext";
import logo from "./resources/logo.png";

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
  const [userInfo, setUserInfo] = useState(null);
  const [isResponsive, setIsResponsive] = useState(window.innerWidth <= 768);
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userSidebarOpen, setUserSidebarOpen] = useState(null);
  const [isTouch, setIsTouch] = useState(false);
  const [toastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const shouldShowLayout = useMemo(() => {
    return (
      isLoggedIn && (
        location.pathname === '/' ||
        location.pathname.startsWith('/chat/') ||
        location.pathname.startsWith('/image')
      )
    );
  }, [isLoggedIn, location.pathname]);

  const shouldShowLogo = useMemo(() => {
    return location.pathname.startsWith("/view");
  }, [location.pathname]);

  const chatMessageRef = useRef(null);
  const { fetchConversations, isLoadingChat } = useContext(ConversationsContext);
  const { isModelReady } = useContext(SettingsContext);

  useEffect(() => {
    const handleResize = () => {
      setIsResponsive(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsTransitionEnabled(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    async function checkLoginStatus() {
      try {
        const statusRes = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/auth/status`, { credentials: "include" });
        if (!statusRes.ok) {
          setIsLoggedIn(false);
          setUserInfo(null);
          return;
        }
        const statusData = await statusRes.json();
        setIsLoggedIn(statusData.logged_in);
        if (statusData.logged_in) {
          fetchConversations();
          try {
            const userRes = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/auth/user`, { credentials: "include" });
            if (userRes.ok) {
              const userData = await userRes.json();
              setUserInfo(userData);
            }
          } catch (error) {}
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
      const newIsTouch = event.pointerType === 'touch';
      setIsTouch(prev => prev !== newIsTouch ? newIsTouch : prev);
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
          setIsSidebarOpen(currentOpen => {
            if ((diffX > 0 && !currentOpen) || (diffX < 0 && currentOpen)) {
              const newState = !currentOpen;
              const currentIsResponsive = window.innerWidth <= 768;
              if (!currentIsResponsive) setUserSidebarOpen(newState);
              return newState;
            }
            return currentOpen;
          });
        }
      }
    };
    
    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchend", handleTouchEnd);
  
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isTouch]);

  if (isLoggedIn === null || !isModelReady || isLoadingChat) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", justifyContent: "center", alignItems: "center" }}>
        <div style={{ width: "300px", display: "flex", justifyContent: "center", marginBottom: "20px" }}>
          <img src={logo} alt="DEVOCHAT" className="logo-image" />
        </div>
        <div>
          <BarLoader width={200} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100dvh", margin: "0", overflow: "hidden" }}>
      {/* Sidebar Container */}
      {shouldShowLayout && (
        <div
          style={{
            width: "260px",
            position: "fixed",
            left: 0,
            top: 0,
            height: "100dvh",
            zIndex: 1000,
            transform: isSidebarOpen ? "translateX(0)" : "translateX(-100%)",
            transition: isTransitionEnabled ? "transform 0.3s ease" : "none",
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        >
          <Sidebar
            toggleSidebar={toggleSidebar}
            isSidebarOpen={isSidebarOpen}
            isResponsive={isResponsive}
            isTouch={isTouch}
            userInfo={userInfo}
          />
        </div>
      )}

      {/* Sidebar Overlay */}
      {shouldShowLayout && isSidebarOpen && isResponsive && (
        <div
          onClick={toggleSidebar}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100dvh",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            zIndex: 100,
          }}
        />
      )}

      {/* Main Container */}
      <div
        style={{ 
          width: "100%",
          height: "100dvh",
          marginLeft: (shouldShowLayout && isSidebarOpen && !isResponsive) ? "260px" : "0",
          transition: "margin-left 0.3s ease",
          scrollbarGutter: "stable",
          backfaceVisibility: "hidden",
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
          location.pathname.startsWith('/image') ? (
            <ImageHeader
              toggleSidebar={toggleSidebar}
              isSidebarOpen={isSidebarOpen}
              isTouch={isTouch}
              chatMessageRef={chatMessageRef}
            />
          ) : (
            <Header
              toggleSidebar={toggleSidebar}
              isSidebarOpen={isSidebarOpen}
              isTouch={isTouch}
              chatMessageRef={chatMessageRef}
            />
          )
        )}

        <Routes location={location} key={location.pathname}>
          <Route path="/" element={isLoggedIn ? <Home isTouch={isTouch} userInfo={userInfo} /> : <Navigate to="/login" />} />
          <Route path="/chat/:conversation_id" element={isLoggedIn ? <Chat isTouch={isTouch} chatMessageRef={chatMessageRef} userInfo={userInfo} /> : <Navigate to="/login" />} />
          <Route path="/image" element={isLoggedIn ? <ImageHome isTouch={isTouch} /> : <Navigate to="/login" />} />
          <Route path="/image/:conversation_id" element={isLoggedIn ? <ImageChat isTouch={isTouch} chatMessageRef={chatMessageRef} /> : <Navigate to="/login" />} />
          <Route path="/view/:type/:conversation_id" element={isLoggedIn ? <View /> : <Navigate to="/login" />} />
          <Route path="/realtime" element={isLoggedIn ? <Realtime /> : <Navigate to="/login" />} />
          <Route path="/admin" element={isLoggedIn ? <Admin /> : <Navigate to="/login" />} />
          <Route path="/login" element={isLoggedIn ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={isLoggedIn ? <Navigate to="/" /> : <Register />} />
        </Routes>
      </div>

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