# DevoChat

*[English](README.md) | 한국어*

### 통합 인공지능 대화 플랫폼
DevoChat은 다양한 AI 모델과 MCP (Model Context Protocol) 서버를 하나의 인터페이스에서 사용할 수 있는 웹 애플리케이션입니다.

## 데모

라이브 데모를 [여기](https://devochat.com)에서 확인하세요.

## 스크린샷

<table>
  <tr>
    <td align="center" width="50%">
      <img src="samples/main.png" alt="메인 화면">
      <br>
      <em>메인 화면</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/model-select.png" alt="모델 선택 화면">
      <br>
      <em>모델 선택 화면</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/code.png" alt="코드 블록">
      <br>
      <em>코드 하이라이팅</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/latex.png" alt="LaTeX 수식">
      <br>
      <em>수식 렌더링</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/image.png" alt="이미지 업로드">
      <br>
      <em>이미지 업로드 및 분석</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/docs.png" alt="파일 업로드">
      <br>
      <em>파일 업로드</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/url.png" alt="URL 링크 처리">
      <br>
      <em>URL 처리</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/mcp-select.png" alt="MCP 서버 선택">
      <br>
      <em>MCP 서버 선택</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/mcp-use.png" alt="MCP 서버 사용">
      <br>
      <em>MCP 서버 사용</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/realtime.png" alt="실시간 대화">
      <br>
      <em>실시간 대화</em>
    </td>
  </tr>
</table>

## 주요 기능

- **다중 AI 모델 지원**
  - GPT
  - Claude
  - Grok
  - Gemini
  - Perplexity
  - Llama
  - Deepseek
  - ... 기타 원하는 모델
    
- **고급 대화 기능**
  - Realtime 대화
  - 스트리밍 응답
  - 추론 과정 시각화
  - 웹 검색 통합
  - Deep Research 모드
  - 이미지 업로드 및 분석
  - 다양한 파일 형식 업로드 및 텍스트 추출
  - 마크다운, 수식(LaTeX), 코드 블록 렌더링
  - 시스템 프롬프트, DAN 모드, Temperature, Reasoning Effect 조절
  - 모델 동적 전환

- **MCP(Model Context Protocol) 클라이언트**
  - 모든 형태의 MCP 서버 연동 가능
  - secure-mcp-proxy를 통한 로컬 MCP 서버 연동
  - 실시간 도구 호출 및 결과 시각화

- **대화 관리**
  - 대화 내역 저장 및 조회
  - 메시지 편집, 삭제, 재생성
  - 자동 대화명 생성
  - 사용량 계산 및 관리

## 기술 스택

![React](https://img.shields.io/badge/React-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![JavaScript](https://img.shields.io/badge/JavaScript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Textract](https://img.shields.io/badge/Textract-FF6F61?style=for-the-badge)

## 설치 및 실행

### 프론트엔드

#### 환경변수 설정
```
WDS_SOCKET_PORT=0
REACT_APP_FASTAPI_URL=http://localhost:8000
```

#### 패키지 설치 및 시작
```bash
$ cd frontend
$ npm install
$ npm start
```

#### 빌드 및 배포
```bash
$ cd frontend
$ npm run build
$ npx serve -s build
```

### 백엔드

#### 파이썬 가상환경 설정
```bash
$ cd backend
$ python -m venv .venv
$ source .venv/bin/activate  # Windows: .venv\Scripts\activate
$ pip install -r requirements.txt
```

#### 환경변수 설정
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chat_db
PRODUCTION_URL=https://your-production-domain.com
DEVELOPMENT_URL=http://localhost:3000
AUTH_KEY=your_auth_secret_key

# API 키 설정
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
PERPLEXITY_API_KEY=...
HUGGINGFACE_API_KEY=...
XAI_API_KEY=...
```

#### FastAPI 서버 실행
```bash
$ uvicorn main:app --host=0.0.0.0 --port=8000 --reload
```

## 사용법

### models.json 설정

`models.json` 파일을 통해 애플리케이션에서 사용 가능한 AI 모델들과 그 속성을 정의합니다:

```json
{
    "models": [
      {
        "model_name": "claude-sonnet-4-20250514",
        "model_alias": "Claude 4 Sonnet",
        "description": "고성능 Claude 모델",
        "endpoint": "/claude",
        "in_billing": "3",
        "out_billing": "15",
        "capabilities": {
          "stream": true,
          "image": true,
          "inference": "toggle",
          "search": "toggle",
          "deep_research": false
        },
        "controls": {
          "temperature": "conditional",
          "reason": true,
          "system_message": true
        }
      },
      {
        "model_name": "grok-3",
        "model_alias": "Grok 3",
        "description": "표준 Grok 모델",
        "endpoint": "/grok",
        "in_billing": "3",
        "out_billing": "15",
        "capabilities": {
          "stream": true,
          "image": false,
          "inference": false,
          "search": false,
          "deep_research": false
        },
        "controls": {
          "temperature": true,
          "reason": false,
          "system_message": true
        }
      },
      {
        "model_name": "o3",
        "model_alias": "OpenAI o3",
        "description": "고성능 추론 GPT 모델",
        "endpoint": "/gpt",
        "in_billing": "2",
        "out_billing": "8",
        "variants": {
          "deep_research": "o3-deep-research"
        },
        "capabilities": {
          "stream": true,
          "image": true,
          "inference": true,
          "search": false,
          "deep_research": "switch"
        },
        "controls": {
          "temperature": false,
          "reason": true,
          "system_message": true
        }
      }
      ...
    ]
}
```

### 파라미터 설명

| 파라미터 | 설명 |
|---------|------|
| `model_name` | API 호출 시 사용되는 모델의 실제 식별자입니다. |
| `model_alias` | UI에 표시되는 모델의 사용자 친화적인 이름입니다. |
| `description` | 모델에 대한 간략한 설명으로, 선택 시 참고할 수 있습니다. |
| `endpoint` | 백엔드에서 해당 모델 요청을 처리할 API 경로입니다. (예: `/gpt`, `/claude`, `/gemini`) |
| `in_billing` | 입력 토큰(프롬프트)에 대한 청구 비용입니다. 단위는 백만 토큰당 USD입니다. |
| `out_billing` | 출력 토큰(응답)에 대한 청구 비용입니다. 단위는 백만 토큰당 USD입니다. |
| `variants` | `"switch"` 타입일 때 전환할 모델을 정의합니다. |
| `capabilities` | 모델이 지원하는 기능들을 정의합니다. |
| `capabilities.stream` | 스트리밍 응답 지원 여부입니다. |
| `capabilities.image` | 이미지 처리 기능 지원 여부입니다. |
| `capabilities.inference` | 추론 지원 여부입니다. 가능한 값: `true`, `false`, `"toggle"`, `"switch"` |
| `capabilities.search` | 웹 검색 지원 여부입니다. 가능한 값: `true`, `false`, `"toggle"`, `"switch"` |
| `capabilities.deep_research` | Deep Research 지원 여부입니다. 가능한 값: `true`, `false`, `"toggle"`, `"switch"` |
| `controls` | 모델이 지원하는 사용자 제어 옵션들을 정의합니다. |
| `controls.temperature` | Temperature 조절 가능 여부입니다. 가능한 값: `true`, `false`, `"conditional"` |
| `controls.reason` | Reasoning Effect 조절 가능 여부입니다. 가능한 값: `true`, `false` |
| `controls.system_message` | 시스템 메시지 설정 가능 여부입니다. 가능한 값: `true`, `false` |

### 값 설명

#### true
해당 기능이 항상 활성화되어 있습니다.

#### false  
해당 기능이 지원되지 않습니다.

#### toggle
하이브리드 모델일 때, 사용자 필요에 따라 해당 기능을 켜거나 끌 수 있습니다.

#### switch
사용자가 해당 기능을 토글할 때 다른 개별 모델로 전환됩니다. `variants` 객체에 정의된 모델로 동적 전환이 이루어집니다.

#### conditional  
표준 모드에서는 사용할 수 있으나, 추론 모드에서는 사용할 수 없습니다.

### 모델 전환 시스템 (Variants)

`variants` 객체를 통해 모델의 다양한 변형을 정의할 수 있습니다.

#### 예시
```json
{
  "model_name": "sonar",
  "variants": {
    "inference": "sonar-reasoning",
    "deep_research": "sonar-deep-research"
  },
  "capabilities": {
    "inference": "switch",
    "deep_research": "switch"
  }
},
{
  "model_name": "sonar-reasoning",
  "variants": {
    "base": "sonar"
  },
  "capabilities": {
    "inference": "switch"
  }
}
```

## MCP 서버 설정

DevoChat은 웹 기반 MCP(Model Context Protocol) 클라이언트입니다.
`mcp_servers.json` 파일에서 연결할 외부 서버들을 정의할 수 있습니다.

### mcp_servers.json

```json
{
  "server-id": {
    "url": "https://example.com/mcp/endpoint",
    "authorization_token": "your_authorization_token", 
    "name": "Server_Display_Name",
    "admin": false
  }
}
```

### 추천 MCP 서버

- **[github](https://github.com/modelcontextprotocol/servers/tree/main/src/github)**
- **[spotify](https://github.com/varunneal/spotify-mcp)** 
- **[arxiv](https://github.com/blazickjp/arxiv-mcp-server)**
- **[perplexity](https://github.com/jsonallen/perplexity-mcp)**
- **[apple-mcp](https://github.com/peakmojo/applescript-mcp)**
- **[desktop-commander](https://github.com/wonderwhy-er/DesktopCommanderMCP)**
- ...

### 로컬 MCP 서버 연동

로컬 MCP 서버를 연결하려면 [secure-mcp-proxy](https://github.com/gws8820/secure-mcp-proxy)를 사용하세요:

```bash
git clone https://github.com/gws8820/secure-mcp-proxy
cd secure-mcp-proxy
uv run python -m secure_mcp_proxy --named-server-config servers.json --port 3000
```
## 기여하기

1. 이 저장소를 포크합니다
2. 새 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`)
3. 변경사항을 커밋합니다 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
5. Pull Request를 생성합니다
   
## 라이선스

이 프로젝트는 [MIT 라이선스](LICENSE)하에 배포됩니다.