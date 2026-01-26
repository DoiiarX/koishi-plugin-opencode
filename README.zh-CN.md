# Koishi 插件：OpenCode

简体中文 | [English](README.md)

一个将 [OpenCode](https://github.com/opencode-ai/opencode) AI 能力集成到 Koishi 聊天机器人的插件。

## 安装

### 普通用户

在 Koishi 控制台的插件商店中直接搜索安装：
1. 打开 Koishi 控制台
2. 进入插件市场
3. 搜索 `opencode`
4. 点击安装

### 开发者

克隆仓库并在本地开发：

```bash
git clone https://github.com/DoiiarX/koishi-plugin-opencode.git
cd koishi-plugin-opencode
npm install
```

## 配置

在 Koishi 配置文件中添加插件：

```yaml
plugins:
  opencode:
    # OpenCode 服务器地址
    baseUrl: "http://localhost:4096"
    # 默认会话 ID（可选）
    defaultSession: ""
    # 覆盖默认模型（格式：provider/model）
    model: ""
    # 生成超时时间（毫秒，默认 30000）
    timeout: 30000
    # 命令所需权限等级（默认 1）
    authority: 1
```

### 配置选项

| 选项 | 类型 | 默认值 | 描述 |
|--------|------|---------|-------------|
| `baseUrl` | string | `http://localhost:4096` | OpenCode 服务器地址 |
| `defaultSession` | string | - | 所有用户的默认会话 ID |
| `model` | string | - | 覆盖默认模型（格式：`provider/model`） |
| `timeout` | number | `30000` | 消息生成超时时间（毫秒） |
| `authority` | number | `1` | 命令所需权限等级 |

## 命令

### 基础命令

#### 发送消息
```
oc <消息>
```
向 OpenCode 发送消息并获取回复。

**示例：**
```
oc 法国的首都是哪里？
```

#### 检查健康状态
```
oc.health
oc.h
```
检查 OpenCode 服务器的健康状态。

**示例：**
```
oc.h
```

### 模型管理

#### 列出模型
```
oc.models [关键词]
oc.m [关键词]
```
列出所有可用模型。可选择性按关键词过滤。

**示例：**
```
oc.models claude
```

#### 设置默认模型
```
oc.model.set <模型>
oc.ms <模型>
```
为所有对话设置默认模型。

**示例：**
```
oc.ms anthropic/claude-3-5-sonnet-20241022
```

### 会话管理

#### 列出会话
```
oc.session.list
oc.sl
```
列出所有可用会话。

#### 创建新会话
```
oc.session.new
oc.sn
```
为当前用户创建新会话。

#### 切换会话
```
oc.session.set <id>
oc.ss <id>
```
切换到指定会话。

#### 查看会话信息
```
oc.session.info
oc.si
```
查看当前会话的信息。

#### 删除会话
```
oc.session.delete <id>
oc.sdel <id>
```
删除指定会话。

## 权限等级

不同命令有不同的默认权限等级：

| 命令组 | 权限等级 |
|---------------|-----------------|
| 基础命令 | 1 |
| 查看会话信息 | 1 |
| 列出模型 | 1 |
| 切换会话 | 2 |
| 设置模型 | 3 |
| 列出会话 | 3 |
| 创建会话 | 3 |
| 删除会话 | 4 |

## 系统要求

- [Koishi](https://koishi.js.org/) v4.18.7 或更高版本
- [OpenCode](https://github.com/opencode-ai/opencode) 服务器正在运行并可访问

## 平台支持

本项目利用 Koishi 强大的适配器系统，实现多平台 OpenCode 交互。Koishi 通过官方和第三方适配器支持广泛的聊天平台：

### 官方支持的平台

- 钉钉
- Discord
- KOOK
- 飞书
- LINE
- 邮件
- Matrix
- QQ
- Slack
- Telegram
- 微信公众号
- 企业微信
- WhatsApp
- Zulip

### 多平台集成能力

- **预装适配器**：常用适配器已预装在 Koishi 中，可在插件配置的 `adapter` 分组中找到
- **多账号支持**：单个 Koishi 应用可同时接入多个平台的多个账号
- **负载均衡**：同一平台内接入的多个机器人共享用户数据，方便实现负载均衡
- **可扩展性**：除了官方适配器，插件市场中还有大量第三方聊天平台适配器

### Koishi 生态优势

基于 Koishi 构建，本项目享有：

- **丰富的插件生态**：接入数千个插件，功能可无限扩展
- **高级权限管理**：细粒度的权限控制，为不同命令设置不同的权限等级
- **生命周期管理**：完善的插件初始化和生命周期钩子机制
- **配置管理**：集中化、灵活的配置系统
- **长期社区维护**：Koishi 是一个成熟、活跃维护的聊天机器人框架，拥有强大的社区支持

### 平台准备工作

不同平台的接入方式和难度存在较大差异，可能需要：
- 在平台内注册开发者账号
- 准备一台部署到公网的服务器
- 配置 API 密钥

详细的平台接入指南可在各个适配器插件的文档中找到。

**好消息是**：Koishi 的大部分功能都不依赖特定的聊天平台。在进行准备工作的同时，你完全可以阅读本文档的后续部分，并在沙盒中体验并学习插件的功能。

## 快速开始

1. 安装 OpenCode 服务器：[安装指南](https://github.com/opencode-ai/opencode)
2. 启动 OpenCode 服务器
3. 在 Koishi 中安装此插件
4. 配置 `baseUrl` 指向你的 OpenCode 服务器
5. 重启 Koishi

## 许可证

MIT

## 链接

- [GitHub 仓库](https://github.com/DoiiarX/koishi-plugin-opencode)
- [OpenCode 文档](https://opencode.ai/docs/)
- [Koishi 文档](https://koishi.chat/zh-CN/guide/)
