# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-28

### Added
- **Multi-modal Support**: Enable sending images, audio, video, and files using Koishi element tags (`<img>`, `<audio>`, `<video>`, `<file>`). Agents can generate these tags via system prompt instructions.
- **Directory-Based Session Isolation**: New `directory` configuration option. Changing the workspace directory now automatically creates a new isolated session, ensuring context separation between different workspaces (Title includes directory hash).
- **Configuration**: Added `directory` option to specify the remote workspace directory.

### Fixed
- **Security Fix**: Prevented `config.authority` default value (1) from overriding higher permission requirements for sensitive commands (e.g., Delete Session, Set Model). Sensitive commands now enforce stricter permission levels (2-4).
- **Command Documentation**: Comprehensive help documentation (descriptions, usage, examples) added for all `oc` commands (viewable via `help oc`, `help oc.models`, etc.).
- **Permissions**: Lowered `oc.session.new` permission level to 1 to allow standard users to reset sessions manually under the isolation strategy.

## [0.0.6] - 2026-01-28

### Added
- Streaming support (`enableStreaming`, `streamMode`, `streamInterval`)
- `oc.stream.status` command to check streaming status
- `showToolMessages` configuration to control tool message visibility

### Changed
- Refactored session lifecycle to prevent duplicate messages after streaming

### Fixed
- Fixed message leakage issue by filtering out user role messages

## [0.0.5] - 2026-01-28

### Added
- `CHANGELOG.md` and `CHANGELOG.zh-CN.md` with complete version history
- `ARCHITECTURE.md` documentation
- `docs/SDK_TYPES.md` with SDK type definitions
- Platform support section in `README.md`

### Changed
- Updated `AGENTS.md` to reference changelog and SDK types
- Refactored `src/index.ts` to support better message part parsing and formatting
- Bumped version to 0.0.5 (skipping 0.0.4)

### Fixed
- Fixed duplicate `Config` interface declaration in `src/index.ts`
- Fixed logging error where `sessionKey` was undefined in `handleSessionError`
- Improved log formatting for `agent`, `subtask`, and `patch` parts
- Removed incorrect usage of `part.goal` and `part.reason` to align with SDK types
- Removed leading dot from commands in `README.md`


## [0.0.3] - 2026-01-26

### Added
- Chinese localization for AGENTS.md with yakumo guide documentation

### Fixed
- Updated publish.yml workflow configuration

### Changed
- Updated package.json version bump to 0.0.3
- Enhanced AGENTS.md documentation with more detailed development workflow instructions

## [0.0.2] - 2026-01-26

### Added
- GitHub Actions workflows:
  - `publish.yml` - Automated publishing with Trusted Publisher OIDC support
  - `pr-review.yml` - Automated pull request review workflow
  - `opencode.yml` - OpenCode integration workflow
  - `issue-triage.yml` - Automated issue triage workflow
  - `update-plugin-docs.yml` - Plugin documentation update workflow
- OpenCode configuration files in `.opencode/` directory:
  - `opencode.json` - Main OpenCode configuration
  - `oh-my-opencode.json` - Oh My OpenCode configuration
- MIT LICENSE file
- AGENTS.md documentation with version management and development workflow guide
- Comprehensive README.md with full plugin documentation including:
  - Installation instructions
  - Configuration options
  - Command reference
  - Permission levels
  - Platform support details
  - Links to documentation

### Changed
- Refactored command structure:
  - Removed aliases `open` and `opencode` from `oc` command for cleaner interface
- Updated README documentation:
  - Renamed `readme.md` to `README.md` (uppercase)
  - Added language switch links between English and Chinese versions
  - Updated installation methods documentation
  - Added version management documentation
- Updated GitHub workflows to remove unnecessary npm cache steps (no package-lock.json in plugin directory)

### Fixed
- Restored `oc.health` command after accidental removal
- Fixed duplicate `check_plugins` step in update-plugin-docs workflow
- Removed outdated Python/uv code from update-plugin-docs workflow
- Added strict rule to forbid Git operations in triage workflow
- Removed npm cache from pr-review workflow (no package-lock.json in plugin directory)
- Removed npm cache from opencode workflow (no package-lock.json in plugin directory)
- Fixed command format in README - removed leading dot from commands

### Security
- Added Trusted Publisher OIDC support for secure npm publishing

## [0.0.1] - 2026-01-26

### Added
- Initial OpenCode Koishi plugin release
- Core integration with OpenCode AI server
- Basic command interface:
  - `oc` - Send messages to OpenCode
  - `oc.health` / `oc.h` - Check server health status
- Model management:
  - `oc.models` / `oc.m` - List available models
  - `oc.model.set` / `oc.ms` - Set default model
- Session management:
  - `oc.session.list` / `oc.sl` - List sessions
  - `oc.session.new` / `oc.sn` - Create new session
  - `oc.session.set` / `oc.ss` - Switch session
  - `oc.session.info` / `oc.si` - View session info
  - `oc.session.delete` / `oc.sdel` - Delete session
- Configuration system with options for:
  - baseUrl - OpenCode server address
  - defaultSession - Default session ID
  - model - Override default model
  - timeout - Message generation timeout
  - authority - Command permission level
- Permission-based access control for different command groups
- README.md and README.zh-CN.md documentation

---

[Unreleased]: https://github.com/DoiiarX/koishi-plugin-opencode/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/DoiiarX/koishi-plugin-opencode/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/DoiiarX/koishi-plugin-opencode/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/DoiiarX/koishi-plugin-opencode/releases/tag/v0.0.1
