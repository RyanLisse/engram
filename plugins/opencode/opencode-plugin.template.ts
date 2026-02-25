// Engram OpenCode lifecycle bridge plugin template.
// Installed by plugins/opencode/setup.sh into .opencode/plugins/engram-memory.ts
import type { Plugin } from "@opencode-ai/plugin"

const ROUTER = "__ENGRAM_ROUTER__"

export const EngramMemoryPlugin: Plugin = async ({ directory }) => {
  const seenUserMessages = new Set<string>()
  const messageStore = new Map<string, any>()
  let currentSessionID: string | null = null

  const callHook = (hookName: string, payload: Record<string, unknown>) => {
    try {
      const proc = Bun.spawn(["bash", ROUTER, hookName], {
        cwd: directory,
        stdin: new TextEncoder().encode(JSON.stringify(payload) + "\n"),
        stdout: "ignore",
        stderr: "ignore",
      })
      proc.unref()
    } catch {
      // Non-fatal by design.
    }
  }

  const callHookSync = (hookName: string, payload: Record<string, unknown>) => {
    try {
      Bun.spawnSync(["bash", ROUTER, hookName], {
        cwd: directory,
        stdin: new TextEncoder().encode(JSON.stringify(payload) + "\n"),
        stdout: "ignore",
        stderr: "ignore",
      })
    } catch {
      // Non-fatal by design.
    }
  }

  return {
    event: async ({ event }) => {
      switch (event.type) {
        case "session.created": {
          const session = (event as any).properties?.info
          if (!session?.id) break
          if (currentSessionID !== session.id) {
            seenUserMessages.clear()
            messageStore.clear()
          }
          currentSessionID = session.id
          callHook("session-start", { session_id: session.id, source: "startup" })
          break
        }

        case "message.updated": {
          const msg = (event as any).properties?.info
          if (!msg) break
          messageStore.set(msg.id, msg)
          break
        }

        case "message.part.updated": {
          const part = (event as any).properties?.part
          if (!part?.messageID) break

          const msg = messageStore.get(part.messageID)
          if (msg?.role === "user" && part.type === "text" && !seenUserMessages.has(msg.id)) {
            seenUserMessages.add(msg.id)
            const sessionID = msg.sessionID ?? currentSessionID
            if (sessionID) {
              callHook("turn-start", {
                session_id: sessionID,
                prompt: part.text ?? "",
              })
            }
          }
          break
        }

        case "session.status": {
          const props = (event as any).properties
          if (props?.status?.type !== "idle") break
          const sessionID = props?.sessionID
          if (!sessionID) break
          callHookSync("turn-end", { session_id: sessionID })
          break
        }

        case "session.compacted": {
          const sessionID = (event as any).properties?.sessionID
          if (!sessionID) break
          callHook("compaction", { session_id: sessionID, source: "auto" })
          break
        }

        case "session.deleted": {
          const session = (event as any).properties?.info
          if (!session?.id) break
          seenUserMessages.clear()
          messageStore.clear()
          currentSessionID = null
          callHookSync("session-end", { session_id: session.id, reason: "session_deleted" })
          break
        }
      }
    },
  }
}

export default EngramMemoryPlugin
