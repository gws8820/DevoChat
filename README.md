# DevoChat

*English | [한국어](README.ko.md)*

### Unified AI Chat Platform
DevoChat is a web application that allows you to use various multimodal AI models and MCP (Model Context Protocol) servers through a single interface. Check out the [live demo](https://devochat.com).

## Key Features

- **Unified Conversation System**
  - Uses MongoDB-based unified schema to freely switch between AI models during conversations without losing context.
  - Provides client layers that normalize data to meet the API requirements of each AI provider.
  - Offers an integrated management environment for various media files including images, PDFs, and documents.

- **Advanced Conversation Feature**
  - Provides parameter controls including temperature, reasoning intensity, response length, and system prompt modification.
  - Supports markdown, LaTeX formula, and code block rendering.
  - Enables streaming responses and simulates streaming for non-streaming models by sending complete responses in chunks.
  - Supports image generation via Text-to-Image and Image-to-Image models.
  - Supports real-time/low-latency STS (Speech-To-Speech) conversations through RealTime API.

- **Model Switching Architecture**
  - Allows immediate addition of various AI models to the system through JSON modification without code changes.
  - Supports toggling of additional features like inference, search, and deep research for hybrid models.
  - Enables linking separate provider models (e.g., Qwen3-235B-A22B-Instruct-2507, Qwen3-235B-A22B-Thinking-2507) with a "switch" variant to function as a single hybrid model.

- **Web-based MCP Client**
  - Connects directly to all types of MCP servers (SSE, Local) from web browsers.
  - Provides simple access to local MCP servers from anywhere on the web using the [secure-mcp-proxy](https://github.com/gws8820/secure-mcp-proxy) package.
  - Supports visual monitoring of real-time tool calls and execution processes.

## Screenshots

<table>
  <tr>
    <td align="center" width="50%">
      <img src="samples/main.png" alt="Main Page">
      <br>
      <em>Main Page</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/model-select.png" alt="Model Selection">
      <br>
      <em>Model Selection</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/docs.png" alt="File Upload">
      <br>
      <em>File Upload</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/image.png" alt="Image Upload">
      <br>
      <em>Image Upload</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/image-generation.png" alt="Image Generation">
      <br>
      <em>Image Generation</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/image-edit.png" alt="Image Editing">
      <br>
      <em>Image Editing</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/code.png" alt="Code Block">
      <br>
      <em>Code Highlighting</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/latex.png" alt="LaTeX Formula">
      <br>
      <em>Formula Rendering</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/url.png" alt="URL Processing">
      <br>
      <em>URL Processing</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/realtime.png" alt="Real-time Conversation">
      <br>
      <em>Real-time Conversation</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="samples/mcp-select.png" alt="MCP Server Selection">
      <br>
      <em>MCP Server Selection</em>
    </td>
    <td align="center" width="50%">
      <img src="samples/mcp-use.png" alt="MCP Server Usage">
      <br>
      <em>MCP Server Usage</em>
    </td>
  </tr>
</table>

## Project Structure

```
devochat/
├── frontend/                           # React frontend
│   ├── src/
│   │   ├── components/                 # UI components
│   │   │   ├── Header.js               # Main header
│   │   │   ├── ImageHeader.js          # Image generation page header
│   │   │   ├── Sidebar.js              # Sidebar navigation
│   │   │   ├── Message.js              # Message rendering
│   │   │   ├── InputContainer.js       # Chat input container
│   │   │   ├── ImageInputContainer.js  # Image generation input container
│   │   │   ├── MCPModal.js             # MCP server selection modal
│   │   │   ├── Toast.js                # Notification messages
│   │   │   ├── Tooltip.js              # Tooltips
│   │   │   └── ...
│   │   ├── pages/                      # Page components
│   │   │   ├── Chat.js                 # Main chat page
│   │   │   ├── Image.js                # Image generation page
│   │   │   ├── Realtime.js             # Real-time conversation page
│   │   │   ├── Admin.js                # Admin page
│   │   │   ├── Login.js                # Login page
│   │   │   ├── Register.js             # Registration page
│   │   │   └── ...
│   │   ├── contexts/                   # State management
│   │   │   ├── SettingsContext.js      # Model/settings state
│   │   │   └── ConversationsContext.js # Conversations list state
│   │   ├── utils/                      # Utility functions
│   │   │   ├── useFileUpload.js        # File upload hook
│   │   │   └── utils.js                # Common utilities
│   │   ├── styles/                     # CSS stylesheets
│   │   │   ├── Common.css              # Common styles
│   │   │   ├── Header.css              # Header styles
│   │   │   ├── Sidebar.css             # Sidebar styles
│   │   │   └── ...
│   │   └── App.js                      # Main app component
│
├── backend/                            # FastAPI backend
│   ├── main.py                         # FastAPI application entry point
│   ├── routes/                         # API routers
│   │   ├── auth.py                     # Authentication/authorization management
│   │   ├── conversations.py            # Conversation management API
│   │   ├── uploads.py                  # File upload handling
│   │   ├── realtime.py                 # Real-time communication
│   │   ├── common.py                   # Common utilities
│   │   ├── clients/                    # Text AI model clients
│   │   │   ├── openai_client.py
│   │   │   ├── anthropic_client.py
│   │   │   ├── google_client.py
│   │   │   ├── mistral_client.py
│   │   │   ├── grok_client.py
│   │   │   ├── perplexity_client.py
│   │   │   ├── fireworks_client.py
│   │   │   ├── friendli_client.py
│   │   │   └── ...
│   │   └── image_clients/              # Image generation AI model clients
│   │       ├── openai_client.py
│   │       ├── flux_client.py
│   │       ├── google_client.py
│   │       ├── grok_client.py
│   │       ├── byteplus_client.py
│   │       └── alibaba_client.py
│   ├── models.json                     # Text AI model settings
│   ├── image_models.json               # Image generation AI model settings
│   ├── mcp_servers.json                # MCP server settings
│   ├── prompts/                        # System prompts
│   ├── uploads/                        # Uploaded files storage
│   ├── generated/                      # Generated images storage
│   ├── logs/                           # Log files
│   └── .venv/                          # Python virtual environment
```

## Tech Stack

![React](https://img.shields.io/badge/React-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![JavaScript](https://img.shields.io/badge/JavaScript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Textract](https://img.shields.io/badge/Textract-FF6F61?style=for-the-badge)

## Installation and Setup

### Frontend

#### Environment Variables
```
WDS_SOCKET_PORT=0
REACT_APP_FASTAPI_URL=http://localhost:8000
```

#### Package Installation and Start
```bash
$ cd frontend
$ npm install
$ npm start
```

#### Build and Deploy
```bash
$ cd frontend
$ npm run build
$ npx serve -s build
```

### Backend

#### Python Virtual Environment Setup
```bash
$ cd backend
$ python -m venv .venv
$ source .venv/bin/activate  # Windows: .venv\Scripts\activate
$ pip install -r requirements.txt
```

#### Environment Variables
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chat_db
PRODUCTION_URL=https://your-production-domain.com
DEVELOPMENT_URL=http://localhost:3000
AUTH_KEY=your_auth_secret_key

# API Key Configuration
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

#### Run FastAPI Server
```bash
$ uvicorn main:app --host=0.0.0.0 --port=8000 --reload
```

## Usage

### models.json Configuration

Define the AI models available in the application and their properties through the `models.json` file:

```json
{
  "default": "gpt-5-mini",
  "models": [
    {
      "model_name": "claude-sonnet-4-20250514",
      "model_alias": "Claude 4 Sonnet",
      "description": "High-performance Claude model",
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
      "description": "High-performance Grok model",
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
      "description": "High-performance reasoning GPT model",
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

### Parameter Description

| Parameter | Description |
|---------|------|
| `model_name` | The actual identifier of the model used in API calls |
| `model_alias` | User-friendly name displayed in the UI |
| `description` | Brief description of the model for reference when selecting |
| `endpoint` | API path for handling model requests in the backend (e.g., `/gpt`, `/claude`, `/gemini`) |
| `billing` | Object containing model usage cost information |
| `billing.in_billing` | Billing cost for input tokens (prompts). Unit: USD per million tokens |
| `billing.out_billing` | Billing cost for output tokens (responses). Unit: USD per million tokens |
| `variants` | Defines models to switch to for `"switch"` type |
| `capabilities` | Defines the features supported by the model |
| `capabilities.stream` | Whether streaming response is supported |
| `capabilities.image` | Whether image processing is supported |
| `capabilities.inference` | Whether inference is supported. Possible values: `true`, `false`, `"toggle"`, `"switch"` |
| `capabilities.search` | Whether web search is supported. Possible values: `true`, `false`, `"toggle"`, `"switch"` |
| `capabilities.deep_research` | Whether Deep Research is supported. Possible values: `true`, `false`, `"toggle"`, `"switch"` |
| `capabilities.mcp` | Whether MCP server integration is supported. Possible values: `true`, `false` |
| `controls` | Defines user control options supported by the model |
| `controls.temperature` | Whether temperature adjustment is possible. Possible values: `true`, `false`, `"conditional"` |
| `controls.reason` | Whether Reasoning Effect adjustment is possible. Possible values: `true`, `false` |
| `controls.verbosity` | Whether response length control is possible. Possible values: `true`, `false` |
| `controls.system_message` | Whether system message setting is possible. Possible values: `true`, `false` |
| `admin` | If `true`, only admin users can access/select this model |

### Value Description

#### true
The feature is always enabled.

#### false  
The feature is not supported.

#### toggle
For hybrid models, users can turn this feature on or off as needed.

#### switch
When a user toggles this feature, it switches to another individual model. Dynamic switching occurs to models defined in the `variants` object.

#### conditional  
Available in standard mode, but not available in inference mode.

### image_models.json Configuration

Define the image generation AI models available in the application and their properties through the `image_models.json` file:

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

### Image Model Parameter Description

| Parameter | Description |
|---------|------|
| `capabilities.image.type` | Whether image input is supported. `true`: supported, `false`: not supported, `"switch"`: switch to variant model |
| `capabilities.image.max_input` | Maximum number of images that can be input simultaneously |

### Model Switching System (Variants)

You can define various variants of models through the `variants` object.

#### Example
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

## MCP Server Configuration

DevoChat is a web-based MCP (Model Context Protocol) client.
You can define external servers to connect to in the `mcp_servers.json` file.

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

### Recommended MCP Servers

- **[github](https://github.com/modelcontextprotocol/servers/tree/main/src/github)**
- **[spotify](https://github.com/varunneal/spotify-mcp)** 
- **[arxiv](https://github.com/blazickjp/arxiv-mcp-server)**
- **[perplexity](https://github.com/jsonallen/perplexity-mcp)**
- **[apple-mcp](https://github.com/peakmojo/applescript-mcp)**
- **[desktop-commander](https://github.com/wonderwhy-er/DesktopCommanderMCP)**
- ...

### Local MCP Server Integration

To connect local MCP servers, use [secure-mcp-proxy](https://github.com/gws8820/secure-mcp-proxy):

```bash
git clone https://github.com/gws8820/secure-mcp-proxy
cd secure-mcp-proxy
uv run python -m secure_mcp_proxy --named-server-config servers.json --port 3000
```

## Contributing

1. Fork this repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request
   
## License

This project is distributed under the [MIT License](LICENSE).
