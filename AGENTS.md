# Version Management

## Updating Version

Use `npm version` to update the package version:

```bash
# Patch version (bug fixes): 0.0.1 -> 0.0.2
npm version patch

# Minor version (new features): 0.0.1 -> 0.1.0
npm version minor

# Major version (breaking changes): 0.0.1 -> 1.0.0
npm version major
```

This will:
- Update `version` in `package.json`
- Create a git tag (e.g., `v0.0.2`)
- Create a version commit

## Publishing

After updating version, push to trigger automated release:

```bash
git push origin main
git push origin --tags
```

The `publish.yml` workflow will automatically:
1. Build the project
2. Publish to npm (using Trusted Publisher OIDC)
3. Generate provenance

## Development

For local development:

```bash
# Clone repository
git clone https://github.com/DoiiarX/koishi-plugin-opencode.git

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Links

- [Koishi Plugin Registry](https://registry.koishi.chat/)
- [Koishi Development Guide](https://koishi.chat/zh-CN/guide/develop/workspace.html)
- [npm Documentation](https://docs.npmjs.com/trusted-publishers)
