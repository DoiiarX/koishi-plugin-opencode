# SDK Type Definitions

This document contains comprehensive type definitions from the OpenCode SDK.

https://github.com/anomalyco/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts

## Events

### Core Events
```typescript
export type Event =
  | EventServerInstanceDisposed
  | EventInstallationUpdated
  | EventInstallationUpdateAvailable
  | EventLspClientDiagnostics
  | EventLspUpdated
  | EventMessageUpdated
  | EventMessageRemoved
  | EventMessagePartUpdated
  | EventMessagePartRemoved
  | EventPermissionUpdated
  | EventPermissionReplied
  | EventSessionStatus
  | EventSessionIdle
  | EventSessionCompacted
  | EventFileEdited
  | EventTodoUpdated
  | EventCommandExecuted
  | EventSessionCreated
  | EventSessionUpdated
  | EventSessionDeleted
  | EventSessionDiff
  | EventSessionError
  | EventFileWatcherUpdated
  | EventVcsBranchUpdated
  | EventTuiPromptAppend
  | EventTuiCommandExecute
  | EventTuiToastShow
  | EventPtyCreated
  | EventPtyUpdated
  | EventPtyExited
  | EventPtyDeleted
  | EventServerConnected
```

### Session Events
```typescript
export type EventSessionCreated = {
  type: "session.created"
  properties: {
    info: Session
  }
}

export type EventSessionUpdated = {
  type: "session.updated"
  properties: {
    info: Session
  }
}

export type EventSessionDeleted = {
  type: "session.deleted"
  properties: {
    info: Session
  }
}
```

### Message Events
```typescript
export type EventMessageUpdated = {
  type: "message.updated"
  properties: {
    info: Message
  }
}

export type EventMessagePartUpdated = {
  type: "message.part.updated"
  properties: {
    part: Part
    delta?: string
  }
}
```

## Parts

### Part Union Type
```typescript
export type Part =
  | TextPart
  | {
      id: string
      sessionID: string
      messageID: string
      type: "subtask"
      prompt: string
      description: string
      agent: string
    }
  | ReasoningPart
  | FilePart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart
  | AgentPart
  | RetryPart
  | CompactionPart
```

### Tool Part
```typescript
export type ToolPart = {
  id: string
  sessionID: string
  messageID: string
  type: "tool"
  callID: string
  tool: string
  state: ToolState
  metadata?: {
    [key: string]: unknown
  }
}

export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError
```

### Other Parts
```typescript
export type TextPart = {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
  time?: {
    start: number
    end?: number
  }
  metadata?: {
    [key: string]: unknown
  }
}

export type ReasoningPart = {
  id: string
  sessionID: string
  messageID: string
  type: "reasoning"
  text: string
  metadata?: {
    [key: string]: unknown
  }
  time: {
    start: number
    end?: number
  }
}

export type FilePart = {
  id: string
  sessionID: string
  messageID: string
  type: "file"
  mime: string
  filename?: string
  url: string
  source?: FilePartSource
}
```

## Data Structures

### Session
```typescript
export type Session = {
  id: string
  projectID: string
  directory: string
  parentID?: string
  summary?: {
    additions: number
    deletions: number
    files: number
    diffs?: Array<FileDiff>
  }
  share?: {
    url: string
  }
  title: string
  version: string
  time: {
    created: number
    updated: number
    compacting?: number
  }
  revert?: {
    messageID: string
    partID?: string
    snapshot?: string
    diff?: string
  }
}
```

### Message
```typescript
export type Message = UserMessage | AssistantMessage

export type UserMessage = {
  id: string
  sessionID: string
  role: "user"
  time: {
    created: number
  }
  summary?: {
    title?: string
    body?: string\n    diffs: Array<FileDiff>
  }
  agent: string
  model: {
    providerID: string
    modelID: string
  }
  system?: string\n  tools?: {
    [key: string]: boolean
  }
}

export type AssistantMessage = {
  id: string
  sessionID: string
  role: "assistant"
  time: {
    created: number
    completed?: number
  }
  error?: ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | ApiError
  parentID: string
  modelID: string
  providerID: string
  mode: string
  path: {
    cwd: string
    root: string
  }
  summary?: boolean
  cost: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  finish?: string
}
```

## Configuration

### Config
```typescript
export type Config = {
  $schema?: string
  theme?: string
  keybinds?: KeybindsConfig
  logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR"
  tui?: {
    scroll_speed?: number
    scroll_acceleration?: {
      enabled: boolean
    }
    diff_style?: "auto" | "stacked"
  }
  command?: {
    [key: string]: {
      template: string
      description?: string
      agent?: string\n      model?: string
      subtask?: boolean
    }
  }
  watcher?: {
    ignore?: Array<string>
  }
  plugin?: Array<string>
  snapshot?: boolean
  share?: "manual" | "auto" | "disabled"
  autoshare?: boolean
  autoupdate?: boolean | "notify"
  disabled_providers?: Array<string>
  enabled_providers?: Array<string>
  model?: string
  small_model?: string
  username?: string
  agent?: {
    plan?: AgentConfig
    build?: AgentConfig
    general?: AgentConfig
    explore?: AgentConfig
    [key: string]: AgentConfig | undefined
  }
  provider?: {
    [key: string]: ProviderConfig
  }
  mcp?: {
    [key: string]: McpLocalConfig | McpRemoteConfig
  }
  // ... other fields
}
```
