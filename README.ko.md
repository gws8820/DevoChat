# DevoChat

*[English](README.md) | 한국어*

### 통합 인공지능 대화 플랫폼
DevoChat은 다양한 멀티모달 AI 모델과 MCP (Model Context Protocol) 서버를 하나의 인터페이스에서 사용할 수 있는 웹 애플리케이션입니다. [여기](https://devochat.com)에서 라이브 데모를 확인하세요.

## 주요 기능

- **통합 대화 시스템**
  - MongoDB 기반의 통합 스키마를 사용하여, 대화 중에도 컨텍스트 손실 없이 AI 모델을 자유롭게 전환할 수 있습니다.
  - 각 AI 제공업체별 API 요구사항에 맞게 데이터를 정규화하는 클라이언트 레이어를 제공합니다.
  - 이미지, PDF, 문서 등 다양한 미디어 파일을 통합 관리하는 환경을 제공합니다.

- **고급 대화 기능**
  - 온도, 추론 강도, 답변 길이, 시스템 프롬프트 수정 등 세부 파라미터 제어를 제공합니다.
  - 마크다운, LaTeX 수식, 코드 블럭 렌더링을 제공합니다.
  - 스트리밍 응답을 지원하며, 비스트리밍 모델의 경우 전체 응답을 청크 단위로 전송하여 스트리밍을 시뮬레이션합니다.
  - Text-to-Image/Image-to-Image 모델을 통한 이미지 생성을 지원합니다.
  - 실시간/저지연 STS (Speech-To-Speech) 대화를 위한 RealTime API를 지원합니다.

- **모델 전환 아키텍처**
  - JSON 설정만으로 코드 수정 없이 다양한 AI 모델을 시스템에 즉시 추가할 수 있습니다.
  - 하이브리드 모델의 경우 추론, 검색, 딥 리서치 등 각 모델의 특화 기능을 필요에 따라 토글할 수 있습니다.
  - 제공업체가 기능을 여러 모델로 분할한 경우(예: Qwen3-235B-A22B-Instruct-2507, Qwen3-235B-A22B-Thinking-2507), "switch" 변형으로 연결하여 단일 하이브리드 모델처럼 작동하도록 구현했습니다.

- **웹 기반 MCP 클라이언트**
  - 웹 브라우저에서 모든 유형의 MCP 서버(SSE, 로컬)에 직접 연결할 수 있습니다.
  - [secure-mcp-proxy](https://github.com/gws8820/secure-mcp-proxy) 패키지를 사용하면 로컬 MCP 서버를 언제 어디서나 웹에서 간단히 접근할 수 있습니다.
  - 도구 호출과 실행 과정을 실시간으로 시각화하여 직관적인 사용자 경험을 제공합니다.

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
      <img src="samples/docs.png" alt="파일 업로드">
      <br>
      <em>파일 업로드</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/image.png" alt="이미지 업로드">
      <br>
      <em>이미지 업로드</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/image-generation.png" alt="이미지 생성">
      <br>
      <em>이미지 생성</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/image-edit.png" alt="이미지 편집">
      <br>
      <em>이미지 편집</em>
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
      <img src="samples/url.png" alt="URL 링크 처리">
      <br>
      <em>URL 처리</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/realtime.png" alt="실시간 대화">
      <br>
      <em>실시간 대화</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/mcp-select.png" alt="MCP 서버 선택">
      <br>
      <em>MCP 서버 선택</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/mcp-use.png" alt="MCP 서버 사용">
      <br>
      <em>MCP 서버 사용</em>
    </td>
  </tr>
</table>

## 프로젝트 구조

```
devochat/
├── frontend/                           # React 프론트엔드
│   ├── src/
│   │   ├── components/                 # UI 컴포넌트
│   │   │   ├── Header.js               # 메인 헤더
│   │   │   ├── ImageHeader.js          # 이미지 생성 페이지 헤더
│   │   │   ├── Sidebar.js              # 사이드바 네비게이션
│   │   │   ├── Message.js              # 메시지 렌더링
│   │   │   ├── InputContainer.js       # 채팅 입력 컨테이너
│   │   │   ├── ImageInputContainer.js  # 이미지 생성 입력 컨테이너
│   │   │   ├── MCPModal.js             # MCP 서버 선택 모달
│   │   │   ├── Toast.js                # 알림 메시지
│   │   │   ├── Tooltip.js              # 도구 설명
│   │   │   └── ...
│   │   ├── pages/                      # 페이지 컴포넌트
│   │   │   ├── Chat.js                 # 메인 채팅 페이지
│   │   │   ├── Image.js                # 이미지 생성 페이지
│   │   │   ├── Realtime.js             # 실시간 대화 페이지
│   │   │   ├── Admin.js                # 관리자 페이지
│   │   │   ├── Login.js                # 로그인 페이지
│   │   │   ├── Register.js             # 회원가입 페이지
│   │   │   └── ...
│   │   ├── contexts/                   # 상태 관리
│   │   │   ├── SettingsContext.js      # 모델/설정 상태
│   │   │   └── ConversationsContext.js # 대화 목록 상태
│   │   ├── utils/                      # 유틸리티 함수
│   │   │   ├── useFileUpload.js        # 파일 업로드 훅
│   │   │   └── utils.js                # 공통 유틸리티
│   │   ├── styles/                     # CSS 스타일시트
│   │   │   ├── Common.css              # 공통 스타일
│   │   │   ├── Header.css              # 헤더 스타일
│   │   │   ├── Sidebar.css             # 사이드바 스타일
│   │   │   └── ...
│   │   └── App.js                      # 메인 앱 컴포넌트
│
├── backend/                            # FastAPI 백엔드
│   ├── main.py                         # FastAPI 애플리케이션 진입점
│   ├── routes/                         # API 라우터
│   │   ├── auth.py                     # 인증/권한 관리
│   │   ├── conversations.py            # 대화 관리 API
│   │   ├── uploads.py                  # 파일 업로드 처리
│   │   ├── realtime.py                 # 실시간 통신
│   │   ├── common.py                   # 공통 유틸리티
│   │   ├── clients/                    # 텍스트 AI 모델 클라이언트
│   │   │   ├── openai_client.py
│   │   │   ├── anthropic_client.py
│   │   │   ├── google_client.py
│   │   │   ├── mistral_client.py
│   │   │   ├── grok_client.py
│   │   │   ├── perplexity_client.py
│   │   │   ├── fireworks_client.py
│   │   │   ├── friendli_client.py
│   │   │   └── ...
│   │   └── image_clients/              # 이미지 생성 AI 모델 클라이언트
│   │       ├── openai_client.py
│   │       ├── flux_client.py
│   │       ├── google_client.py
│   │       ├── grok_client.py
│   │       ├── byteplus_client.py
│   │       └── alibaba_client.py
│   ├── models.json                     # 텍스트 AI 모델 설정
│   ├── image_models.json               # 이미지 생성 AI 모델 설정
│   ├── mcp_servers.json                # MCP 서버 설정
│   ├── prompts/                        # 시스템 프롬프트
│   ├── uploads/                        # 업로드된 파일 저장소
│   ├── generated/                      # 생성된 이미지 저장소
│   ├── logs/                           # 로그 파일
│   └── .venv/                          # Python 가상환경
```

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
MISTRAL_API_KEY=...
FIREWORKS_API_KEY=...
FRIENDLI_API_KEY=...
FLUX_API_KEY=...
BYTEPLUS_API_KEY=...
ALIBABA_API_KEY=...
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
  "default": "gpt-5-mini",
  "models": [
    {
      "model_name": "claude-sonnet-4-20250514",
      "model_alias": "Claude 4 Sonnet",
      "description": "고성능 Claude 모델",
      "endpoint": "/claude",
      "billing": {
        "in_billing": "3",
        "out_billing": "15"
      },
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
        "verbosity": true,
        "system_message": true
      },
      "admin": false
    },
    {
      "model_name": "grok-4",
      "model_alias": "Grok 4",
      "description": "고성능 Grok 모델",
      "endpoint": "/grok",
      "billing": {
        "in_billing": "3",
        "out_billing": "15"
      },
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
        "verbosity": true,
        "system_message": true
      },
      "admin": false
    },
    {
      "model_name": "o3",
      "model_alias": "OpenAI o3",
      "description": "고성능 추론 GPT 모델",
      "endpoint": "/gpt",
      "billing": {
        "in_billing": "2",
        "out_billing": "8"
      },
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
        "verbosity": true,
        "system_message": true
      },
      "admin": false
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
| `billing` | 모델 사용 비용 정보를 담는 객체입니다. |
| `billing.in_billing` | 입력 토큰(프롬프트)에 대한 청구 비용입니다. 단위는 백만 토큰당 USD입니다. |
| `billing.out_billing` | 출력 토큰(응답)에 대한 청구 비용입니다. 단위는 백만 토큰당 USD입니다. |
| `variants` | `"switch"` 타입일 때 전환할 모델을 정의합니다. |
| `capabilities` | 모델이 지원하는 기능들을 정의합니다. |
| `capabilities.stream` | 스트리밍 응답 지원 여부입니다. |
| `capabilities.image` | 이미지 처리 기능 지원 여부입니다. |
| `capabilities.inference` | 추론 지원 여부입니다. 가능한 값: `true`, `false`, `"toggle"`, `"switch"` |
| `capabilities.search` | 웹 검색 지원 여부입니다. 가능한 값: `true`, `false`, `"toggle"`, `"switch"` |
| `capabilities.deep_research` | Deep Research 지원 여부입니다. 가능한 값: `true`, `false`, `"toggle"`, `"switch"` |
| `capabilities.mcp` | MCP 서버 연동 지원 여부입니다. 가능한 값: `true`, `false` |
| `controls` | 모델이 지원하는 사용자 제어 옵션들을 정의합니다. |
| `controls.temperature` | Temperature 조절 가능 여부입니다. 가능한 값: `true`, `false`, `"conditional"` |
| `controls.reason` | Reasoning Effect 조절 가능 여부입니다. 가능한 값: `true`, `false` |
| `controls.verbosity` | 답변 길이(verbosity) 조절 가능 여부입니다. 가능한 값: `true`, `false` |
| `controls.system_message` | 시스템 메시지 설정 가능 여부입니다. 가능한 값: `true`, `false` |
| `admin` | `true`인 경우, 관리자만 해당 모델을 선택/사용할 수 있습니다. |

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

### image_models.json 설정

`image_models.json` 파일을 통해 애플리케이션에서 사용 가능한 이미지 생성 AI 모델들과 그 속성을 정의합니다:

```json
{
  "default": "seedream-3-0-t2i-250415",
  "models": [
    {
      "model_name": "flux-kontext-max",
      "model_alias": "Flux Kontext Max",
      "description": "Black Forest Labs",
      "endpoint": "/image/flux",
      "billing": {
        "in_billing": "0",
        "out_billing": "0.08"
      },
      "capabilities": { 
        "image": { 
          "type": true, 
          "max_input": 4 
        } 
      },
      "admin": false
    },
    {
      "model_name": "seedream-3-0-t2i-250415",
      "model_alias": "Seedream 3.0",
      "description": "BytePlus",
      "endpoint": "/image/byteplus",
      "billing": {
        "in_billing": "0",
        "out_billing": "0.03"
      },
      "variants": {
        "image": "seededit-3-0-i2i-250628"
      },
      "capabilities": { 
        "image": { 
          "type": "switch" 
        } 
      },
      "admin": false
    }
  ]
}
```

### 파라미터 설명

| 파라미터 | 설명 |
|---------|------|
| `capabilities.image.type` | 이미지 입력 지원 여부입니다. `true`: 지원, `false`: 미지원, `"switch"`: 모델 동적 전환 |
| `capabilities.image.max_input` | 동시에 입력 가능한 최대 이미지 수입니다. |

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
