# OpenCode SDK Files & Search API

Documentation for File system operations and Search functionality.

## Search (Find)

### Find Text
Search for text content within files (grep-like).

```javascript
const textResults = await client.find.text({
  query: {
    pattern: "function.*opencode" // Regex pattern
  },
})
/*
Returns match objects with:
- path
- lines
- line_number
- absolute_offset
- submatches
*/
```

### Find Files
Search for file names or directories.

```javascript
// Find files ending in .ts
const files = await client.find.files({
  query: {
    query: "*.ts",
    type: "file"
  },
})
// Returns: string[]
```

```javascript
// Find directories
const directories = await client.find.files({
  query: {
    query: "packages",
    type: "directory",
    limit: 20 // Max results 1-200
  },
})
```

Supported query options:
- `query`: Glob pattern
- `type`: "file" | "directory"
- `directory`: Override project root
- `limit`: Max results

### Find Symbols
Search for code symbols (functions, classes, etc.).

```javascript
const symbols = await client.find.symbols({ query: { query: "MyClass" } })
// Returns: Symbol[]
```

## Files

### Read File
Read the content of a file.

```javascript
const content = await client.file.read({
  query: { path: "src/index.ts" },
})
// Returns: { type: "raw" | "patch", content: string }
```

### File Status
Get status of files (e.g., git status).

```javascript
const fileConf = await client.file.status({ query: { /* optional */ } })
// Returns: File[]
```
