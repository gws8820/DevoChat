import React, { useMemo, useRef, createContext, useContext, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm-no-autolink";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"; 
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { GoCopy, GoCheck } from "react-icons/go";
import ToolBlock from "./ToolBlock";
import StatusBlock from "./StatusBlock";
import "../styles/Message.css";
import "katex/dist/katex.min.css";

const ToolBlockStateContext = createContext();

const ToolBlockStateProvider = ({ children }) => {
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

const useToolBlockState = () => {
  const context = useContext(ToolBlockStateContext);
  if (!context) {
    throw new Error('useToolBlockState must be used within ToolBlockStateProvider');
  }
  return context;
};

const InlineCode = React.memo(({ children, ...props }) => {
  return (
    <code className="inline-code" {...props}>
      {children}
    </code>
  );
});

const ThinkingStatusBlock = React.memo(({ children, title, isThinkClosed = false, isLoading = false, isLastMessage = false }) => {
  const isThinking = !isThinkClosed && isLoading && isLastMessage;

  return (
    <StatusBlock type="thinking" isActive={isThinking} activeLabel={title}>
      {children}
    </StatusBlock>
  );
});

const ToolStatusBlock = React.memo(({ toolData }) => {
  const { expandedBlocks, toggleExpanded } = useToolBlockState();
  const toolId = toolData.tool_id;
  const isExpanded = expandedBlocks[toolId] || false;
  const toolName = toolData.tool_name;
  const hasResult = toolData.type === 'tool_result' && toolData.result;
  const isPending = toolData.type === 'tool_use' && toolData.isValid;

  return (
    <StatusBlock
      type="tool"
      label={toolName}
      loading={isPending}
      expandable={Boolean(hasResult)}
      expanded={isExpanded}
      onToggle={() => toggleExpanded(toolId)}
    >
      <ToolBlock toolData={toolData} />
    </StatusBlock>
  );
});

const CitationsBlock = React.memo(({ children }) => {
  return (
    <StatusBlock type="citations">
      {children}
    </StatusBlock>
  );
});

const TempCodeBlock = React.memo(({ className, children }) => {
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

const CodeBlock = React.memo(({ className, children, ...props }) => {
  const [copied, setCopied] = React.useState(false);
  const match = /language-(\w+)/.exec(className || "");
  let language = match ? match[1] : "text";
  const displayLanguage = language;

  if (language === "systemverilog" || language === "sv") {
    language = "verilog";
  }

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
          <span className="code-type">{displayLanguage}</span>
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

const TempPre = React.memo((preProps) => {
  const codeProps = preProps.children.props;
  return <TempCodeBlock {...codeProps} />;
});
const CompletedPre = React.memo((preProps) => {
  const codeProps = preProps.children.props;
  return <CodeBlock {...codeProps} />;
});

const Table = React.memo((props) => (
  <table className="markdown-table" {...props} />
));
const Thead = React.memo((props) => (
  <thead className="markdown-thead" {...props} />
));
const Tbody = React.memo((props) => (
  <tbody className="markdown-tbody" {...props} />
));
const Tr = React.memo((props) => (
  <tr className="markdown-tr" {...props} />
));
const Th = React.memo((props) => (
  <th className="markdown-th" {...props} />
));
const Td = React.memo((props) => (
  <td className="markdown-td" {...props} />
));

function parseSpecialBlocks(rawContent) {
  const escapeAttribute = (value) => (
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  );

  const getCurrentThinkingTitle = (content) => {
    const titlePattern = /(?:^|(?:\r?\n){2,})[ \t]*\*\*([^*\n][^\n]*?)\*\*[ \t]*(?=(?:\r?\n){2,})/g;
    let currentTitle = "";

    for (const match of content.matchAll(titlePattern)) {
      currentTitle = match[1].trim();
    }

    return currentTitle;
  };

  const normalize = (content, tag, className) => {
    const tagPattern = new RegExp(`</?${tag}>`, 'gi');
    const openCount = (content.match(new RegExp(`<${tag}>`, 'gi')) || []).length;
    const closeCount = (content.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    const hasTag = openCount + closeCount > 0;
    const isClosed = hasTag ? closeCount >= openCount && closeCount > 0 : false;

    let updatedContent = "";
    let lastIndex = 0;
    let openStart = null;
    let blockIndex = 0;

    for (const match of content.matchAll(tagPattern)) {
      const tagText = match[0];
      const isCloseTag = tagText.startsWith("</");

      if (!isCloseTag && openStart === null) {
        updatedContent += content.slice(lastIndex, match.index);
        openStart = match.index + tagText.length;
        lastIndex = openStart;
        continue;
      }

      if (isCloseTag && openStart !== null) {
        const blockContent = content.slice(openStart, match.index);
        let titleAttribute = "";

        if (tag === "think") {
          const title = getCurrentThinkingTitle(blockContent);
          if (title) {
            titleAttribute = ` data-title="${escapeAttribute(title)}"`;
          }
        }

        updatedContent += `<div class="${className}" data-block-index="${blockIndex}" data-is-closed="true"${titleAttribute}>\n\n${blockContent}</div>`;
        blockIndex += 1;
        openStart = null;
        lastIndex = match.index + tagText.length;
      }
    }

    if (openStart !== null) {
      const blockContent = content.slice(openStart);
      let titleAttribute = "";

      if (tag === "think") {
        const title = getCurrentThinkingTitle(blockContent);
        if (title) {
          titleAttribute = ` data-title="${escapeAttribute(title)}"`;
        }
      }

      updatedContent += `<div class="${className}" data-block-index="${blockIndex}" data-is-closed="false"${titleAttribute}>\n\n${blockContent}</div>`;
    } else {
      updatedContent += content.slice(lastIndex);
    }

    return { content: updatedContent, state: { hasTag, isClosed } };
  };
  
  let result = rawContent;
  const thinkResult = normalize(result, 'think', 'think-block');
  result = thinkResult.content;
  const citationsResult = normalize(result, 'citations', 'citations-block');
  result = citationsResult.content;

  return {
    content: result,
    states: {
      think: thinkResult.state,
      citations: citationsResult.state,
    },
  };
}

function parseToolBlocks(rawContent, isLoading, isLastMessage) {
  const toolData = {};
  const processedToolIds = new Set();
  const toolSequence = [];

  const escapeAttribute = (value) => (
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  );

  const closedBlocks = [];
  const closedStarts = new Set();
  const closedTagPattern = /<tool_(use|result)>\r?\n([\s\S]*?)\r?\n<\/tool_\1>/gi;
  let closedMatch;

  while ((closedMatch = closedTagPattern.exec(rawContent)) !== null) {
    const tagType = closedMatch[1];
    const jsonData = closedMatch[2];
    const block = {
      kind: "closed",
      type: tagType,
      jsonData,
      start: closedMatch.index,
      end: closedMatch.index + closedMatch[0].length,
      data: null,
      toolId: null,
    };

    try {
      const data = JSON.parse(jsonData);
      const toolId = data.tool_id;

      if (toolId) {
        block.data = data;
        block.toolId = toolId;
        toolSequence.push({ type: tagType, toolId, data, start: block.start, end: block.end });
      }
    } catch (e) {
      console.error('Error parsing Tool tag:', e);
    }

    closedBlocks.push(block);
    closedStarts.add(block.start);
  }

  const incompleteBlocks = [];
  const toolStartPattern = /<tool_(use|result)>\r?\n/gi;
  let startMatch;

  while ((startMatch = toolStartPattern.exec(rawContent)) !== null) {
    const startIndex = startMatch.index;
    const startType = startMatch[1];
    if (closedStarts.has(startIndex)) continue;

    const nextClosedBlock = closedBlocks.find((block) => block.start > startIndex);
    incompleteBlocks.push({
      kind: "incomplete",
      type: startType,
      start: startIndex,
      end: nextClosedBlock ? nextClosedBlock.start : rawContent.length,
    });
  }
  
  const validResults = new Set();
  for (let i = 0; i < toolSequence.length; i++) {
    const current = toolSequence[i];
    
    if (current.type === 'use') {
      const next = toolSequence[i + 1];
      if (next && next.type === 'result' && next.toolId === current.toolId) {
        validResults.add(current.toolId);
      } else {
        const afterToolUse = rawContent.slice(current.end);
        const trimmedAfter = afterToolUse.trim();
        const hasStreamingResult = incompleteBlocks.some((block) => {
          if (block.type !== 'result' || block.start < current.end) return false;
          return rawContent.slice(current.end, block.start).trim() === '';
        });

        if ((trimmedAfter === '' || hasStreamingResult) && isLoading && isLastMessage) {
          validResults.add(current.toolId);
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

  const ranges = [...closedBlocks, ...incompleteBlocks].sort((a, b) => a.start - b.start);
  let processedContent = "";
  let lastIndex = 0;

  ranges.forEach((block) => {
    if (block.start < lastIndex) return;

    processedContent += rawContent.slice(lastIndex, block.start);

    if (block.kind === "closed" && block.toolId && !processedToolIds.has(block.toolId)) {
      processedToolIds.add(block.toolId);
      processedContent += '<div class="tool-block" data-tool-id="' + escapeAttribute(block.toolId) + '"></div>';
    }

    lastIndex = block.end;
  });

  processedContent += rawContent.slice(lastIndex);
  
  return { content: processedContent, toolData };
}

function preprocessMarkdownContent(content) {
  const mathParts = [];
  const stash = (value) => {
    const token = `@@MATH_${mathParts.length}@@`;
    mathParts.push(value);
    return token;
  };
  const isMath = (value) => /\\[a-zA-Z]+|[=+\-*/^_{}|]/.test(value) || /^\S+$/.test(value);

  let result = String(content)
    .replace(/^(#{2,3}) #{2,4}(?= )/gm, "$1")
    .replace(/(^|[\s(])[₩￦](?=\s*\d)/g, "$1₩")
    .replace(/\\\[/g, () => "$$")
    .replace(/\\\]/g, () => "$$");

  result = result
    .replace(/\$\$[\s\S]*?\$\$/g, stash)
    .replace(/(^|[^\\])\$((?:\\.|[^\n$])+?)\$/g, (match, prefix, value) => {
      return isMath(value) ? `${prefix}${stash(`$${value}$`)}` : match;
    })
    .replace(/(^|[\s(])\$(?=\s*\d)/g, "$1\\$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\*\*([^*\n]+)\*\*/g, (match, inner) => {
      let fixed = inner;
      if (/^[\p{P}]/u.test(inner)) fixed = "\u200B" + fixed;
      if (/[\p{P}]$/u.test(inner)) fixed = fixed + "\u200B";
      return fixed !== inner ? `**${fixed}**` : match;
    })
    .replace(/@@MATH_(\d+)@@/g, (match, index) => mathParts[Number(index)] ?? match);

  return result;
}

const MarkdownRenderer = React.memo(({ content, isComplete = false, isLoading = false, isLastMessage = false }) => {
  const { finalContent, toolData } = useMemo(() => {
    const { content: contentWithToolBlocks, toolData } = parseToolBlocks(String(content), isLoading, isLastMessage);
    const parsedContent = preprocessMarkdownContent(contentWithToolBlocks);
    const { content: finalContent } = parseSpecialBlocks(parsedContent);
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
      br: () => <span className="markdown-line-break" aria-hidden="true" />,
      div: ({ className, children, ...props }) => {
        if (className === "tool-block") {
          const toolId = props['data-tool-id'];
          const { toolData: currentToolData } = dynamicDataRef.current;

          if (!toolId || !currentToolData || !currentToolData[toolId]) {
            return null;
          }
          return <ToolStatusBlock toolData={currentToolData[toolId]} />;
        }
        if (className === "think-block") {
          const { isLoading: currentIsLoading, isLastMessage: currentIsLastMessage } = dynamicDataRef.current;
          const isThinkClosed = props['data-is-closed'] !== "false";
          const title = props['data-title'] || "";
          return (
            <ThinkingStatusBlock
              title={title}
              isThinkClosed={isThinkClosed}
              isLoading={currentIsLoading}
              isLastMessage={currentIsLastMessage}
            >
              {children}
            </ThinkingStatusBlock>
          );
        }
        if (className === "citations-block") {
          return <CitationsBlock>{children}</CitationsBlock>;
        }
        return <div className={className} {...props} />;
      },
    };
  }, []);
  
  return (
    <ToolBlockStateProvider>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkBreaks, remarkGfm]}
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
                  ["dataBlockIndex"],
                  ["data-block-index"],
                  ["dataIsClosed"],
                  ["data-is-closed"],
                  ["dataTitle"],
                  ["data-title"],
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
