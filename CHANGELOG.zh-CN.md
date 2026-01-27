# 更新日志

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## [0.0.3] - 2026-01-26

### 新增
- AGENTS.md 中文本地化及 yakumo 指南文档

### 修复
- 更新 publish.yml 工作流配置

### 变更
- 更新 package.json 版本至 0.0.3
- 增强 AGENTS.md 文档，添加更详细的开发工作流程说明

## [0.0.2] - 2026-01-26

### 新增
- GitHub Actions 工作流：
  - `publish.yml` - 使用 Trusted Publisher OIDC 的自动发布流程
  - `pr-review.yml` - 自动拉取请求审查工作流
  - `opencode.yml` - OpenCode 集成工作流
  - `issue-triage.yml` - 自动问题分类工作流
  - `update-plugin-docs.yml` - 插件文档更新工作流
- `.opencode/` 目录下的 OpenCode 配置文件：
  - `opencode.json` - 主要 OpenCode 配置
  - `oh-my-opencode.json` - Oh My OpenCode 配置
- MIT 许可证文件
- AGENTS.md 文档，包含版本管理和开发工作流程指南
- 完整的 README.md 文档，包括：
  - 安装说明
  - 配置选项
  - 命令参考
  - 权限级别
  - 平台支持详情
  - 文档链接

### 变更
- 重构命令结构：
  - 从 `oc` 命令中移除别名 `open` 和 `opencode`，使接口更清晰
- 更新 README 文档：
  - 将 `readme.md` 重命名为 `README.md`（大写）
  - 在英文和中文版本之间添加语言切换链接
  - 更新安装方法文档
  - 添加版本管理文档
- 更新 GitHub 工作流，移除不必要的 npm 缓存步骤（插件目录中没有 package-lock.json）

### 修复
- 恢复 `oc.health` 命令，此前被误删除
- 修复 update-plugin-docs 工作流中的重复 check_plugins 步骤
- 从 update-plugin-docs 工作流中移除过时的 Python/uv 代码
- 在分类工作流中添加严格的规则以禁止 Git 操作
- 从 pr-review 工作流中移除 npm 缓存（插件目录中没有 package-lock.json）
- 从 opencode 工作流中移除 npm 缓存（插件目录中没有 package-lock.json）
- 修复 README 中的命令格式 - 移除命令开头的点

### 安全
- 添加 Trusted Publisher OIDC 支持以实现安全的 npm 发布

## [0.0.1] - 2026-01-26

### 新增
- OpenCode Koishi 插件初始发布
- 与 OpenCode AI 服务器的核心集成
- 基础命令接口：
  - `oc` - 向 OpenCode 发送消息
  - `oc.health` / `oc.h` - 检查服务器健康状态
- 模型管理：
  - `oc.models` / `oc.m` - 列出可用模型
  - `oc.model.set` / `oc.ms` - 设置默认模型
- 会话管理：
  - `oc.session.list` / `oc.sl` - 列出会话
  - `oc.session.new` / `oc.sn` - 创建新会话
  - `oc.session.set` / `oc.ss` - 切换会话
  - `oc.session.info` / `oc.si` - 查看会话信息
  - `oc.session.delete` / `oc.sdel` - 删除会话
- 配置系统，支持以下选项：
  - baseUrl - OpenCode 服务器地址
  - defaultSession - 默认会话 ID
  - model - 覆盖默认模型
  - timeout - 消息生成超时时间
  - authority - 命令权限级别
- 基于权限的不同命令组访问控制
- README.md 和 README.zh-CN.md 文档

---

[未发布]: https://github.com/DoiiarX/koishi-plugin-opencode/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/DoiiarX/koishi-plugin-opencode/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/DoiiarX/koishi-plugin-opencode/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/DoiiarX/koishi-plugin-opencode/releases/tag/v0.0.1
