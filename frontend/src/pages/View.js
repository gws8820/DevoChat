import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import { motion } from "framer-motion";
import Message from "../components/Message";
import "../styles/Common.css";

function View() {
  const { type, conversation_id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);

  const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  useEffect(() => {
    const initializeChat = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/${type}/conversation/${conversation_id}`, {
          credentials: "include"
        });
        if (!res.ok) {
          if (res.status === 404) {
            navigate("/", { state: { errorModal: "대화를 찾을 수 없습니다." } });
          } else {
            navigate("/", { state: { errorModal: "데이터를 불러오는 중 오류가 발생했습니다." } });
          }
          return;
        }
        const data = await res.json();
        const updatedMessages = data.messages.map((m) => {
          const messageWithId = m.id ? m : { ...m, id: generateMessageId() };
          return m.role === "assistant" ? { ...messageWithId, isComplete: true } : messageWithId;
        });
        setMessages(updatedMessages);
      } catch (err) {
        navigate("/", { state: { errorModal: "데이터를 불러오는 중 오류가 발생했습니다." } });
      } finally {
        setIsInitialized(true);
      }
    };

    initializeChat();
    // eslint-disable-next-line
  }, [type, conversation_id, location.state]);

  return (
    <div className="container">
      {!isInitialized && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100dvh",
            marginBottom: "30px",
          }}
        >
          <ClipLoader loading={true} size={50} />
        </motion.div>
      )}
      <div className="chat-messages view">
        {useMemo(() => 
          messages.map((msg, idx) => (
            <Message
              key={msg.id}
              messageIndex={idx}
              role={msg.role}
              content={msg.content}
            />
          )), [messages]
        )}
      </div>
    </div>
  );
}

export default View;