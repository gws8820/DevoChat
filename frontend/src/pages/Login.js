// Login.js
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Toast from "../components/Toast";
import "../styles/Auth.css";
import logo from "../logo.png";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('expired') === 'true') {
      setToastMessage("다시 로그인해 주세요.");
      setShowToast(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  }

  async function handleLogin() {
    if (!email || !password) {
      setToastMessage("모든 필드를 입력해 주세요.");
      setShowToast(true);
      return;
    }

    if (!validateEmail(email)) {
      setToastMessage("올바른 이메일 형식을 입력해 주세요.");
      setShowToast(true);
      return;
    }

    try {
      const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        let detail = null;
        try { detail = (await res.json())?.detail; } catch {}
        throw new Error(detail || "알 수 없는 오류가 발생했습니다.");
      }
      window.location.reload();
    } catch (error) {
      setToastMessage(error.message || "알 수 없는 오류가 발생했습니다.");
      setShowToast(true);
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
          onChange={(e) => {
            const value = e.target.value;
            if (/^[a-zA-Z0-9@._-]*$/.test(value)) {
              setEmail(value);
            }
          }}
          autoComplete="username"
        />
        <input
          className="password field"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => {
            const value = e.target.value;
            if (/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]*$/.test(value)) {
              setPassword(value);
            }
          }}
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

      <Toast
        type="error"
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </motion.div>
  );
}

export default Login;