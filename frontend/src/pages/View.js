import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import { AnimatePresence } from "framer-motion";
import axios from "axios";
import Message from "../components/Message";
import "../styles/Common.css";

function View() {
    const { conversation_id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    const [messages, setMessages] = useState([]);
    const [scrollOnImage, setScrollOnImage] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const initializeChat = async () => {
        try {
            const res = await axios.get(
            `${process.env.REACT_APP_FASTAPI_URL}/conversation/${conversation_id}`
            );

            const updatedMessages = res.data.messages.map((m) =>
            m.role === "assistant" ? { ...m, isComplete: true } : m
            );
            setMessages(updatedMessages);
        } catch (err) {
            if (err.response && err.response.status === 404) {
                navigate("/", { state: { errorModal: "대화를 찾을 수 없습니다." } });
            } else {
                navigate("/", { state: { errorModal: "데이터를 불러오는 중 오류가 발생했습니다." } });
            }
        } finally {
            setIsInitialized(true);
        }
        };

        initializeChat();
        // eslint-disable-next-line
    }, [conversation_id, location.state]);

    useEffect(() => {
        if (isInitialized) {
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          });
        }
    }, [isInitialized]);

    useEffect(() => {
        if (scrollOnImage) {
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          });
          setScrollOnImage(false);
        }
      }, [messages, scrollOnImage]);

    return (
        <div className="container">
            {!isInitialized && (
            <div
                style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100dvh",
                marginBottom: "30px",
                }}
            >
                <ClipLoader loading={true} size={50} />
            </div>
            )}
            <div className="chat-messages">
                <AnimatePresence>
                    {messages.map((msg, idx) => (
                        <Message
                            key={idx}
                            messageIndex={idx}
                            role={msg.role}
                            content={msg.content}
                            setScrollOnSend={scrollOnImage}
                        />
                    ))}
                </AnimatePresence>
                <div ref={messagesEndRef} style={{marginBottom: "20px"}} />
            </div>
        </div>
    );
}

export default View;