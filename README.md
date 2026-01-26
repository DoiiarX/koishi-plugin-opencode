# Koishi Plugin: OpenCode

[简体中文](README.zh-CN.md) | English

A Koishi plugin that integrates [OpenCode](https://github.com/opencode-ai/opencode) AI capabilities into your chatbot.

## Installation

### For Users

Search and install directly from Koishi plugin marketplace in your Koishi console:
1. Open Koishi console
2. Navigate to Plugin Marketplace
3. Search for `opencode`
4. Click to install

### For Developers

Clone the repository and develop locally:

```bash
git clone https://github.com/DoiiarX/koishi-plugin-opencode.git
cd koishi-plugin-opencode
npm install
```

## Configuration

Add the plugin to your Koishi config:

```yaml
plugins:
  opencode:
    # OpenCode Server address
    baseUrl: "http://localhost:4096"
    # Default session ID (optional)
    defaultSession: ""
    # Override default model (format: provider/model)
    model: ""
    # Generation timeout in milliseconds (default: 30000)
    timeout: 30000
    # Required permission level for commands (default: 1)
    authority: 1
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | string | `http://localhost:4096` | OpenCode Server address |
| `defaultSession` | string | - | Default session ID for all users |
| `model` | string | - | Override default model (format: `provider/model`) |
| `timeout` | number | `30000` | Message generation timeout in milliseconds |
| `authority` | number | `1` | Required permission level for commands |

## Commands

### Basic Commands

#### Send Message
```
.oc <message>
.open <message>
.opencode <message>
```
Send a message to OpenCode and receive a response.

**Example:**
```
.oc What is the capital of France?
```

#### Check Health
```
.oc.health
.oc.h
```
Check the health status of your OpenCode Server.

**Example:**
```
.oc.h
```

### Model Management

#### List Models
```
.oc.models [keyword]
.oc.m [keyword]
```
List all available models. Optionally filter by keyword.

**Example:**
```
.oc.models claude
```

#### Set Default Model
```
.oc.model.set <model>
.oc.ms <model>
```
Set the default model for all conversations.

**Example:**
```
.oc.ms anthropic/claude-3-5-sonnet-20241022
```

### Session Management

#### List Sessions
```
.oc.session.list
.oc.sl
```
List all available sessions.

#### Create New Session
```
.oc.session.new
.oc.sn
```
Create a new session for the current user.

#### Switch Session
```
.oc.session.set <id>
.oc.ss <id>
```
Switch to a specific session.

#### View Session Info
```
.oc.session.info
.oc.si
```
View information about the current session.

#### Delete Session
```
.oc.session.delete <id>
.oc.sdel <id>
```
Delete a specific session.

## Permissions

Different commands have different default authority levels:

| Command Group | Authority Level |
|---------------|-----------------|
| Basic Commands | 1 |
| Session Info | 1 |
| List Models | 1 |
| Switch Session | 2 |
| Set Model | 3 |
| List Sessions | 3 |
| Create Session | 3 |
| Delete Session | 4 |

## Requirements

- [Koishi](https://koishi.js.org/) v4.18.7 or higher
- [OpenCode](https://github.com/opencode-ai/opencode) Server running and accessible

## Getting Started

1. Install OpenCode Server: [Installation Guide](https://github.com/opencode-ai/opencode)
2. Start the OpenCode Server
3. Install this plugin in Koishi
4. Configure the `baseUrl` to point to your OpenCode Server
5. Restart Koishi

## License

MIT

## Links

- [GitHub Repository](https://github.com/DoiiarX/koishi-plugin-opencode)
- [OpenCode Documentation](https://opencode.ai/docs/)
- [Koishi Documentation](https://koishi.chat/zh-CN/guide/)
