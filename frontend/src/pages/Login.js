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
    // 간단한 정규식 예시
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  }

  async function handleLogin() {
    // 빈 필드 검사
    if (!email || !password) {
      setErrorModal("모든 필드를 입력해 주세요.");
      setTimeout(() => setErrorModal(null), 2000);
      return;
    }

    // 이메일 형식 검사
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

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleLogin();
    }
  };

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
      <div className="auth-input-container">
        <input
          className="id field"
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <input
          className="password field"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="continue field" onClick={handleLogin}>
          로그인
        </button>
      </div>
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
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            transition={{ duration: 0.3 }}
          >
            <CiWarning style={{ marginRight: "4px", fontSize: "16px" }} />
            {errorModal}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default Login;