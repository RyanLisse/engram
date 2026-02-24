# Getting Started with Engram

## What is Engram?

Engram is like a shared notebook for your AI assistants -- when one assistant learns something, the others can remember it too. It stores facts, finds them later using meaning (not just keywords), and keeps everything synced across your devices. Think of it as giving your AI agents a long-term memory they can all share.

---

## What You'll Need

Before you start, make sure you have:

- **A computer** running macOS, Linux, or Windows
- **Node.js** (version 18 or newer) -- this runs the server. Download it free at [nodejs.org](https://nodejs.org)
- **A free Convex account** -- this is the cloud database that stores your memories. Sign up at [convex.dev](https://www.convex.dev)
- **Claude Code** (or another MCP-compatible AI client) -- this is the AI assistant that will use Engram
- **A Cohere API key** (optional) -- makes memory search smarter. Free tier available at [cohere.com](https://dashboard.cohere.com/api-keys). Engram works without it, just with simpler search.

---

## Setup in 5 Steps

### Step 1: Download Engram

Open your terminal (on Mac: search for "Terminal" in Spotlight) and run:

```bash
# Downloads the Engram code to your computer
git clone https://github.com/RyanLisse/engram.git

# Moves into the Engram folder
cd engram
```

### Step 2: Set Up the Cloud Backend (Convex)

Convex is the cloud database where memories are stored. This step creates your personal database.

```bash
# Installs the tools Engram needs
npm install

# Starts the Convex backend (opens a browser to log in the first time)
npx convex dev
```

When you run `npx convex dev`, it will:
1. Ask you to log in to Convex (creates a free account if needed)
2. Create a new project for you
3. Give you a deployment URL -- **copy this URL**, you will need it in Step 3

The URL looks something like: `https://happy-animal-123.convex.cloud`

Leave this terminal window running (it keeps your backend up to date), and open a **new terminal window** for the next steps.

### Step 3: Configure Your Environment

In your new terminal window, go to the MCP server folder and install its dependencies:

```bash
# Moves into the MCP server folder
cd engram/mcp-server

# Installs the MCP server's dependencies
npm install
```

Now you need to tell Engram how to connect. Create a file called `.env` in the `mcp-server` folder with your settings:

```bash
# The Convex URL you copied from Step 2
CONVEX_URL=https://your-deployment.convex.cloud

# A name for your agent (pick anything you like, e.g. "my-assistant")
ENGRAM_AGENT_ID=my-assistant

# Your Cohere key (leave blank if you don't have one -- things still work)
COHERE_API_KEY=
```

Replace `https://your-deployment.convex.cloud` with the actual URL from Step 2.

### Step 4: Build the Server

Still in the `mcp-server` folder:

```bash
# Compiles the server code so it's ready to run
npm run build
```

You should see no errors. If it finishes without red text, you are good to go.

### Step 5: Connect to Claude Code

Tell Claude Code where to find Engram. Open (or create) the file `.mcp.json` in your home directory or project root, and add this:

```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/FULL/PATH/TO/engram/mcp-server/dist/index.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "ENGRAM_AGENT_ID": "my-assistant",
        "COHERE_API_KEY": ""
      }
    }
  }
}
```

**Important:** Replace `/FULL/PATH/TO/engram` with the actual path where you downloaded Engram. For example, if you cloned it into your home folder, it might be `/Users/yourname/engram`.

Restart Claude Code. You should now see Engram's memory tools available (current build exposes 52 `memory_*` tools).

---

## Your First Memory

Once Engram is connected, try asking your AI assistant to do this:

**Store a fact:**
> "Remember that my preferred programming language is Python."

Behind the scenes, the assistant calls `memory_store_fact` and saves this to your shared memory.

**Recall it later (even in a new conversation):**
> "What do you remember about my programming preferences?"

The assistant calls `memory_recall`, searches your stored memories by meaning, and finds the fact -- even if you used different words.

**Store an observation:**
> "Note that we discussed the new website redesign today."

This uses `memory_observe` to quietly log context without interrupting your workflow.

---

## Common Questions

**What if I don't have a Cohere API key?**
Engram works without one. The embedding fallback chain is: Cohere (best) → Ollama mxbai-embed-large (good, local) → zero vector (text-only search). If you have Ollama installed (`ollama pull mxbai-embed-large`), semantic search works locally without any API keys. You can always add a Cohere key later -- no data is lost.

**Can multiple agents share memory?**
Yes, that is Engram's main purpose. Each agent gets its own ID (like `my-assistant` or `code-helper`), and memories can be scoped as private (only that agent), team (a group of agents), project (everyone on a project), or public (all agents). Agents only see memories they have permission to access.

**How do I see my stored memories?**
Ask your AI assistant: "Show me what you remember about [topic]." It will use `memory_recall` or `memory_search` to find and display relevant facts. You can also ask it to use `memory_query_raw` for a direct look at the database.

**Does it work offline?**
The current version requires a connection to Convex (the cloud backend). A future update will add local-only mode using LanceDB for fully offline use.

---

## Troubleshooting

**"Cannot find module" error when starting the server**
You likely skipped the build step. Go to the `mcp-server` folder and run:
```bash
npm install && npm run build
```

**"CONVEX_URL is not set" or connection errors**
Double-check that your `.mcp.json` file has the correct Convex URL from Step 2. Make sure it starts with `https://` and ends with `.convex.cloud`. Also make sure the `npx convex dev` process is still running in its terminal window.

**Claude Code does not show Engram tools**
Make sure you restarted Claude Code after editing `.mcp.json`. Also verify the path in `args` points to the actual `dist/index.js` file -- try running `node /your/path/to/engram/mcp-server/dist/index.js` in a terminal to check for errors.

**"TypeError" or unexpected errors from tools**
Make sure your Node.js version is 18 or newer. Check with:
```bash
node --version
```
If it shows a number below 18, update Node.js from [nodejs.org](https://nodejs.org).

---

For advanced configuration, architecture details, and the full list of tools and their options, see the main [README](../README.md).

For design intent:
- Philosophy: `/Users/cortex-air/Tools/engram/docs/PHILOSOPHY.md`
- Research synthesis: `/Users/cortex-air/Tools/engram/docs/research/SYNTHESIS.md`
