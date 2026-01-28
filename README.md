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

### ✨ Features

- **🤖 Multi-modal Support**: Send images, audio, video, and files using standard Koishi tags (e.g., `<img src="...">`, see [Koishi Elements](https://koishi.chat/zh-CN/guide/basic/element.html)).
- **🔄 Session Recovery**: Automatically recovers sessions based on Title (`Koishi-<platform>-<userId>`) across restarts.
- **🌊 Smart Streaming**: Supports native message editing and segmented streaming with tag integrity protection.
- **🛠️ Powerful Plugins**: Access to the full OpenCode tool and agent ecosystem.
- **🔍 Reasoning Display**: Show Chain of Thought (CoT) processes transparently.

### Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `baseUrl` | `string` | `http://localhost:4096` | OpenCode Server address |
| `defaultSession` | `string` | - | Default session ID for all users |
| `model` | `string` | - | Override default model (format: `provider/model`) |
| `timeout` | `number` | `30000` | Message generation timeout in milliseconds |
| `authority` | `number` | `1` | Required permission level for commands |
| `showReasoning` | `boolean` | `true` | Show `<think>` block content |
| `enableStreaming` | `boolean` | `true` | Enable streaming output |
| `streamMode` | `auto` \| `native` \| `segment` | `auto` | Streaming mode (`auto`/`native`/`segment`) |
| `streamInterval` | `number` | `500` | Streaming update interval (ms) |
| `showToolMessages` | `boolean` | `true` | Show tool execution messages |
| `showProcessingMessage` | `boolean` | `true` | Show "Processing" notification |
| `directory` | `string` | - | Default workspace directory |

## Commands

### Basic Commands

#### Send Message
```
oc [message]
```
Send a message to OpenCode and receive a response. Supports variadic text input.

**Example:**
```
oc What is capital of France?
```

#### Check Health
```
oc.health
oc.h
```
Check the health status of your OpenCode Server.

**Example:**
```
oc.h
```

### Model Management

#### List Models
```
oc.models [keyword]
oc.m [keyword]
```
List all available models. Optionally filter by keyword.

**Example:**
```
oc.models claude
```

#### Set Default Model
```
oc.model.set <model>
oc.ms <model>
```
Set the default model for all conversations.

**Example:**
```
oc.ms anthropic/claude-3-5-sonnet-20241022
```

### Session Management

#### List Sessions
```
oc.session.list
oc.sl
```
List all available sessions.

#### Create New Session
```
oc.session.new
oc.sn
```
Create a new session for the current user.

#### Switch Session
```
oc.session.set <id>
oc.ss <id>
```
Switch to a specific session.

#### View Session Info
```
oc.session.info
oc.si
```
View information about the current session.

#### Delete Session
```
oc.session.delete <id>
oc.sdel <id>
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
| Create Session | 1 |
| Delete Session | 4 |

## Requirements

- [Koishi](https://koishi.js.org/) v4.18.7 or higher
- [OpenCode](https://github.com/opencode-ai/opencode) Server running and accessible

## Platform Support

This plugin leverages Koishi's powerful adapter system to provide multi-platform OpenCode interactions. Koishi supports a wide range of chat platforms through official and third-party adapters:

### Officially Supported Platforms

- DingTalk (钉钉)
- Discord
- KOOK
- Feishu (飞书)
- LINE
- Email
- Matrix
- QQ
- Slack
- Telegram
- WeChat Official Account (微信公众号)
- WeCom (企业微信)
- WhatsApp
- Zulip

### Multi-Platform Integration

- **Pre-installed Adapters**: Common adapters are pre-installed and can be found in the `adapter` section of your Koishi plugin configuration
- **Multiple Accounts**: A single Koishi application can connect to multiple accounts across different platforms simultaneously
- **Load Balancing**: Multiple bots sharing the same platform share user data, enabling easy load balancing
- **Extensibility**: In addition to official adapters, there are numerous third-party platform adapters available in the marketplace

### Koishi Ecosystem

Built on Koishi, this plugin benefits from:

- **Rich Plugin Ecosystem**: Access to thousands of plugins extending functionality
- **Advanced Permission Management**: Fine-grained authority control for different commands
- **Lifecycle Management**: Robust hooks for plugin initialization and lifecycle events
- **Configuration Management**: Centralized and flexible configuration system
- **Long-term Community Maintenance**: Koishi is a mature, actively maintained chatbot framework with a strong community

### Platform-Specific Preparation

Different platforms have varying integration requirements, which may include:
- Developer account registration on the platform
- Public server deployment
- API key configuration

Detailed guides for each platform are available in the respective adapter plugin documentation.

**Good News**: Most Koishi features are platform-independent. You can explore and learn the plugin's capabilities in the sandbox while preparing for your target platform deployment.

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
