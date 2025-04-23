// Message.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { GoCopy, GoCheck, GoPencil, GoTrash, GoSync } from "react-icons/go";
import { TbRefresh } from "react-icons/tb";
import { motion } from "framer-motion";
import { MarkdownRenderer } from "./MarkdownRenderers";
import "../styles/Message.css";
import "katex/dist/katex.min.css";

function Message({ messageIndex, role, content, isComplete, onDelete, onRegenerate, onSendEditedMessage, setScrollOnSend, isTouch }) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef(null);

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      const selectionStart = textareaRef.current.selectionStart;
      const selectionEnd = textareaRef.current.selectionEnd;
      const scrollTop = textareaRef.current.scrollTop;
      
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      
      textareaRef.current.selectionStart = selectionStart;
      textareaRef.current.selectionEnd = selectionEnd;
      textareaRef.current.scrollTop = scrollTop;
    }
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      adjustTextareaHeight();
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
    }
  }, [isEditing]);

  useEffect(() => {
    cancelEdit();
  }, [content]);

  const startEdit = () => {
    const textContent = content.find(item => item.type === "text")?.text;
    setEditText(textContent);
    setIsEditing(true);
    setTimeout(() => {
      adjustTextareaHeight();
    }, 0);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditText("");
  };

  const saveEdit = useCallback(() => {
    const nonTextContent = content.filter(item => item.type !== "text");
    const updatedContent = [
      { type: "text", text: editText },
      ...nonTextContent
    ];
    onSendEditedMessage(messageIndex, updatedContent);
    setIsEditing(false);
  }, [content, editText, messageIndex, onSendEditedMessage]);

  const handleKeyDown = useCallback(
    (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !isComposing &&
        !isTouch
      ) {
        event.preventDefault();
        saveEdit();
      }
    },
    [isComposing, isTouch, saveEdit]
  );

  const handleTextareaChange = (e) => {
    setEditText(e.target.value);
    adjustTextareaHeight();
  };

  const handleCopy = async () => {
    try {
      const textToCopy = Array.isArray(content)
        ? content.map((item) => (item.type === "text" ? item.text : item.name)).join(" ")
        : String(content).replace(/\n$/, "");
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("복사 실패:", err);
    }
  };

  if ((typeof content === "string" && content.trim() === "\u200B") || (Array.isArray(content) && content.length === 0))
    return null;

  if (role === "user") {
    return (
      <motion.div
        className={`user-wrap ${isEditing ? 'editing' : ''}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.3, delay: 0.2, ease: "easeOut" } }}
        exit={{ opacity: 0, x: 20, transition: { duration: 0.3 } }}
      >
        <div className="message-file-area">
          {content.map((item, index) => {
            if (item.type === "file") {
              return (
                <div key={index} className="file-object">
                  <span className="file-name">{item.name}</span>
                </div>
              );
            } else if (item.type === "image") {
              return (
                <div key={index} className="image-object">
                  <img 
                    src={`${process.env.REACT_APP_FASTAPI_URL}${item.content}`} 
                    alt={item.file_name} 
                    onLoad={() => setScrollOnSend && setScrollOnSend(true)} 
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
  
        <div className="chat-message user">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              className="message-edit"
            />
          ) : (
            content.map((item, index) => {
              if (item.type === "text") {
                return <span key={index}>{item.text}</span>;
              }
              return null;
            })
          )}
        </div>
  
        {isEditing ? (
          <div className="edit-buttons">
            <button className="edit-button cancel" onClick={cancelEdit}>취소</button>
            <button className="edit-button save" onClick={saveEdit}>완료</button>
          </div>
        ) : (
          <div className="message-function user">
            {copied ? (
              <GoCheck className="function-button" />
            ) : (
              <GoCopy className="function-button" onClick={handleCopy} />
            )}
            <GoPencil className="function-button" onClick={startEdit} />
            {onDelete && <GoTrash className="function-button" onClick={() => onDelete(messageIndex)} />}
          </div>
        )}
      </motion.div>
    );
  } else if (role === "assistant") {
    return (
      <motion.div
        className="assistant-wrap"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        {...{ exit: { opacity: 0, x: 20 }, transition: { duration: 0.3 } }}
      >
        <div className="chat-message assistant">
          <MarkdownRenderer content={content} isComplete={isComplete !== undefined ? isComplete : true} />
        </div>
        <div className="message-function">
          {copied ? (
            <GoCheck className="function-button" />
          ) : (
            <GoCopy className="function-button" onClick={handleCopy} />
          )}
          {onRegenerate && <GoSync className="function-button" onClick={() => onRegenerate(messageIndex)} />}
        </div>
      </motion.div>
    );
  } else if (role === "error") {
    return (
      <motion.div
        className="chat-message error"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        {...{ exit: { opacity: 0, x: 20 }, transition: { duration: 0.3 } }}
        transition={{ duration: 0.3, delay: 0.8, ease: "easeOut" }}
      >
        <div style={{ marginRight: "7px" }}>{content}</div>
        <div className="refresh-wrap">
          <TbRefresh
            style={{ marginTop: "1px", color: "#666666", fontSize: "18px", cursor: "pointer" }}
            onClick={() => window.location.reload()}
          />
        </div>
      </motion.div>
    );
  }
}

Message.propTypes = {
  role: PropTypes.string.isRequired,
  content: PropTypes.oneOfType([PropTypes.string, PropTypes.array]).isRequired,
  isComplete: PropTypes.bool,
  onDelete: PropTypes.func,
  onRegenerate: PropTypes.func,
  onEdit: PropTypes.func,
  onSendEditedMessage: PropTypes.func,
};

Message.defaultProps = {
  isComplete: true,
};

export default React.memo(Message);