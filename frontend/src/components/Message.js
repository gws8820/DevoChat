// Message.js
import React, { useState, useRef, useLayoutEffect } from "react";
import PropTypes from "prop-types";
import { GoCopy, GoCheck, GoPencil, GoTrash, GoSync } from "react-icons/go";
import { motion } from "framer-motion";
import { MarkdownRenderer } from "./MarkdownRenderers";
import "../styles/Message.css";
import "../styles/FileTile.css";
import "katex/dist/katex.min.css";

const getFileExt = (name) =>
  name && name.includes(".") ? name.split(".").pop().toUpperCase() : "FILE";

function Message({
  messageIndex,
  role,
  content,
  isComplete,
  onDelete,
  onRegenerate,
  onEdit,
  disableActions,
  isLoading,
  isLastMessage,
  shouldRender
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const userTextRef = useRef(null);

  useLayoutEffect(() => {
    if (expanded) return;
    const el = userTextRef.current;
    if (!el) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [content, expanded]);

  const stripMarkdown = (text) => text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/^```\w*\n?/, '').replace(/```$/, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/___(.+?)___/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>{1,}\s*/gm, '')
    .replace(/^[-*_]{3,}$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const handleCopy = async () => {
    try {
      let textToCopy;
      if (Array.isArray(content)) {
        const textItem = content.find((item) => item.type === "text");
        textToCopy = textItem ? textItem.text : "";
      } else {
        textToCopy = String(content)
          .replace(/\n*<tool_use>\r?\n[\s\S]*?\r?\n<\/tool_use>\n*/gi, '')
          .replace(/\n*<tool_result>\r?\n[\s\S]*?\r?\n<\/tool_result>\n*/gi, '')
          .replace(/\n*<tool_(?:use|result)>\r?\n[\s\S]*$/gi, '')
          .replace(/<think>[\s\S]*?<\/think>\n*/gi, '')
          .replace(/<\/?citations>/gi, '')
          .replace(/\n$/, "");
      }
      await navigator.clipboard.writeText(
        stripMarkdown(textToCopy).replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
          String.fromCharCode(parseInt(code, 16))
        )
      );
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
        className="user-wrap"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="message-file-area">
          {content.map((item, idx) => {
            if (item.type === "file") {
              return (
                <a
                  key={idx}
                  href={item.file_path ? `${process.env.REACT_APP_FASTAPI_URL}${item.file_path}` : undefined}
                  className={`file-object ${item.file_path ? 'downloadable' : ''}`}
                >
                  <span className="file-name">{item.name}</span>
                  <span className="file-ext">{getFileExt(item.name)}</span>
                </a>
              );
            }
            if (item.type === "image") {
              return (
                <div key={idx} className="file-object image">
                  <img
                    src={`${process.env.REACT_APP_FASTAPI_URL}${item.content}`}
                    alt={item.name}
                  />
                </div>
              );
            }
            return null;
          })}
        </div>

        <div className={`chat-message user ${shouldRender ? 'visible' : ''} ${expanded ? 'expanded' : ''} ${clamped ? 'clamped' : ''}`}>
          <div ref={userTextRef} className="user-text">
            {content.map((item, idx) =>
              item.type === "text" ? <span key={idx}>{item.text}</span> : null
            )}
          </div>
          {clamped && (
            <button className="message-expand" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "접기" : "펼치기"}
            </button>
          )}
        </div>

        <div className="message-function user">
          {copied ? (
            <GoCheck className="function-button" />
          ) : (
            <GoCopy className="function-button" onClick={handleCopy} />
          )}
          {!disableActions && onEdit && (
            <GoPencil
              className="function-button"
              onClick={() => onEdit(messageIndex)}
            />
          )}
          {!disableActions && onDelete && (
            <GoTrash
              className="function-button"
              onClick={() => onDelete(messageIndex)}
            />
          )}
        </div>
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
              />
            </div>
          </div>
          <div className="message-function">
            {onRegenerate && !disableActions && (
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
            {onRegenerate && !disableActions && (
              <GoSync
                className="function-button"
                onClick={() => onRegenerate(messageIndex)}
              />
            )}
          </div>
        </div>
      );
    }
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
  disableActions: PropTypes.bool,
  isLoading: PropTypes.bool,
  isLastMessage: PropTypes.bool,
  shouldRender: PropTypes.bool
};

Message.defaultProps = {
  isComplete: true,
};

export default React.memo(Message);
