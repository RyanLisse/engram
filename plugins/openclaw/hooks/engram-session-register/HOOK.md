---
name: engram-session-register
description: Register the active OpenClaw agent in Engram at gateway startup.
version: 1.0.0
author: Engram
events:
  - gateway:startup
---

# Engram Session Register

Ensures the current OpenClaw agent identity is present in Engram before tool calls begin.
