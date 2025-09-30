// src/components/markdownrenderers.js
import React, { useMemo, useRef, createContext, useContext, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm-no-autolink";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"; 
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { GoCopy, GoCheck } from "react-icons/go";
import ToolBlock from "./ToolBlock";
import "../styles/Message.css";
import "katex/dist/katex.min.css";

const ToolBlockStateContext = createContext();

export const ToolBlockStateProvider = ({ children }) => {
  const [expandedBlocks, setExpandedBlocks] = useState({});
  
  const toggleExpanded = (toolId) => {
    setExpandedBlocks(prev => ({
      ...prev,
      [toolId]: !prev[toolId]
    }));
  };
  
  return (
    <ToolBlockStateContext.Provider value={{ expandedBlocks, toggleExpanded }}>
      {children}
    </ToolBlockStateContext.Provider>
  );
};

export const useToolBlockState = () => {
  const context = useContext(ToolBlockStateContext);
  if (!context) {
    throw new Error('useToolBlockState must be used within ToolBlockStateProvider');
  }
  return context;
};

export const InlineCode = React.memo(({ children, ...props }) => {
  return (
    <code className="inline-code" {...props}>
      {children}
    </code>
  );
});

export const TempCodeBlock = React.memo(({ className, children, ...props }) => {
  const [copied, setCopied] = React.useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "javascript";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(children).replace(/\n$/, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("복사 실패:", err);
    }
  };

  return (
    <div className="code-block">
      <div className="code-header-wrap">
        <div className="code-header">
          <span className="code-type">{language}</span>
          <button className="copy-button" onClick={handleCopy}>
            {copied ? <GoCheck /> : <GoCopy />}
          </button>
        </div>
      </div>
      <pre
        style={{
          margin: 0,
          borderRadius: "0px 0px 6px 6px",
          padding: "16px",
          backgroundColor: "#f5f5f5",
          overflowX: "auto",
        }}
      >
        {String(children).replace(/\n$/, "")}
      </pre>
    </div>
  );
});

export const CodeBlock = React.memo(({ className, children, ...props }) => {
  const [copied, setCopied] = React.useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "text";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(children).replace(/\n$/, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("복사 실패:", err);
    }
  };

  return (
    <div className="code-block">
      <div className="code-header-wrap">
        <div className="code-header">
          <span className="code-type">{language}</span>
          <button className="copy-button" onClick={handleCopy}>
            {copied ? <GoCheck /> : <GoCopy />}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneLight}
        {...props}
        customStyle={{
          margin: 0,
          borderRadius: "0px 0px 6px 6px",
          padding: "16px",
          backgroundColor: "#f5f5f5",
          overflowX: "auto",
        }}
      >
        {String(children).replace(/\n$/, "")}
      </SyntaxHighlighter>
    </div>
  );
});

export const TempPre = React.memo((preProps) => {
  const codeProps = preProps.children.props;
  return <TempCodeBlock {...codeProps} />;
});
export const CompletedPre = React.memo((preProps) => {
  const codeProps = preProps.children.props;
  return <CodeBlock {...codeProps} />;
});

export const Table = React.memo((props) => (
  <table className="markdown-table" {...props} />
));
export const Thead = React.memo((props) => (
  <thead className="markdown-thead" {...props} />
));
export const Tbody = React.memo((props) => (
  <tbody className="markdown-tbody" {...props} />
));
export const Tr = React.memo((props) => (
  <tr className="markdown-tr" {...props} />
));
export const Th = React.memo((props) => (
  <th className="markdown-th" {...props} />
));
export const Td = React.memo((props) => (
  <td className="markdown-td" {...props} />
));

function parseSpecialBlocks(rawContent) {
  const normalize = (content, tag, className) => {
    const openCount = (content.match(new RegExp(`<${tag}>`, 'gi')) || []).length;
    const closeCount = (content.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    if (openCount > closeCount) {
      content += `</${tag}>`;
    }
    return content.replace(
      new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi'),
      (match) => `<div class="${className}">${match.replace(new RegExp(`</?${tag}>`, 'gi'), "")}</div>`
    );
  };
  
  let result = rawContent;
  result = normalize(result, 'think', 'think-block');
  result = normalize(result, 'citations', 'citations-block');

  return result;
}

function parseToolBlocks(rawContent, isLoading, isLastMessage) {
  const toolData = {};
  const processedToolIds = new Set();
  const toolSequence = [];
  const toolMatches = [...rawContent.matchAll(/<tool_(use|result)>\n(.*?)\n<\/tool_\1>/gi)];
  
  toolMatches.forEach((match) => {
    const tagType = match[1];
    const jsonData = match[2];
    
    try {
      const data = JSON.parse(jsonData);
      const toolId = data.tool_id;
      
      toolSequence.push({ type: tagType, toolId, data });
    } catch (e) {
      console.error('Error parsing Tool tag:', e);
    }
  });
  
  const validResults = new Set();
  for (let i = 0; i < toolSequence.length; i++) {
    const current = toolSequence[i];
    
    if (current.type === 'use') {
      const next = toolSequence[i + 1];
      if (next && next.type === 'result' && next.toolId === current.toolId) {
        validResults.add(current.toolId);
      } else {
        const toolUsePattern = new RegExp(`<tool_use>\\n.*?"tool_id"\\s*:\\s*"${current.toolId}".*?\\n</tool_use>`, 'g');
        const match = toolUsePattern.exec(rawContent);
        if (match) {
          const afterToolUse = rawContent.substring(match.index + match[0].length);
          const trimmedAfter = afterToolUse.trim();
          if ((trimmedAfter === '' || trimmedAfter === '</div>') && isLoading && isLastMessage) {
            validResults.add(current.toolId);
          }
        }
      }
    }
  }
  
  toolSequence.forEach(({ type, toolId, data }) => {
    if (type === 'use') {
      toolData[toolId] = {
        type: 'tool_use',
        tool_id: toolId,
        server_name: data.server_name,
        tool_name: data.tool_name,
        isValid: validResults.has(toolId)
      };
    } else {
      toolData[toolId] = {
        type: 'tool_result',
        tool_id: toolId,
        server_name: data.server_name,
        tool_name: data.tool_name,
        is_error: data.is_error,
        result: data.result
      };
    }
  });
  
  const processedContent = rawContent.replace(
    /<tool_(use|result)>\n(.*?)\n<\/tool_\1>/gi,
    (match, tagType, jsonData) => {
      try {
        const data = JSON.parse(jsonData);
        const toolId = data.tool_id;
        
        if (!processedToolIds.has(toolId)) {
          processedToolIds.add(toolId);
          return `<div class="tool-block" data-tool-id="${toolId}"></div>`;
        }
        
        return '';
      } catch (e) {
        console.error('Error parsing Tool tag:', e);
        return '';
      }
    }
  );
  
  return { content: processedContent, toolData };
}

const MarkdownRenderer = React.memo(({ content, isComplete = false, isLoading = false, isLastMessage = false }) => {
  const { finalContent, toolData } = useMemo(() => {
    let parsedContent = content
      .replace(/\\\[/g, "$$")
      .replace(/\\\]/g, "$$")
      .replace(/\\\(/g, "$")
      .replace(/\\\)/g, "$");
    parsedContent = parseSpecialBlocks(parsedContent);
    const { content: finalContent, toolData } = parseToolBlocks(parsedContent, isLoading, isLastMessage);
    return { finalContent, toolData };
  }, [content, isLoading, isLastMessage]);

  const dynamicDataRef = useRef({ isComplete, toolData, isLoading, isLastMessage });
  dynamicDataRef.current = { isComplete, toolData, isLoading, isLastMessage };

  const components = useMemo(() => {
    return {
      a: ({ children, ...props }) => (
        <a target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      ),
      del: ({ children }) => <>~{children}~</>,
      code: InlineCode,
      pre: ({ children, ...props }) => {
        const { isComplete: currentIsComplete } = dynamicDataRef.current;
        return currentIsComplete ? <CompletedPre {...props}>{children}</CompletedPre> : <TempPre {...props}>{children}</TempPre>;
      },
      table: Table,
      thead: Thead,
      tbody: Tbody,
      tr: Tr,
      th: Th,
      td: Td,
      hr: () => null,
      div: ({ className, ...props }) => {
        if (className === "tool-block") {
          const toolId = props['data-tool-id'];
          const { toolData: currentToolData, isLoading: currentIsLoading, isLastMessage: currentIsLastMessage } = dynamicDataRef.current;
          
          if (!toolId || !currentToolData || !currentToolData[toolId]) {
            return null;
          }
          const toolData = currentToolData[toolId];
          return <ToolBlock toolData={toolData} isLoading={currentIsLoading} isLastMessage={currentIsLastMessage} />;
        }
        return <div className={className} {...props} />;
      },
    };
  }, []);
  
  return (
    <ToolBlockStateProvider>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [
            rehypeSanitize,
            {
              ...defaultSchema,
              attributes: {
                ...defaultSchema.attributes,
                div: [
                  ...(defaultSchema.attributes?.div || []),
                  ["className", "think-block", "citations-block", "tool-block"],
                  ["dataToolId"],
                  ["data-tool-id"],
                  /^data-/,
                ],
                code: [
                  ...(defaultSchema.attributes?.code || []),
                  ["className", /^language-/, "math-inline", "math-display"],
                ],
              },
            },
          ],
          [rehypeKatex, { strict: "ignore" }],
        ]}
        skipHtml={false}
        components={components}
      >
        {finalContent}
      </ReactMarkdown>
    </ToolBlockStateProvider>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.content === nextProps.content &&
    prevProps.isComplete === nextProps.isComplete &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.isLastMessage === nextProps.isLastMessage
  );
});

export { MarkdownRenderer };