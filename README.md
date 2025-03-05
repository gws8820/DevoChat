# DevoChat

### AI 모델을 위한 통합 대화 플랫폼
DevoChat은 여러 AI 모델을 단일 인터페이스에서 사용할 수 있는 웹 애플리케이션입니다. 다양한 AI 서비스 API를 통합하여 일관된 사용자 경험을 제공합니다.

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
      <img src="samples/code-sample.png" alt="Code Block 샘플">
      <br>
      <em>코드 하이라이팅</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/latex-sample.png" alt="LaTeX 샘플">
      <br>
      <em>수식 렌더링</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/image-sample.png" alt="이미지 샘플">
      <br>
      <em>이미지 업로드</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/doc-sample.png" alt="문서 샘플">
      <br>
      <em>문서 파일 업로드</em>
    </td>
  </tr>
</table>

## 주요 기능

- **다중 AI 모델 지원**
  - GPT
  - Claude
  - Gemini
  - Sonar
  - Deepseek
  - Llama
  - Grok
  - ... 기타 원하는 모델
    
- **고급 대화 기능**
  - 실시간 스트리밍 응답
  - 추론 과정 시각화
  - 웹 검색 통합
  - 이미지 업로드 및 분석
  - 다양한 파일 형식 업로드 및 텍스트 추출
  - 마크다운, 수식(LaTeX), 코드 블록 렌더링
  - 시스템 프롬프트, DAN 모드, Temperature, Reasoning Effect 조절

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
LLAMA_API_KEY=...
DEEPSEEK_API_KEY=...
XAI_API_KEY=...
```

#### FastAPI 서버 실행
```bash
$ uvicorn main:app --host=0.0.0.0 --port=8000 --reload
```

## 사용법

### models.json 설정

`models.json` 파일을 통해 애플리케이션에서 사용 가능한 AI 모델들의 속성을 정의합니다:

```json
{
    "models": [
      {
        "model_name": "gpt-4.5-preview",
        "model_alias": "GPT 4.5 (Preview)",
        "description": "고성능 최신 GPT 모델",
        "endpoint": "/gpt",
        "in_billing": "75",
        "out_billing": "150",
        "inference": false,
        "stream": true,
        "capabilities": {
          "image": true,
          "search": false
        },
        "type": "default"
      },
      {
        "model_name": "claude-3-7-sonnet-latest:1",
        "model_alias": "Claude 3.7 Sonnet Thinking",
        "description": "추론이 가능한 최신 Claude 모델",
        "endpoint": "/claude",
        "in_billing": "3",
        "out_billing": "15",
        "inference": true,
        "stream": true,
        "capabilities": {
          "image": true,
          "search": false
        },
        "type": "think"
      },
      ...
    ]
}
```

### 파라미터 설명

| 파라미터 | 설명 |
|---------|------|
| `model_name` | API 호출 시 사용되는 모델의 실제 식별자입니다. 같은 모델의 다른 구성을 위해 인덱스(`:0`, `:1` 등)를 추가할 수 있습니다. |
| `model_alias` | UI에 표시되는 모델의 사용자 친화적인 이름입니다. |
| `description` | 모델에 대한 간략한 설명으로, 선택 시 참고할 수 있습니다. |
| `endpoint` | 백엔드에서 해당 모델 요청을 처리할 API 경로입니다. (예: `/gpt`, `/claude`) |
| `in_billing` | 입력 토큰(프롬프트)에 대한 청구 비용입니다. 단위는 백만 토큰당 USD입니다. |
| `out_billing` | 출력 토큰(응답)에 대한 청구 비용입니다. 단위는 백만 토큰당 USD입니다. |
| `search_billing` | (선택 사항) 검색 기능 사용 시 추가되는 청구 비용입니다. |
| `inference` | 추론(reasoning) 기능 지원 여부입니다. `true`인 경우 추론 UI가 활성화됩니다. |
| `stream` | 응답 스트리밍 지원 여부입니다. `true`인 경우 실시간으로 응답이 표시됩니다. |
| `capabilities` | 모델이 지원하는 특수 기능들을 정의합니다. |
| `capabilities.image` | 이미지 처리 기능 지원 여부입니다. |
| `capabilities.search` | 실시간 웹 검색 기능 지원 여부입니다. |
| `type` | 모델의 유형을 나타냅니다. 가능한 값: `default`, `think`, `reason`, `none` |

### 모델 유형 설명

- **default**: 기본 채팅 모델
- **think**: Claude의 Extended Thinking을 지원하는 모델
- **reason**: Reasoning-Effect를 지원하는 모델
- **none**: Temperature나 System Message를 지원하지 않는 모델

### 지원되는 파일 형식

- **이미지**: jpg, jpeg, png, gif, bmp, webp
- **문서**: pdf, doc, docx, pptx, xlsx, csv, txt, rtf, html, htm, odt, eml, epub, msg
- **데이터**: json, xml, tsv, yml, yaml
- **코드**: py, java, c, cpp, h, hpp, js, jsx, ts, tsx, css, scss, less, cs, sh, bash, bat, ps1, go, rs, php 등

## 향후 계획

- **다국어 지원**: 영어 인터페이스 추가 예정
- **모바일 앱 개발**: iOS 및 Android 네이티브 앱 출시 예정

## 기여하기

1. 이 저장소를 포크합니다
2. 새 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`)
3. 변경사항을 커밋합니다 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
5. Pull Request를 생성합니다
   
## 라이선스

이 프로젝트는 [MIT 라이선스](LICENSE)하에 배포됩니다.
