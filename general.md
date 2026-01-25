# OpenCode SDK General API

Documentation for Global, App, Project, Path, Config, Auth, and Events APIs.

## Global

### Health Check
Check if the server is running and get version info.

```javascript
const health = await client.global.health()
console.log(health.data.version)
// Returns: { healthy: true, version: string }
```

## App

### Logging
Write a log entry to the application logs.

```javascript
await client.app.log({
  body: {
    service: "my-app",
    level: "info", // "info", "error", "warn", "debug"
    message: "Operation completed",
  },
})
// Returns: boolean
```

### List Agents
List available agents.

```javascript
const agents = await client.app.agents()
// Returns: Agent[]
```

## Project

### List Projects
List all projects managed by OpenCode.

```javascript
const projects = await client.project.list()
// Returns: Project[]
```

### Get Current Project
Get details of the currently active project.

```javascript
const currentProject = await client.project.current()
// Returns: Project
```

## Path

### Get Path Info
Get current working directory path information.

```javascript
const pathInfo = await client.path.get()
// Returns: Path
```

## Config

### Get Config
Get the current configuration.

```javascript
const config = await client.config.get()
// Returns: Config
```

### Get Providers
Get available model providers and defaults.

```javascript
const { providers, default: defaults } = await client.config.providers()
// Returns: { providers: Provider[], default: { [key: string]: string } }
```

## Auth

### Set Auth Credentials
Configure authentication keys (e.g., for model providers).

```javascript
await client.auth.set({
  path: { id: "anthropic" },
  body: {
    type: "api",
    key: "your-api-key"
  },
})
// Returns: boolean
```

## Events

### Subscribe to Events
Listen to real-time events from the server.

```javascript
const events = await client.event.subscribe()

for await (const event of events.stream) {
  console.log("Event:", event.type, event.properties)
}
```
