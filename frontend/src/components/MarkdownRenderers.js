// src/components/markdownrenderers.js
import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"; 
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { GoCopy, GoCheck } from "react-icons/go";
import MCPBlock from "./MCPBlock";
import "../styles/Message.css";
import "katex/dist/katex.min.css";

export const InlineCode = React.memo(({ node, children, ...props }) => {
  return (
    <code className="inline-code" {...props}>
      {children}
    </code>
  );
});

export const TempCodeBlock = React.memo(({ node, className, children, ...props }) => {
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

export const CodeBlock = React.memo(({ node, className, children, ...props }) => {
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

export const Table = React.memo(({ node, ...props }) => (
  <table className="markdown-table" {...props} />
));
export const Thead = React.memo(({ node, ...props }) => (
  <thead className="markdown-thead" {...props} />
));
export const Tbody = React.memo(({ node, ...props }) => (
  <tbody className="markdown-tbody" {...props} />
));
export const Tr = React.memo(({ node, ...props }) => (
  <tr className="markdown-tr" {...props} />
));
export const Th = React.memo(({ node, ...props }) => (
  <th className="markdown-th" {...props} />
));
export const Td = React.memo(({ node, ...props }) => (
  <td className="markdown-td" {...props} />
));

function parseThinkBlocks(rawContent) {
  const openThinkCount = (rawContent.match(/<think>/gi) || []).length;
  const closeThinkCount = (rawContent.match(/<\/think>/gi) || []).length;
  if (openThinkCount > closeThinkCount) {
    rawContent += "</think>";
  }
  return rawContent.replace(
    /<think>([\s\S]*?)<\/think>/gi,
    (match) => `<div class="think-block">${match.replace(/<\/?think>/gi, "")}</div>`
  );
}

function parseMCPBlocks(rawContent) {
  const mcpData = {};
  const processedToolIds = new Set();
  
  rawContent = rawContent.replace(
    /<mcp_tool_(use|result)>\n(.*?)\n<\/mcp_tool_\1>/gi,
    (match, tagType, jsonData) => {
      try {
        const data = JSON.parse(jsonData);
        const toolId = data.tool_id;
        
        if (tagType === 'use') {
          mcpData[toolId] = {
            type: 'mcp_tool_use',
            server_name: data.server_name,
            tool_name: data.tool_name
          };
        } else {
          mcpData[toolId] = {
            type: 'mcp_tool_result',
            server_name: data.server_name,
            tool_name: data.tool_name,
            is_error: data.is_error,
            result: data.result
          };
        }
        
        if (!processedToolIds.has(toolId)) {
          processedToolIds.add(toolId);
          return `<div class="mcp-tool-block" data-tool-id="${toolId}"></div>`;
        }
        
        return '';
      } catch (e) {
        console.error('Error parsing MCP tag:', e);
        return '';
      }
    }
  );
  
  return { content: rawContent, mcpData };
}

const MCPToolBlock = React.memo(({ node, ...props }) => {
  const toolId = props['data-tool-id'];
  const mcpData = props.mcpData;
  
  if (!toolId || !mcpData || !mcpData[toolId]) {
    return null;
  }
  
  const toolData = mcpData[toolId];
  
  return <MCPBlock toolData={toolData} />;
});

export const MarkdownRenderer = React.memo(function MarkdownRenderer({ content, isComplete }) {
  const { finalContent, mcpData } = useMemo(() => {
    let parsedContent = content.replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
    parsedContent = parseThinkBlocks(parsedContent);
    const { content: finalContent, mcpData } = parseMCPBlocks(parsedContent);
    return { finalContent, mcpData };
  }, [content]);
  
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
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
                ["className", "think-block", "mcp-tool-block"],
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
      components={{
        a: ({ node, children, ...props }) => (
          <a target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>
        ),
        code: InlineCode,
        pre: isComplete ? CompletedPre : TempPre,
        table: Table,
        thead: Thead,
        tbody: Tbody,
        tr: Tr,
        th: Th,
        td: Td,
        hr: () => null,
        div: ({ node, className, ...props }) => {
          if (className === "mcp-tool-block") {
            return <MCPToolBlock {...props} mcpData={mcpData} />;
          }
          return <div className={className} {...props} />;
        },
      }}
    >
      {finalContent}
    </ReactMarkdown>
  );
});