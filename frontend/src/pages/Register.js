// Register.js
import axios from "axios";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CiWarning } from "react-icons/ci";
import { AnimatePresence, motion } from "framer-motion";
import Modal from "../components/Modal";
import "../styles/Auth.css";
import logo from "../logo.png";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmModal, setConfirmModal] = useState(false);
  const [errorModal, setErrorModal] = useState("");
  const navigate = useNavigate();

  function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  }

  async function handleRegister() {
    // 빈 필드 검사
    if (!name || !email || !password) {
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

    // 비밀번호 길이 검사 (8~20자)
    if (password.length < 8 || password.length > 20) {
      setErrorModal("비밀번호는 8자리 이상 20자리 이하로 입력해 주세요.");
      setTimeout(() => setErrorModal(null), 2000);
      return;
    }

    try {
      await axios.post(`${process.env.REACT_APP_FASTAPI_URL}/register`, { name, email, password });
      setConfirmModal(true);
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
      handleRegister();
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
          className="name field" 
          type="text" 
          placeholder="이름" 
          value={name} 
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
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
        <p className="info">*비밀번호는 8자리 이상으로 입력해 주세요.</p>
        <button className="continue field" onClick={handleRegister}>회원가입</button>
      </div>
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

export default Register;