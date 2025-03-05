// src/App.js
import axios from "axios";
import { useEffect, useState, useCallback } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import Sidebar from "./components/Sidebar";
import Main from "./pages/Main";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Header from "./components/Header";
import { SettingsProvider } from "./contexts/SettingsContext";
import "./styles/Common.css";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(null);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [errorModal, setErrorModal] = useState(null);

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
    const updateSidebarVisibility = () => {
      if (window.innerWidth <= 768) {
        setIsSidebarVisible(false);
      } else {
        setIsSidebarVisible(true);
      }
    };
    updateSidebarVisibility();
    window.addEventListener("resize", updateSidebarVisibility);

    return () => window.removeEventListener("resize", updateSidebarVisibility);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarVisible((prev) => !prev);
  }, []);

  return isLoggedIn !== null ? (
    <Router>
      <AppLayout
        isLoggedIn={isLoggedIn}
        isSidebarVisible={isSidebarVisible}
        toggleSidebar={toggleSidebar}
        conversations={conversations}
        isLoadingChat={isLoadingChat}
        errorModal={errorModal}
        deleteConversation={deleteConversation}
        deleteAllConversation={deleteAllConversation}
        fetchConversations={fetchConversations}
        addConversation={addConversation}
        setErrorModal={setErrorModal}
      />
    </Router>
  ) : null;
}

function AppLayout({
  isLoggedIn,
  isSidebarVisible,
  toggleSidebar,
  conversations,
  isLoadingChat,
  errorModal,
  deleteConversation,
  deleteAllConversation,
  addConversation,
  setErrorModal,
  fetchConversations,
}) {
  const location = useLocation();
  const hideLayoutRoutes = ["/login", "/register"];
  const shouldShowLayout = !hideLayoutRoutes.includes(location.pathname);

  const isTouch =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  const isResponsive = window.innerWidth <= 768;
  const marginLeft = shouldShowLayout && !isResponsive && isSidebarVisible ? 260 : 0;

  useEffect(() => {
    if (!isTouch) return;

    let touchStartX = 0;
    let touchStartY = 0;
    const threshold = 20;

    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
        if (diffX > 0 && !isSidebarVisible) {
          toggleSidebar();
        } else if (diffX < 0 && isSidebarVisible) {
          toggleSidebar();
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

  return (
    <div style={{ display: "flex", position: "relative" }}>
      {shouldShowLayout && (
        <>
          {!isResponsive && (
            <motion.div
              initial={{ x: isSidebarVisible ? 0 : -260 }}
              animate={{ x: isSidebarVisible ? 0 : -260 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              style={{
                position: "fixed",
                left: 0,
                top: 0,
                bottom: 0,
                zIndex: 20,
              }}
            >
              <Sidebar
                toggleSidebar={toggleSidebar}
                isSidebarVisible={isSidebarVisible}
                isTouch={isTouch}
                conversations={conversations}
                isLoadingChat={isLoadingChat}
                errorModal={errorModal}
                deleteConversation={deleteConversation}
                deleteAllConversation={deleteAllConversation}
                setErrorModal={setErrorModal}
                isResponsive={isResponsive}
                fetchConversations={fetchConversations}
              />
            </motion.div>
          )}

          {isResponsive && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: isSidebarVisible ? 0 : "-260px",
                width: 260,
                height: "100%",
                transition: "left 0.3s ease-in-out",
                zIndex: 20,
              }}
            >
              <Sidebar
                toggleSidebar={toggleSidebar}
                isSidebarVisible={isSidebarVisible}
                isTouch={isTouch}
                conversations={conversations}
                isLoadingChat={isLoadingChat}
                errorModal={errorModal}
                deleteConversation={deleteConversation}
                deleteAllConversation={deleteAllConversation}
                setErrorModal={setErrorModal}
                isResponsive={isResponsive}
                fetchConversations={fetchConversations}
              />
            </div>
          )}
        </>
      )}

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
        <SettingsProvider>
          {shouldShowLayout && (
            <Header
              toggleSidebar={toggleSidebar}
              isSidebarVisible={isSidebarVisible}
              isTouch={isTouch}
            />
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
                    <Chat fetchConversations={fetchConversations} isTouch={isTouch} />
                  ) : (
                    <Navigate to="/login" />
                  )
                }
              />
              <Route
                path="/login"
                element={
                  !isLoggedIn ? <Login /> : <Navigate to="/" />
                }
              />
              <Route
                path="/register"
                element={
                  !isLoggedIn ? <Register /> : <Navigate to="/" />
                }
              />
            </Routes>
          </AnimatePresence>
        </SettingsProvider>
      </motion.div>
    </div>
  );
}

export default App;