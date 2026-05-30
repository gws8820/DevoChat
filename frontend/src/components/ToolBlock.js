import React from 'react';
import '../styles/ToolBlock.css';

const MAX_VISIBLE_RESULT_LENGTH = 60000;

const formatResult = (result) => {
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2) ?? '';

  if (text.length <= MAX_VISIBLE_RESULT_LENGTH) return text;

  const omittedLength = text.length - MAX_VISIBLE_RESULT_LENGTH;
  return text.slice(0, MAX_VISIBLE_RESULT_LENGTH) + '\n\n... 도구 결과 ' + omittedLength.toLocaleString() + '자 생략됨';
};

const ToolBlock = React.memo(({ toolData }) => {
  const serverName = toolData.server_name?.replace(/_/g, ' ');
  const toolName = toolData.tool_name;
  const statusText = toolData.is_error ? '실패' : '완료';
  const resultText = formatResult(toolData.result);

  return (
    <div className="tool-detail-card">
      <div className="tool-detail-header">
        <div className="tool-detail-title">
          <span className="tool-detail-server">{serverName}</span>
          <span className="tool-detail-name">{toolName}</span>
        </div>
        <span className={`tool-detail-status${toolData.is_error ? ' error' : ''}`}>
          {statusText}
        </span>
      </div>
      <pre className="tool-detail-result">{resultText}</pre>
    </div>
  );
}, (prevProps, nextProps) => {
  const prevData = prevProps.toolData;
  const nextData = nextProps.toolData;

  return (
    prevData.server_name === nextData.server_name &&
    prevData.tool_name === nextData.tool_name &&
    prevData.is_error === nextData.is_error &&
    prevData.result === nextData.result
  );
});

export default ToolBlock;
