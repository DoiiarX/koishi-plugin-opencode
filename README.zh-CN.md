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
.oc <消息>
.open <消息>
.opencode <消息>
```
向 OpenCode 发送消息并获取回复。

**示例：**
```
.oc 法国的首都是哪里？
```

#### 检查健康状态
```
.oc.health
.oc.h
```
检查 OpenCode 服务器的健康状态。

**示例：**
```
.oc.h
```

### 模型管理

#### 列出模型
```
.oc.models [关键词]
.oc.m [关键词]
```
列出所有可用模型。可选择性按关键词过滤。

**示例：**
```
.oc.models claude
```

#### 设置默认模型
```
.oc.model.set <模型>
.oc.ms <模型>
```
为所有对话设置默认模型。

**示例：**
```
.oc.ms anthropic/claude-3-5-sonnet-20241022
```

### 会话管理

#### 列出会话
```
.oc.session.list
.oc.sl
```
列出所有可用会话。

#### 创建新会话
```
.oc.session.new
.oc.sn
```
为当前用户创建新会话。

#### 切换会话
```
.oc.session.set <id>
.oc.ss <id>
```
切换到指定会话。

#### 查看会话信息
```
.oc.session.info
.oc.si
```
查看当前会话的信息。

#### 删除会话
```
.oc.session.delete <id>
.oc.sdel <id>
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
