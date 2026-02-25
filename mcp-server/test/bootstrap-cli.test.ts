/**
 * Tests for the engram bootstrap CLI command.
 *
 * Covers:
 *   - resolveBootstrapPath: default paths and overrides
 *   - BootstrapOptions: source validation
 *   - Path resolution for each source type
 */

import { describe, test, expect } from "vitest";
import { homedir } from "os";
import { resolve } from "path";

// Import the pure functions for testing (not the Command itself)
import { resolveBootstrapPath, type BootstrapOptions } from "../../cli/src/commands/bootstrap.js";

describe("resolveBootstrapPath", () => {
  test("claude-code default path resolves to ~/.claude/projects", () => {
    const result = resolveBootstrapPath("claude-code");
    expect(result).toBe(resolve(homedir(), ".claude", "projects"));
  });

  test("openclaw default path resolves to ~/.openclaw/sessions", () => {
    const result = resolveBootstrapPath("openclaw");
    expect(result).toBe(resolve(homedir(), ".openclaw", "sessions"));
  });

  test("override path takes precedence over default", () => {
    const customPath = "/tmp/my-sessions";
    const result = resolveBootstrapPath("claude-code", customPath);
    expect(result).toBe(resolve(customPath));
  });

  test("relative override path is resolved to absolute", () => {
    const result = resolveBootstrapPath("openclaw", "./local-sessions");
    expect(result).toBe(resolve("./local-sessions"));
  });

  test("unknown source returns empty string without override", () => {
    const result = resolveBootstrapPath("unknown-source");
    expect(result).toBe("");
  });

  test("unknown source with override still resolves the override", () => {
    const result = resolveBootstrapPath("unknown-source", "/tmp/override");
    expect(result).toBe(resolve("/tmp/override"));
  });
});

describe("BootstrapOptions type", () => {
  test("valid options are accepted", () => {
    const opts: BootstrapOptions = {
      source: "claude-code",
      concurrency: 4,
      dryRun: false,
    };
    expect(opts.source).toBe("claude-code");
    expect(opts.concurrency).toBe(4);
    expect(opts.dryRun).toBe(false);
    expect(opts.path).toBeUndefined();
    expect(opts.limit).toBeUndefined();
  });

  test("all optional fields can be set", () => {
    const opts: BootstrapOptions = {
      source: "openclaw",
      path: "/custom/path",
      concurrency: 8,
      dryRun: true,
      limit: 10,
    };
    expect(opts.source).toBe("openclaw");
    expect(opts.path).toBe("/custom/path");
    expect(opts.concurrency).toBe(8);
    expect(opts.dryRun).toBe(true);
    expect(opts.limit).toBe(10);
  });
});
