# OpenCode SDK

The OpenCode SDK provides a type-safe JavaScript client for interacting with the OpenCode server.

## Installation / 安装

Install the SDK via npm:

```bash
npm install @opencode-ai/sdk
```

## Setup / 初始化

### Create Client (Server + Client)
Create an instance that starts both a server and a client.

```javascript
import { createOpencode } from "@opencode-ai/sdk"

const { client } = await createOpencode()
```

**Options:**
- `hostname` (string): Default "127.0.0.1"
- `port` (number): Default 4096
- `signal` (AbortSignal): Optional
- `timeout` (number): Default 5000ms
- `config`: Configuration object

Example with config:
```javascript
const opencode = await createOpencode({
  hostname: "127.0.0.1",
  port: 4096,
  config: {
    model: "anthropic/claude-3-5-sonnet-20241022",
  },
})
console.log(`Server running at ${opencode.server.url}`)
opencode.server.close()
```

### Client Only
Connect to an existing running instance.

```javascript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
})
```

**Options:**
- `baseUrl` (string): e.g., "http://localhost:4096"
- `fetch` (function): Custom fetch implementation (default: `globalThis.fetch`)
- `throwOnError` (boolean): Default `false`

## Modules / 模块说明

The SDK is divided into several modules:

- **[Sessions](sessions.md)**: Manage chat sessions, send prompts, and interact with LLMs.
- **[Files & Search](files.md)**: Search text, find files, and read content.
- **[General API](general.md)**: Manage projects, app state, config, auth, and events.
- **[TUI](tui.md)**: Control the Terminal User Interface (prompts, toasts, etc).

## Error Handling / 错误处理

The SDK throws errors that can be caught:

```javascript
try {
  await client.session.get({ path: { id: "invalid-id" } })
} catch (error) {
  console.error("Failed to get session:", error.message)
}
```

## Types / 类型定义

Import types directly from the SDK:

```javascript
import type { Session, Message, Part } from "@opencode-ai/sdk"
```
