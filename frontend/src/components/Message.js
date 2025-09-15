// Message.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { GoCopy, GoCheck, GoPencil, GoTrash, GoSync } from "react-icons/go";
import { TbRefresh } from "react-icons/tb";
import { motion } from "framer-motion";
import TextareaAutosize from "react-textarea-autosize";
import { MarkdownRenderer } from "./MarkdownRenderers";
import "../styles/Message.css";
import "katex/dist/katex.min.css";

function Message({
  messageIndex,
  role,
  content,
  isComplete,
  onDelete,
  onRegenerate,
  onSendEditedMessage,
  setScrollTrigger,
  isTouch,
  isLoading,
  isLastMessage,
  shouldRender
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef(null);
  
  const startEdit = () => {
    let textContent = "";
    if (Array.isArray(content)) {
      textContent = content.find((item) => item.type === "text")?.text || "";
    } else if (typeof content === "string") {
      textContent = content;
    } else if (content != null) {
      textContent = String(content);
    }
    setEditText(textContent);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditText("");
  };

  useEffect(() => {
    cancelEdit();
  }, [content]);

  const saveEdit = useCallback(() => {
    if (!editText.trim()) return;

    const nonText = content.filter((item) => item.type !== "text");
    const updated = [{ type: "text", text: editText }, ...nonText];
    onSendEditedMessage(messageIndex, updated);
    setIsEditing(false);
  }, [content, editText, messageIndex, onSendEditedMessage]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey && !isComposing && !isTouch) {
        e.preventDefault();
        saveEdit();
      }
    },
    [isComposing, isTouch, saveEdit]
  );

  const handleTextareaChange = (e) => {
    setEditText(e.target.value);
  };

  const handleCopy = async () => {
    try {
      let textToCopy;
      if (Array.isArray(content)) {
        const textItem = content.find((item) => item.type === "text");
        textToCopy = textItem ? textItem.text : "";
      } else {
        textToCopy = String(content)
          .replace(/\n\n<tool_use>\n.*?\n<\/tool_use>\n/gi, '')
          .replace(/\n<tool_result>\n.*?\n<\/tool_result>\n\n/gi, '')
          .replace(/<\/?think>/gi, '')
          .replace(/<\/?citations>/gi, '')
          .replace(/\n$/, "");
      }
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("복사에 실패했습니다.", err);
    }
  };

  if (
    (typeof content === "string" && content.trim() === "\u200B") ||
    (Array.isArray(content) && content.length === 0)
  ) return null;

  if (role === "user") {
    return (
      <motion.div
        className={`user-wrap ${isEditing ? "editing" : ""}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } }}
      >
        <div className="message-file-area">
          {content.map((item, idx) => {
            if (item.type === "file") {
              return (
                <div key={idx} className="file-object">
                  <a
                    href={item.file_path ? `${process.env.REACT_APP_FASTAPI_URL}${item.file_path}` : undefined}
                    className={`file-name ${item.file_path ? 'downloadable' : ''}`}
                  >
                    {item.name}
                  </a>
                </div>
              );
            }
            if (item.type === "image") {
              return (
                <div key={idx} className="image-object">
                  <img
                    src={`${process.env.REACT_APP_FASTAPI_URL}${item.content}`}
                    alt={item.name}
                    onLoad={() => {
                      if (setScrollTrigger) {
                        setScrollTrigger((v) => v + 1);
                      }
                    }}
                  />
                </div>
              );
            }
            return null;
          })}
        </div>

        <div className={`chat-message user ${shouldRender ? 'visible' : ''}`}>
          {isEditing ? (
            <TextareaAutosize
              ref={textareaRef}
              autoFocus
              className="message-edit"
              minRows={1}
              value={editText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              style={{ resize: "none", overflow: "hidden" }}
            />
          ) : (
            content.map((item, idx) =>
              item.type === "text" ? <span key={idx}>{item.text}</span> : null
            )
          )}
        </div>

        {isEditing ? (
          <div className="edit-buttons">
            <button className="edit-button cancel" onClick={cancelEdit}>
              취소
            </button>
            <button className="edit-button save" onClick={saveEdit}>
              완료
            </button>
          </div>
        ) : (
          <div className="message-function user">
            {copied ? (
              <GoCheck className="function-button" />
            ) : (
              <GoCopy className="function-button" onClick={handleCopy} />
            )}
            {onSendEditedMessage && (
              <GoPencil 
                className="function-button"
                onClick={startEdit} 
              /> 
            )}
            {onDelete && (
              <GoTrash
                className="function-button"
                onClick={() => onDelete(messageIndex)}
              />
            )}
          </div>
        )}
      </motion.div>
    );
  } else if (role === "assistant") {
    if (content.type === "image") {
      return (
        <div className="assistant-wrap">
          <div className="message-file-area">
            <div className="image-object">
              <img
                src={`${process.env.REACT_APP_FASTAPI_URL}${content.content}`}
                alt={content.name}
                onLoad={() => {
                  if (setScrollTrigger) {
                    setScrollTrigger((v) => v + 1);
                  }
                }}
              />
            </div>
          </div>
          <div className="message-function">
            {onRegenerate && (
              <GoSync
                className="function-button"
                onClick={() => onRegenerate(messageIndex)}
              />
            )}
          </div>
        </div>
      );
    } else {
      return (
        <div className="assistant-wrap">
          <div className={`chat-message assistant ${shouldRender ? 'visible' : ''}`}>
            <MarkdownRenderer
              content={String(content)}
              isComplete={isComplete !== undefined ? isComplete : true}
              isLoading={isLoading}
              isLastMessage={isLastMessage}
            />
          </div>
          <div className="message-function">
            {copied ? (
              <GoCheck className="function-button" />
            ) : (
              <GoCopy className="function-button" onClick={handleCopy} />
            )}
            {onRegenerate && (
              <GoSync
                className="function-button"
                onClick={() => onRegenerate(messageIndex)}
              />
            )}
          </div>
        </div>
      );
    }
  } else if (role === "error") {
    return (
      <motion.div
        className={`chat-message error ${shouldRender ? 'visible' : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.8, ease: "easeOut" }}
      >
        <div style={{ marginRight: "7px" }}>{content}</div>
        <div className="refresh-wrap">
          <TbRefresh
            style={{ color: "#666666", fontSize: "18px", cursor: "pointer" }}
            onClick={() => window.location.reload()}
          />
        </div>
      </motion.div>
    );
  }
}

Message.propTypes = {
  messageIndex: PropTypes.number.isRequired,
  role: PropTypes.string.isRequired,
  content: PropTypes.oneOfType([PropTypes.string, PropTypes.array]).isRequired,
  isComplete: PropTypes.bool,
  onDelete: PropTypes.func,
  onRegenerate: PropTypes.func,
  onEdit: PropTypes.func,
  onSendEditedMessage: PropTypes.func,
  setScrollTrigger: PropTypes.func,
  isTouch: PropTypes.bool,
  isLoading: PropTypes.bool,
  isLastMessage: PropTypes.bool,
  shouldRender: PropTypes.bool
};

Message.defaultProps = {
  isComplete: true,
};

export default React.memo(Message);