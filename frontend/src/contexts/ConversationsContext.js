// src/contexts/ConversationsContext.js
import React, { createContext, useState, useEffect } from "react";
import axios from "axios";

export const ConversationsContext = createContext();

export function ConversationsProvider({ children }) {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchConversations = async () => {
        setLoading(true);
        try {
            const response = await axios.get(
                `${process.env.REACT_APP_FASTAPI_URL}/conversations`,
                { withCredentials: true }
            );
            setConversations(response.data.conversations);
            setError(null);
        } catch (error) {
            console.error("Failed to fetch conversations.", error);
            setError("대화를 불러오는 데 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const addConversation = (conversation) => {
        setConversations((prev) => [conversation, ...prev]);
    };

    const deleteConversation = (conversation_id) => {
        setConversations((prev) => prev.filter(conv => conv.conversation_id !== conversation_id));
    };

    useEffect(() => {
        fetchConversations();
    }, []);

    return (
        <ConversationsContext.Provider value={{
            conversations,
            loading,
            error,
            fetchConversations,
            addConversation,
            deleteConversation
        }}>
            {children}
        </ConversationsContext.Provider>
    );
}