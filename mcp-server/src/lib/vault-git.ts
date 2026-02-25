import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);

const GITIGNORE_CONTENT = `*.conflict.md
*.tmp
.index/
`;

/**
 * Ensure the vault root is a git repository.
 * If .git doesn't exist, runs `git init` and creates a .gitignore.
 * Silently no-ops if git is unavailable.
 */
export async function ensureGitRepo(vaultRoot: string): Promise<void> {
  try {
    const gitDir = path.join(vaultRoot, ".git");
    try {
      await fs.stat(gitDir);
      // .git already exists — nothing to do
      return;
    } catch {
      // .git does not exist, initialise
    }

    await exec("git", ["init", vaultRoot]);

    const gitignorePath = path.join(vaultRoot, ".gitignore");
    try {
      await fs.stat(gitignorePath);
      // already exists, leave it alone
    } catch {
      await fs.writeFile(gitignorePath, GITIGNORE_CONTENT, "utf8");
    }
  } catch {
    // git unavailable or vault root inaccessible — silently ignore
  }
}

/**
 * Stage all changes and commit if there are staged diffs.
 * Returns { committed: false } if there is nothing to commit.
 * Never throws — callers may fire-and-forget with .catch(() => {}).
 */
export async function autoCommitChanges(
  vaultRoot: string,
  message: string
): Promise<{ committed: boolean; hash?: string }> {
  // Stage everything
  await exec("git", ["add", "-A"], { cwd: vaultRoot });

  // Check whether anything was actually staged.
  // `git diff --cached --quiet` exits 0 when nothing is staged, 1 when there are diffs.
  try {
    await exec("git", ["diff", "--cached", "--quiet"], { cwd: vaultRoot });
    // Exit 0 — nothing staged
    return { committed: false };
  } catch {
    // Exit 1 — there are staged changes, proceed to commit
  }

  await exec("git", ["commit", "-m", message], { cwd: vaultRoot });

  let hash: string | undefined;
  try {
    const { stdout } = await exec("git", ["log", "-1", "--format=%H"], {
      cwd: vaultRoot,
    });
    hash = stdout.trim() || undefined;
  } catch {
    // hash extraction is best-effort
  }

  return { committed: true, hash };
}

/**
 * Get the hash of the most recent commit, or null if no commits exist yet.
 */
export async function getLastSyncCommit(
  vaultRoot: string
): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["log", "-1", "--format=%H"], {
      cwd: vaultRoot,
    });
    const hash = stdout.trim();
    return hash || null;
  } catch {
    return null;
  }
}
