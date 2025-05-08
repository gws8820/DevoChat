// Login.js
import axios from "axios";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CiWarning } from "react-icons/ci";
import { motion, AnimatePresence } from "framer-motion";
import "../styles/Auth.css";
import logo from "../logo.png";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorModal, setErrorModal] = useState("");
  const navigate = useNavigate();

  function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  }

  async function handleLogin() {
    if (!email || !password) {
      setErrorModal("모든 필드를 입력해 주세요.");
      setTimeout(() => setErrorModal(null), 2000);
      return;
    }

    if (!validateEmail(email)) {
      setErrorModal("올바른 이메일 형식을 입력해 주세요.");
      setTimeout(() => setErrorModal(null), 2000);
      return;
    }

    try {
      await axios.post(
        `${process.env.REACT_APP_FASTAPI_URL}/login`,
        { email, password },
        { withCredentials: true }
      );
      window.location.reload();
    } catch (error) {
      const detail = error.response?.data?.detail;
      setErrorModal(
        Array.isArray(detail)
          ? "잘못된 입력입니다."
          : detail || "알 수 없는 오류가 발생했습니다."
      );
      setTimeout(() => setErrorModal(null), 2000);
    }
  }

  return (
    <motion.div
      className="auth-container"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="auth-logo">
        <img src={logo} alt="DEVOCHAT" className="logo-image" />
      </div>
      <form className="auth-input-container" onSubmit={(e) => {
        e.preventDefault();
        handleLogin();
      }}>
        <input
          className="id field"
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
        <input
          className="password field"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <button className="continue field" type="submit">
          로그인
        </button>
      </form>
      <div className="footer">
        <p>계정이 없으신가요?</p>
        <button className="route" onClick={() => navigate("/register")}>
          가입하기
        </button>
      </div>

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
    </motion.div>
  );
}

export default Login;