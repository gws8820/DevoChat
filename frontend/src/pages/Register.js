// Register.js
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import "../styles/Auth.css";
import logo from "../logo.png";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmModal, setConfirmModal] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const navigate = useNavigate();

  function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  }

  async function handleRegister() {
    if (!name || !email || !password) {
      setToastMessage("모든 필드를 입력해 주세요.");
      setShowToast(true);
      return;
    }

    if (!validateEmail(email)) {
      setToastMessage("올바른 이메일 형식을 입력해 주세요.");
      setShowToast(true);
      return;
    }

    if (password.length < 8 || password.length > 20) {
      setToastMessage("비밀번호는 8자리 이상 20자리 이하로 입력해 주세요.");
      setShowToast(true);
      return;
    }

    try {
      const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
    if (!res.ok) {
      let detail = null;
      try { detail = (await res.json())?.detail; } catch {}
      throw new Error(detail || "알 수 없는 오류가 발생했습니다.");
    }
    setConfirmModal(true);
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
        handleRegister();
      }}>
        <input 
          className="name field" 
          type="text" 
          placeholder="이름" 
          value={name} 
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
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
          autoComplete="new-password"
        />
        <p className="info">*비밀번호는 8자리 이상으로 입력해 주세요.</p>
        <button className="continue field" type="submit">회원가입</button>
      </form>
      <div className="footer">
        <p>이미 가입하셨나요?</p>
        <button className="route" onClick={() => navigate("/login")}>로그인</button>
      </div>

      <AnimatePresence>
        {confirmModal && (
          <Modal
            message="회원가입 성공! 로그인 페이지로 이동합니다."
            onConfirm={() => {
              setConfirmModal(null);
              navigate("/login");
            }}
            showCancelButton={false}
          />
        )}
      </AnimatePresence>

      <Toast
        type="error"
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </motion.div>
  );
}

export default Register;