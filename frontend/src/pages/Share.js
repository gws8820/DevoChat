import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LuArrowDown } from "react-icons/lu";
import { PulseLoader } from "react-spinners";
import { motion } from "framer-motion";
import Message from "../components/Message";
import "../styles/Common.css";

function Share() {
  const { share_id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isButtonReady, setIsButtonReady] = useState(false);
  const chatMessageRef = useRef(null);

  const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  useEffect(() => {
    const initializeShare = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/share/${share_id}`);
        if (!res.ok) {
          const errorModal = res.status === 404 ? "공유 대화를 찾을 수 없습니다." : "공유 대화를 불러오는 중 오류가 발생했습니다.";
          navigate("/", { state: { errorModal } });
          return;
        }

        const data = await res.json();
        const updatedMessages = (data.conversation || []).map((m) => {
          const messageWithId = m.id ? m : { ...m, id: generateMessageId() };
          return m.role === "assistant" ? { ...messageWithId, isComplete: true } : messageWithId;
        });
        setMessages(updatedMessages);
      } catch (err) {
        navigate("/", { state: { errorModal: "공유 대화를 불러오는 중 오류가 발생했습니다." } });
      } finally {
        setIsInitialized(true);
      }
    };

    initializeShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share_id]);

  useEffect(() => {
    const container = chatMessageRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
    };
    container.addEventListener("scroll", handleScroll);
    const t = setTimeout(() => setIsButtonReady(true), 600);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const container = chatMessageRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
  }, [messages.length]);

  const renderedMessages = useMemo(() =>
    messages.map((msg, idx) => (
      <Message
        key={msg.id}
        messageIndex={idx}
        role={msg.role}
        content={msg.content}
        shouldRender={true}
      />
    )), [messages]
  );

  return (
    <div className="container">
      {!isInitialized && (
        <motion.div
          className="page-loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <PulseLoader loading={true} size={20} />
        </motion.div>
      )}

      <div className="chat-messages-wrapper">
        <div className="chat-messages view" ref={chatMessageRef}>
          {renderedMessages}
        </div>
        <button
          className={`scroll-to-bottom-btn ${!isAtBottom && isButtonReady ? "visible" : ""}`}
          onClick={() => chatMessageRef.current.scrollTo({ top: chatMessageRef.current.scrollHeight, behavior: "smooth" })}
          aria-label="아래로 스크롤"
        >
          <LuArrowDown />
        </button>
      </div>
    </div>
  );
}

export default Share;
