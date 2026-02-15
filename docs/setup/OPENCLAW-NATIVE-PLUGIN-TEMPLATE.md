# OpenClaw Native Plugin Template (Packaging Skeleton)

Use this when you want Engram as a native in-process OpenClaw extension package (not only MCP server mode).

## package.json skeleton

```json
{
  "name": "@openclaw/engram",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "openclaw": {
    "extensions": ["dist/index.js"]
  },
  "scripts": {
    "build": "tsc"
  }
}
```

## extension entry skeleton (`src/index.ts`)

```ts
export default function register(api: any) {
  // register tools/resources/prompts/services here
  // Example shape based on OpenClaw plugin docs.
  api.registerTool({
    name: "engram_health",
    description: "Check Engram MCP bridge health",
    schema: {
      type: "object",
      properties: {},
      required: []
    },
    handler: async () => ({ ok: true })
  });
}
```

## install flow

```bash
openclaw plugins install @openclaw/engram
```

## Notes

- Current Engram repo ships as an MCP server; this file is a starting template for a separate native plugin package.
- Keep naming conventions aligned with OpenClaw plugin docs (`snake_case` tools, no collisions with reserved commands).
