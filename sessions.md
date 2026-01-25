# OpenCode SDK Sessions API

本文档整理自 [OpenCode SDK Sessions Documentation](https://opencode.ai/docs/sdk/#sessions)。

## API 列表

### List Sessions

列出所有会话。

```javascript
session.list()
// Returns: Session[]
```

### Get Session

获取特定会话详情。

```javascript
session.get({ path })
// Returns: Session
```

### Get Session Children

获取子会话。

```javascript
session.children({ path })
// Returns: Session[]
```

### Create Session

创建新会话。

```javascript
session.create({ body })
// Returns: Session
```

### Delete Session

删除会话。

```javascript
session.delete({ path })
// Returns: boolean
```

### Update Session

更新会话信息。

```javascript
session.update({ path, body })
// Returns: Session
```

### Init Session

初始化会话。

```javascript
session.init({ path, body })
// Returns: boolean
```

### Abort Session

中止正在运行的会话生成。

```javascript
session.abort({ path })
// Returns: boolean
```

### Share Session

分享会话。

```javascript
session.share({ path })
// Returns: Session
```

### Unshare Session

取消分享会话。

```javascript
session.unshare({ path })
// Returns: Session
```

### Summarize Session

生成会话总结。

```javascript
session.summarize({ path, body })
// Returns: boolean
```

### List Messages

获取会话中的消息列表。

```javascript
session.messages({ path })
// Returns: { info: Message, parts: Part[] }[]
```

### Get Message

获取特定消息。

```javascript
session.message({ path })
// Returns: { info: Message, parts: Part[] }
```

### Send Prompt

发送提示词给 AI。

```javascript
session.prompt({ path, body })
// Returns: AssistantMessage
// body.noReply: true to inject context without triggering AI response
```

### Send Command

发送命令。

```javascript
session.command({ path, body })
// Returns: { info: AssistantMessage, parts: Part[] }
```

### Run Shell

运行 Shell 命令。

```javascript
session.shell({ path, body })
// Returns: AssistantMessage
```

### Revert Session

回滚会话到指定状态。

```javascript
session.revert({ path, body })
// Returns: Session
```

### Unrevert Session

取消回滚。

```javascript
session.unrevert({ path })
// Returns: Session
```

### Update Permissions

更新会话权限。

```javascript
postSessionByIdPermissionsByPermissionId({ path, body })
// Returns: boolean
```

## 示例 (Examples)

### 创建和管理会话

```javascript
// Create and manage sessions
const session = await client.session.create({
  body: { title: "My session" },
})

const sessions = await client.session.list()
```

### 发送消息

```javascript
// Send a prompt message
const result = await client.session.prompt({
  path: { id: session.id },
  body: {
    model: {
      providerID: "anthropic",
      modelID: "claude-3-5-sonnet-20241022"
    },
    parts: [{ type: "text", text: "Hello!" }],
  },
})
```

### 注入上下文 (无回复)

```javascript
// Inject context without triggering AI response (useful for plugins)
await client.session.prompt({
  path: { id: session.id },
  body: {
    noReply: true,
    parts: [{ type: "text", text: "You are a helpful assistant." }],
  },
})
```
