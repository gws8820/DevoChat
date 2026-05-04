import React, { createContext, useState, useCallback, useMemo } from "react";
 
export const ConversationsContext = createContext();

export function ConversationsProvider({ children }) {
  const [conversations, setConversations] = useState([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [error, setError] = useState(null);

  const fetchConversations = useCallback(async () => {
    setIsLoadingChat(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/conversations`, {
        credentials: "include"
      });
      if (!res.ok) {
        throw new Error('대화를 불러오는 데 실패했습니다.');
      }
      const data = await res.json();
      setConversations(data.conversations);
      setError(null);
    } catch (error) {
      setError(error.message || "대화를 불러오는 데 실패했습니다.");
    } finally {
      setIsLoadingChat(false);
    }
  }, []);

  const addConversation = useCallback((newConversation) => {
    setConversations((prevConversations) => [
      ...prevConversations,
      newConversation,
    ]);
  }, []);

  const deleteConversation = useCallback((conversation_id) => {
    setConversations((prevConversations) =>
      prevConversations.filter(
        (conv) => conv.conversation_id !== conversation_id
      )
    );
  }, []);

  const deleteAllConversation = useCallback(() => {
    setConversations([]);
  }, []);

  const updateAlias = useCallback((conversation_id, newAlias, isLoading = undefined) => {
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
  }, []);

  const updateTimestamp = useCallback((conversation_id, updated_at) => {
    setConversations((prevConversations) =>
      prevConversations.map((conv) =>
        conv.conversation_id === conversation_id
          ? { ...conv, updated_at }
          : conv
      )
    );
  }, []);

  const toggleStarConversation = useCallback((conversation_id, starred) => {
    setConversations(prevConversations =>
      prevConversations.map(conv =>
        conv.conversation_id === conversation_id
          ? { ...conv, starred, starred_at: starred ? new Date().toISOString() : null }
          : conv
      )
    );
  }, []);

  const value = useMemo(() => ({
    conversations,
    isLoadingChat,
    error,
    fetchConversations,
    addConversation,
    deleteConversation,
    deleteAllConversation,
    updateAlias,
    updateTimestamp,
    toggleStarConversation
  }), [conversations, isLoadingChat, error, fetchConversations, addConversation, deleteConversation, deleteAllConversation, updateAlias, updateTimestamp, toggleStarConversation]);

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
}