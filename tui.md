# OpenCode SDK TUI API

Documentation for controlling the Terminal User Interface (TUI).

## TUI Interaction

### Append to Prompt
Add text to the user's input prompt.

```javascript
await client.tui.appendPrompt({
  body: { text: "Add this to prompt" },
})
// Returns: boolean
```

### Submit Prompt
Trigger the submission of the current prompt (as if user pressed Enter).

```javascript
await client.tui.submitPrompt()
// Returns: boolean
```

### Clear Prompt
Clear the current input prompt.

```javascript
await client.tui.clearPrompt()
// Returns: boolean
```

### Show Toast
Display a toast notification to the user.

```javascript
await client.tui.showToast({
  body: {
    message: "Task completed",
    variant: "success" // "success", "error", "info", "warning"
  },
})
// Returns: boolean
```

### Execute Command
Execute a command in the TUI context.

```javascript
await client.tui.executeCommand({ body: { /* command body */ } })
// Returns: boolean
```

## UI Navigation

### Open Help
Open the help menu.

```javascript
await client.tui.openHelp()
// Returns: boolean
```

### Open Sessions
Open the sessions list view.

```javascript
await client.tui.openSessions()
// Returns: boolean
```

### Open Themes
Open the themes selection view.

```javascript
await client.tui.openThemes()
// Returns: boolean
```

### Open Models
Open the model selection view.

```javascript
await client.tui.openModels()
// Returns: boolean
```
