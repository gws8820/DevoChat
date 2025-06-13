// src/contexts/ConversationsContext.js
import React, { createContext, useState, useEffect, useCallback } from "react";
import axios from "../utils/axiosConfig";

export const ConversationsContext = createContext();

export function ConversationsProvider({ children }) {
    const [conversations, setConversations] = useState([]);
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const [error, setError] = useState(null);

    const fetchConversations = useCallback(async () => {
        setIsLoadingChat(true);
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
            setIsLoadingChat(false);
        }
    }, []);

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

    const updateConversation = (conversation_id, newAlias, isLoading = undefined) => {
        setConversations((prevConversations) =>
            prevConversations.map((conv) =>
                conv.conversation_id === conversation_id
                    ? { 
                        ...conv, 
                        alias: newAlias,
                        ...(isLoading !== undefined && { isLoading })
                      }
                    : conv
            )
        );
    };

    const toggleStarConversation = (conversation_id, starred) => {
        setConversations(prevConversations => 
            prevConversations.map(conv => 
                conv.conversation_id === conversation_id 
                    ? { ...conv, starred, starred_at: starred ? new Date().toISOString() : null }
                    : conv
            )
        );
    };

    useEffect(() => {
        fetchConversations();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <ConversationsContext.Provider value={{
            conversations,
            isLoadingChat,
            error,
            fetchConversations,
            addConversation,
            deleteConversation,
            deleteAllConversation,
            updateConversation,
            toggleStarConversation
        }}>
            {children}
        </ConversationsContext.Provider>
    );
}