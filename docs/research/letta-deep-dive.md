# Letta (MemGPT) Deep Dive — Agent Memory System Analysis

> Research for Engram unified memory system  
> Date: 2026-02-11

---

## 1. Core Architecture: The 3-Tier Memory System

Letta (formerly MemGPT) implements a virtual memory hierarchy inspired by OS memory management. The core insight from the [MemGPT paper](https://arxiv.org/abs/2310.08560) (Packer et al., 2023): LLMs have a fixed context window analogous to a CPU's limited main memory, so implement virtual memory with the LLM managing its own page-ins/page-outs.

### Tier 1: Core Memory (In-Context / "Main Memory")

**What it is:** The always-present working memory that sits inside the LLM's context window on every single inference call. Think of it as RAM — always accessible, always visible.

**How it's stored:** Core Memory is composed of **Blocks** — named, mutable text sections. Each block has:
- `id` (UUID)
- `label` (string, e.g., "human", "persona")  
- `value` (string — the actual text content)
- `limit` (int — max character count, typically 2000-5000 chars)
- `template_name` (optional, for reusable templates)
- `description` (optional)
- `metadata_` (optional JSON)

**Schema (from Letta source `letta/schemas/block.py`):**

```python
class Block(BaseModel):
    id: str  # block-{uuid}
    label: str
    value: str = ""
    limit: int = 2000
    template_name: Optional[str] = None
    description: Optional[str] = None
    metadata_: Optional[Dict] = None
    
    # Organization scoping
    organization_id: Optional[str] = None
    
    # Relationships
    agent_ids: List[str] = []  # Which agents use this block
```

**How it's injected:** On every LLM call, the system prompt is assembled as:

```
[System instructions]
[Memory editing instructions]
<core_memory>
  <persona>
    {persona_block.value}
  </persona>
  <human>
    {human_block.value}
  </human>
  [... any custom blocks ...]
</core_memory>
[Conversation history (from recall)]
[User message]
```

**Key insight:** The LLM sees core memory as XML-tagged sections in its system prompt. It edits them through tool calls. This is the "main memory" that's always loaded.

### Tier 2: Recall Memory (Conversation History / "Disk Cache")

**What it is:** The full conversation history — every message ever sent/received. Only a window of recent messages is loaded into context; older messages are stored but not visible unless searched.

**How it's stored:** Messages table in PostgreSQL (or SQLite for local dev).

**Schema (from `letta/schemas/message.py`):**

```python
class Message(BaseModel):
    id: str  # message-{uuid}
    role: str  # "user", "assistant", "system", "tool"
    content: Optional[str] = None
    name: Optional[str] = None  # for tool calls
    tool_calls: Optional[List[ToolCall]] = None
    tool_call_id: Optional[str] = None
    
    # Metadata
    agent_id: str
    created_at: datetime
    
    # For conversation management
    step_id: Optional[str] = None
```

**Windowing:** Letta maintains a sliding window of the N most recent messages in context. When the context fills up, older messages are evicted (compacted — see Section 5).

**Search:** The LLM can search recall memory with `conversation_search(query, page)` to find relevant past exchanges.

### Tier 3: Archival Memory (Long-Term Storage / "Disk")

**What it is:** Unlimited persistent storage. Think of it as the agent's external hard drive. Stores facts, documents, notes — anything the agent wants to remember long-term.

**How it's stored:** Vector database with text + embeddings. In Letta's current implementation, this uses PostgreSQL with pgvector extension (or ChromaDB/Milvus for older versions).

**Schema (from `letta/schemas/passage.py`):**

```python
class Passage(BaseModel):
    id: str  # passage-{uuid}
    text: str  # The actual content
    embedding: Optional[List[float]] = None
    embedding_config: Optional[EmbeddingConfig] = None
    
    # Source tracking
    agent_id: Optional[str] = None
    source_id: Optional[str] = None  # If from a data source
    file_id: Optional[str] = None
    
    # Metadata
    metadata_: Optional[Dict] = None
    created_at: datetime
    organization_id: Optional[str] = None
```

### How Does the LLM Decide What to Promote/Demote?

**Critical insight: The LLM decides itself.** There is no hard-coded promotion/demotion logic. The system prompt instructs the LLM:

1. "You have limited core memory. Use it wisely."
2. "Important facts about the human should be saved to core memory."
3. "Detailed information that doesn't fit should go to archival memory."
4. "You can search archival and recall memory when you need information."

The LLM then uses tool calls to:
- **Promote:** `archival_memory_search` → read result → `core_memory_append` (pull from archival into core)
- **Demote:** `core_memory_replace` (trim core) → `archival_memory_insert` (save to archival)
- **Evict automatically:** Conversation compaction moves old messages from recall's active window to summarized form

This is the genius of MemGPT: **the memory management IS the agent's behavior**, not a separate system. The LLM is both the application AND the memory manager.

---

## 2. Memory Tools — Full API Surface

Letta exposes memory manipulation as **tools** (OpenAI function-calling format) that the LLM can invoke. Here's the complete set:

### Core Memory Tools

```python
def core_memory_append(self, label: str, content: str) -> str:
    """
    Append content to a core memory block.
    
    Args:
        label: The label of the block (e.g., "human", "persona")
        content: The text to append
        
    Returns:
        New value of the block after append
        
    Raises:
        ValueError: If appending would exceed block's character limit
    """

def core_memory_replace(self, label: str, old_content: str, new_content: str) -> str:
    """
    Replace content in a core memory block. Uses exact string matching.
    
    Args:
        label: The label of the block
        old_content: Exact text to find and replace
        new_content: Text to replace it with (can be "" to delete)
        
    Returns:
        New value of the block after replacement
        
    Raises:
        ValueError: If old_content not found in block
        ValueError: If replacement would exceed block's character limit
    """
```

### Archival Memory Tools

```python
def archival_memory_insert(self, content: str) -> str:
    """
    Insert content into archival memory (long-term storage).
    Content is embedded and stored for later semantic search.
    
    Args:
        content: The text to store
        
    Returns:
        Confirmation message with passage ID
    """

def archival_memory_search(self, query: str, page: int = 0) -> str:
    """
    Search archival memory using semantic similarity.
    
    Args:
        query: Search query (embedded and compared against stored passages)
        page: Page number for pagination (default 0)
        
    Returns:
        Formatted string of matching passages with metadata
    """
```

### Recall Memory (Conversation) Tools

```python
def conversation_search(self, query: str, page: int = 0) -> str:
    """
    Search past conversation history.
    
    Args:
        query: Search query
        page: Page number for pagination
        
    Returns:
        Matching messages from conversation history
    """

def conversation_search_date(self, start_date: str, end_date: str, page: int = 0) -> str:
    """
    Search conversation history within a date range.
    
    Args:
        start_date: ISO format start date
        end_date: ISO format end date  
        page: Page number
        
    Returns:
        Messages within the date range
    """
```

### Tool Call Format (OpenAI function calling)

```json
{
  "type": "function",
  "function": {
    "name": "core_memory_append",
    "description": "Append to the contents of core memory.",
    "parameters": {
      "type": "object",
      "properties": {
        "label": {
          "type": "string",
          "description": "Section of core memory to append to (e.g., 'human', 'persona')"
        },
        "content": {
          "type": "string",
          "description": "Content to append to the memory block"
        }
      },
      "required": ["label", "content"]
    }
  }
}
```

### Additional Tools (newer versions)

```python
# Added in Letta 0.4+
def core_memory_view(self) -> str:
    """View all core memory blocks and their current contents."""

# Custom tool support — agents can have arbitrary tools added
def send_message(self, message: str) -> str:
    """Send a message to the user. This is the ONLY way to communicate."""
```

**Important design choice:** `send_message` is a tool, not a default behavior. The agent must explicitly choose to respond. This means the agent can do memory operations silently (without responding to the user), which is crucial for the "inner monologue" pattern.

### Inner Monologue

Every LLM response in Letta has this structure:
1. **Inner thoughts** (not shown to user) — reasoning about what to do
2. **Tool calls** — memory ops, send_message, custom tools
3. **Tool results** — fed back for next reasoning step

The agent's "heartbeat" system allows chaining multiple tool calls before responding.

---

## 3. Multi-Agent Memory Sharing

### Shared Blocks (The Key Mechanism)

Letta's multi-agent memory sharing is built on **shared blocks**. A Block can be attached to multiple agents simultaneously.

```python
# Create a shared block
from letta import create_client
client = create_client()

shared_block = client.create_block(
    label="team_knowledge",
    value="Project X deadline: March 15\nBudget: $50k",
    limit=5000
)

# Attach to multiple agents
agent_1 = client.create_agent(
    name="researcher",
    memory_blocks=[
        {"label": "persona", "value": "You are a researcher..."},
        {"label": "human", "value": ""},
        {"label": "team_knowledge", "value": "", "id": shared_block.id}  # shared!
    ]
)

agent_2 = client.create_agent(
    name="writer", 
    memory_blocks=[
        {"label": "persona", "value": "You are a writer..."},
        {"label": "human", "value": ""},
        {"label": "team_knowledge", "value": "", "id": shared_block.id}  # same block!
    ]
)
```

**How it works:**
- When Agent 1 calls `core_memory_replace("team_knowledge", old, new)`, the block is updated in the database
- When Agent 2 next runs, it loads the latest block value → sees Agent 1's changes
- This is **eventual consistency** — not real-time. Agent 2 sees changes on its next inference call.

### Memory Scopes

Blocks have implicit scoping through attachment:
- **Agent-private:** Block attached to only one agent (persona, human blocks)
- **Shared across agents:** Block attached to multiple agents (team knowledge, project state)
- **Organization-level:** Blocks scoped to an org can be discovered and attached by any agent in that org

### Cross-Agent Retrieval

Archival memory is **per-agent** by default. Each agent has its own archival store. For cross-agent retrieval:

1. **Shared data sources:** Multiple agents can be attached to the same data source (e.g., a document collection)
2. **External tools:** Build custom tools that query other agents' memory
3. **Shared blocks for summaries:** Use shared core memory blocks to pass key findings between agents

**Limitation:** There's no built-in "search all agents' archival memory" capability. This is a gap Engram could fill.

---

## 4. Memory Blocks — Deep Dive

### Default Blocks

Every Letta agent starts with two default blocks:

**Persona Block:**
```
label: "persona"
limit: 2000 characters
purpose: Agent's identity, personality, capabilities, instructions
```

Example value:
```
My name is Sam. I am a helpful research assistant.
I specialize in machine learning and can search papers.
I should be concise but thorough. I prefer to verify facts
before presenting them to the user.
```

**Human Block:**
```
label: "human"  
limit: 2000 characters
purpose: Information about the user the agent is talking to
```

Example value:
```
Name: Alex
Occupation: Software engineer at StartupCo
Interests: distributed systems, Rust programming
Preferences: Prefers concise answers, doesn't like small talk
Last discussed: Database migration strategies (2024-01-15)
```

### Custom Blocks

You can add arbitrary blocks:

```python
agent = client.create_agent(
    name="project_manager",
    memory_blocks=[
        {"label": "persona", "value": "...", "limit": 2000},
        {"label": "human", "value": "...", "limit": 2000},
        {"label": "project_status", "value": "Sprint 5: In Progress\nVelocity: 42 pts/sprint", "limit": 3000},
        {"label": "team_roster", "value": "Alice (frontend), Bob (backend), Carol (ML)", "limit": 2000},
        {"label": "decisions_log", "value": "", "limit": 5000},
    ]
)
```

### Size Limits

- Default: 2000 characters per block
- Configurable per block: `limit` parameter
- Practical max: depends on model's context window minus other content
- All blocks combined + system prompt + conversation must fit in context
- Letta warns/errors if total core memory would exceed available context

### How Agents Edit Blocks

The agent uses `core_memory_replace` with exact string matching:

```
Agent thinks: "I learned the user's name is Alex, not 'Unknown'"

Tool call: core_memory_replace(
    label="human",
    old_content="Name: Unknown",
    new_content="Name: Alex"
)
```

**Pain point:** Exact string matching is fragile. If the agent gets the `old_content` wrong by even one character, the replacement fails. Letta mitigates this by:
1. Always showing the current block value in the system prompt
2. Including error handling that tells the agent what went wrong
3. The agent can retry with corrected strings

### Block Templates

Letta supports block templates for consistent initialization:

```python
# Create a template
template = client.create_block(
    label="persona",
    value="You are {agent_name}, a {role} at {company}.",
    template_name="corporate_assistant"
)

# Use template when creating agents
agent = client.create_agent(
    name="support_bot",
    memory_blocks=[
        {"template_name": "corporate_assistant", "label": "persona"}
    ]
)
```

---

## 5. Conversation Compaction

### The Problem

LLM context windows are finite. A long conversation will eventually exceed the window. Letta needs to keep the conversation going without losing important context.

### How Compaction Works

**Trigger:** When the in-context message count exceeds the configured threshold (`message_buffer_autocomplete` or based on token count approaching context limit).

**Process (from `letta/agent.py`):**

1. **Detect overflow:** Before each LLM call, check if total tokens (system prompt + core memory + messages + tools) exceed context window
2. **Select messages for compaction:** Take the oldest N messages from the in-context window (keeping most recent messages intact)
3. **Summarize:** Send the messages to be compacted to the LLM with a summarization prompt
4. **Replace:** Remove the compacted messages from context, insert a summary message in their place
5. **Persist:** The original messages remain in the database (recall memory) — they're just no longer in-context

**Summarization prompt (simplified):**

```
Summarize the following conversation segment. Preserve:
- Key facts learned about the user
- Important decisions made
- Action items or commitments
- Any information the agent will need to reference later

Conversation to summarize:
{messages}

Previous summary (if any):
{existing_summary}
```

### Recursive Summarization

When summaries themselves get too long, Letta applies recursive summarization — summarizing the summary. This creates a hierarchical compression:

```
Original messages (1000 tokens) → Summary 1 (200 tokens) → Summary 2 (50 tokens)
```

### Context Window Management

```python
# From agent configuration
class AgentState(BaseModel):
    # ...
    context_window: int = 8192  # Total context budget
    message_buffer_size: int = 10  # Min messages to keep in context
    
    # Compaction settings
    enable_summarization: bool = True
    summarizer_model: Optional[str] = None  # Can use cheaper model
```

### What's Preserved vs Lost

**Preserved:**
- Summary of key information
- Core memory updates (persistent across compaction)
- Archival memory insertions (permanent)
- The original messages in the database (searchable via `conversation_search`)

**Lost (from active context):**
- Exact wording of old messages
- Nuance and tone
- Details the summarizer deemed unimportant

**This is why core memory is critical:** Anything important should be written to core memory blocks, not just left in conversation. Compaction can lose it.

---

## 6. Embedding & Retrieval

### Embedding Models

Letta supports multiple embedding providers:

```python
class EmbeddingConfig(BaseModel):
    embedding_endpoint_type: str  # "openai", "hugging-face", "local", "azure"
    embedding_model: str  # e.g., "text-embedding-ada-002", "BAAI/bge-small-en-v1.5"
    embedding_dim: int  # e.g., 1536 for ada-002, 384 for bge-small
    embedding_chunk_size: int = 300  # Characters per chunk for long documents
```

**Default:** OpenAI `text-embedding-3-small` (1536 dimensions)
**Local option:** `BAAI/bge-small-en-v1.5` via HuggingFace (384 dimensions)

### How Archival Memory is Indexed

1. **Insertion:** When `archival_memory_insert(content)` is called:
   - Content is split into chunks if it exceeds `embedding_chunk_size`
   - Each chunk is embedded via the configured embedding model
   - Stored as a `Passage` record with text + embedding vector
   - Indexed in pgvector (PostgreSQL) or similar vector store

2. **Data source loading:** When attaching external documents:
   - Documents are parsed (PDF, TXT, etc.)
   - Split into passages using configurable chunking
   - Each passage is embedded and stored
   - Linked to a `Source` record for provenance

### Retrieval Strategy

**Primary: Top-K Semantic Search**

```python
def search_archival(self, query: str, top_k: int = 10) -> List[Passage]:
    query_embedding = self.embedding_model.embed(query)
    # PostgreSQL with pgvector
    results = Passage.objects.order_by(
        Passage.embedding.cosine_distance(query_embedding)
    ).limit(top_k)
    return results
```

**Pagination:** Results are paginated (default page size ~5-10 results). The agent can request more pages.

**No MMR or hybrid by default.** Letta uses straightforward cosine similarity top-K. This is a potential improvement area for Engram.

### Recall Memory Search

Conversation search uses both:
- **Embedding similarity** on message content
- **Date range filtering** for temporal queries

```python
def search_recall(self, query: str, top_k: int = 10) -> List[Message]:
    query_embedding = self.embedding_model.embed(query)
    results = Message.objects.filter(
        agent_id=self.agent_id
    ).order_by(
        Message.embedding.cosine_distance(query_embedding)
    ).limit(top_k)
    return results
```

---

## 7. Memory Persistence

### Database Backend

**Production:** PostgreSQL with pgvector extension
**Development:** SQLite (limited vector search capabilities)

### Core Schema (PostgreSQL)

```sql
-- Agents
CREATE TABLE agents (
    id UUID PRIMARY KEY,
    name VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    agent_type VARCHAR DEFAULT 'memgpt_agent',
    llm_config JSONB,
    embedding_config JSONB,
    system TEXT,  -- System prompt template
    metadata_ JSONB,
    organization_id UUID REFERENCES organizations(id)
);

-- Memory Blocks
CREATE TABLE blocks (
    id UUID PRIMARY KEY,
    label VARCHAR NOT NULL,
    value TEXT DEFAULT '',
    limit_ INTEGER DEFAULT 2000,
    template_name VARCHAR,
    description TEXT,
    metadata_ JSONB,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent-Block relationship (many-to-many for shared blocks)
CREATE TABLE agents_blocks (
    agent_id UUID REFERENCES agents(id),
    block_id UUID REFERENCES blocks(id),
    PRIMARY KEY (agent_id, block_id)
);

-- Messages (Recall Memory)
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    agent_id UUID REFERENCES agents(id),
    role VARCHAR NOT NULL,
    content TEXT,
    name VARCHAR,
    tool_calls JSONB,
    tool_call_id VARCHAR,
    step_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    embedding VECTOR(1536)  -- pgvector
);

-- Passages (Archival Memory)
CREATE TABLE passages (
    id UUID PRIMARY KEY,
    agent_id UUID,
    source_id UUID,
    file_id UUID,
    text TEXT NOT NULL,
    embedding VECTOR(1536),  -- pgvector
    metadata_ JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    organization_id UUID
);

-- Sources (Document collections)
CREATE TABLE sources (
    id UUID PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    embedding_config JSONB,
    metadata_ JSONB,
    organization_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tools
CREATE TABLE tools (
    id UUID PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    source_type VARCHAR,  -- 'python', 'json'
    source_code TEXT,
    json_schema JSONB,  -- OpenAI function schema
    tags JSONB,
    organization_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Agent-Tool relationship
CREATE TABLE agents_tools (
    agent_id UUID REFERENCES agents(id),
    tool_id UUID REFERENCES tools(id),
    PRIMARY KEY (agent_id, tool_id)
);
```

### Migration Patterns

Letta uses Alembic for database migrations:

```
letta/orm/alembic/
├── env.py
├── script.py.mako
└── versions/
    ├── 001_initial.py
    ├── 002_add_blocks.py
    ├── 003_add_tools.py
    └── ...
```

### Session Persistence

- Agent state (blocks, config) persists across sessions automatically
- Conversation history persists in messages table
- Archival memory persists in passages table
- On agent load, the system reconstructs the context window from: system prompt + current block values + recent messages

---

## 8. Letta REST API

### Agent Management

```bash
# Create an agent
POST /v1/agents
{
    "name": "my_agent",
    "llm_config": {
        "model": "gpt-4o",
        "model_endpoint_type": "openai",
        "context_window": 128000
    },
    "embedding_config": {
        "embedding_model": "text-embedding-3-small",
        "embedding_endpoint_type": "openai",
        "embedding_dim": 1536
    },
    "memory_blocks": [
        {"label": "persona", "value": "You are a helpful assistant.", "limit": 2000},
        {"label": "human", "value": "", "limit": 2000}
    ],
    "tools": ["send_message", "core_memory_append", "core_memory_replace",
              "archival_memory_insert", "archival_memory_search",
              "conversation_search"]
}

# Response: {"id": "agent-xxx", "name": "my_agent", ...}

# List agents
GET /v1/agents

# Get agent details
GET /v1/agents/{agent_id}

# Delete agent
DELETE /v1/agents/{agent_id}

# Update agent
PATCH /v1/agents/{agent_id}
```

### Sending Messages

```bash
# Send a message to an agent
POST /v1/agents/{agent_id}/messages
{
    "role": "user",
    "content": "Hello, what do you know about me?"
}

# Response includes all agent actions:
{
    "messages": [
        {
            "role": "assistant",
            "content": null,  # inner monologue
            "tool_calls": [
                {
                    "function": {
                        "name": "send_message",
                        "arguments": "{\"message\": \"Hello! Based on my memory...\"}"
                    }
                }
            ]
        }
    ]
}

# Streaming
POST /v1/agents/{agent_id}/messages/stream
```

### Memory Management

```bash
# Get agent's core memory (all blocks)
GET /v1/agents/{agent_id}/memory

# Get specific block
GET /v1/agents/{agent_id}/memory/block/{block_label}

# Update a block directly (bypassing LLM)
PATCH /v1/agents/{agent_id}/memory/block/{block_label}
{
    "value": "New block content",
    "limit": 3000
}

# Search archival memory
GET /v1/agents/{agent_id}/archival?query=search+terms&limit=10

# Insert into archival memory
POST /v1/agents/{agent_id}/archival
{
    "content": "Important fact to remember"
}

# Get conversation history
GET /v1/agents/{agent_id}/messages?limit=50&before={message_id}
```

### Block Management

```bash
# Create a block
POST /v1/blocks
{
    "label": "shared_knowledge",
    "value": "Initial content",
    "limit": 5000
}

# List blocks
GET /v1/blocks

# Attach block to agent
POST /v1/agents/{agent_id}/memory/block
{
    "id": "block-xxx"
}

# Detach block from agent
DELETE /v1/agents/{agent_id}/memory/block/{block_label}
```

### Tools Management

```bash
# Create a custom tool
POST /v1/tools
{
    "name": "search_web",
    "description": "Search the web for information",
    "source_code": "def search_web(query: str) -> str:\n    ...",
    "source_type": "python"
}

# Attach tool to agent
POST /v1/agents/{agent_id}/tools
{
    "id": "tool-xxx"
}
```

### Data Sources

```bash
# Create a source
POST /v1/sources
{
    "name": "company_docs"
}

# Upload a file to source
POST /v1/sources/{source_id}/upload
Content-Type: multipart/form-data
file: @document.pdf

# Attach source to agent (loads into archival memory)
POST /v1/agents/{agent_id}/sources/{source_id}
```

---

## 9. What's New in 2025-2026

### Composable Memory (2025)

Letta evolved from fixed persona/human blocks to fully composable memory:
- **Any number of custom blocks** with arbitrary labels
- **Shared blocks** across agents for multi-agent coordination
- **Block templates** for reusable memory configurations
- **Dynamic block attachment/detachment** at runtime

### Agent Development Environment (ADE)

Letta launched a hosted ADE platform:
- Visual agent builder with memory configuration
- Real-time memory inspection during conversations
- Tool testing and debugging
- Multi-agent workflow designer
- Memory analytics (what's being read/written most)

### Multi-Agent Orchestration

- **Agent-to-agent messaging** through tool calls
- **Shared memory blocks** as coordination primitive
- **Orchestrator patterns** — one agent directing others
- **Sleeptime agents** — agents that process and organize memory between conversations (background memory consolidation)

### Sleeptime Agents (2025 — significant addition)

Inspired by how biological memory consolidation happens during sleep:
- Between conversations, a background agent reviews recent interactions
- Reorganizes core memory blocks
- Promotes important information from recall to core/archival
- Creates summaries and connections
- Runs on cheaper models (can use smaller/faster LLMs)

### Letta Cloud

- Hosted Letta service with managed infrastructure
- Multi-tenant agent management
- Built-in monitoring and observability
- Enterprise features (SSO, audit logs, compliance)

### Tool Sandboxing

- Tools run in sandboxed environments (E2B, Docker)
- Agents can execute arbitrary Python code safely
- Tool execution results are streamed back to the agent

---

## 10. Implementable Patterns for Engram

### What Letta Got Right (Copy These)

#### 1. Memory as Tools, Not Magic
The LLM manages its own memory through explicit tool calls. This is transparent, debuggable, and gives the model agency over its memory. **Copy this pattern.**

#### 2. Three-Tier Hierarchy
Core (always in context) → Recall (conversation, searchable) → Archival (everything, vector-indexed). This maps well to how agents actually need memory. **Adopt this hierarchy.**

#### 3. Blocks as First-Class Entities
Named, sized, shareable memory blocks with character limits. Simple but powerful. The label-based addressing (`core_memory_replace("human", ...)`) is clean. **Implement blocks.**

#### 4. Shared Blocks for Multi-Agent
The simplest possible multi-agent memory sharing: same block, multiple agents. Eventual consistency. No complex pub/sub or consensus. **Start with this pattern.**

#### 5. Send-Message-as-Tool
Making response a tool call (not default behavior) means agents can do memory operations without responding. This is crucial for "think before you speak" behavior. **Use this pattern.**

#### 6. Conversation Compaction via Summarization
Automatic context management with recursive summarization. Keeps conversations going indefinitely. **Implement summarization.**

### What Letta Got Wrong or Overcomplicated

#### 1. Exact String Matching for Memory Edits
`core_memory_replace(old_content, new_content)` with exact matching is brittle. Agents frequently get the exact text wrong. **Improvement: Use fuzzy matching, line-based addressing, or structured data instead of raw text replacement.**

#### 2. No Structured Memory
Blocks are raw text. No schema, no types, no validation. You can't query "what's the user's name" without parsing text. **Improvement: Support structured blocks (JSON schema) alongside free-text blocks.**

#### 3. Per-Agent Archival Silos
Each agent has isolated archival memory. No cross-agent search without custom tools. **Improvement: Shared archival spaces with access control.**

#### 4. Basic Retrieval
Just top-K cosine similarity. No reranking, no MMR, no hybrid search. **Improvement: Implement hybrid search (vector + keyword), MMR for diversity, and optional reranking.**

#### 5. No Memory Conflict Resolution
When two agents modify the same shared block simultaneously, last-write-wins. No versioning, no merge. **Improvement: Optimistic concurrency with version vectors, or CRDTs for simple text blocks.**

#### 6. Summarization Quality
Compaction uses the same (expensive) model for summarization. No quality metrics on summaries. Important details can be lost. **Improvement: Use importance scoring, keep "pinned" messages that survive compaction.**

### Unique Patterns for Engram to Innovate On

#### 1. Unified Memory Graph
Instead of three separate stores, build a single knowledge graph where:
- Nodes are memory items (facts, events, entities)
- Edges are relationships (temporal, causal, associative)
- Views project into "core" / "recall" / "archival" based on relevance + recency + importance

#### 2. Memory Importance Scoring
Assign importance scores to memories. Use for:
- Deciding what stays in core
- What survives compaction
- What gets promoted from archival
- Decay over time (forgetting curve) unless reinforced

#### 3. Cross-Agent Memory Permissions
Fine-grained access control:
- Read-only shared blocks
- Write-with-approval blocks
- Private blocks that can be shared selectively
- Audit trail of who read/wrote what

#### 4. Memory Diff & Merge
When agents modify shared memory:
- Track diffs (like git)
- Support three-way merge
- Notify agents of changes to blocks they care about

#### 5. Proactive Memory Retrieval
Instead of only agent-initiated search, also:
- Auto-retrieve relevant archival memories based on current conversation
- "Memory hints" in system prompt: "You might want to recall: [auto-retrieved snippets]"
- Reduces cognitive load on the LLM for memory management

---

## Appendix: Key Source Files in Letta Repository

```
letta/
├── agent.py                    # Core agent loop
├── schemas/
│   ├── agent.py               # AgentState schema
│   ├── block.py               # Block/memory block schemas
│   ├── memory.py              # Memory configuration
│   ├── message.py             # Message schemas
│   ├── passage.py             # Archival passage schemas
│   ├── tool.py                # Tool schemas
│   └── embedding_config.py    # Embedding configuration
├── orm/
│   ├── block.py               # Block ORM model
│   ├── agents_blocks.py       # Many-to-many relationship
│   ├── passage.py             # Passage ORM model
│   └── message.py             # Message ORM model
├── services/
│   ├── agent_manager.py       # Agent CRUD operations
│   ├── block_manager.py       # Block CRUD operations
│   ├── passage_manager.py     # Archival memory operations
│   └── message_manager.py     # Message/recall operations
├── memory.py                   # Memory assembly for context
├── prompts/
│   ├── system/                # System prompt templates
│   └── memgpt_chat.py        # Chat prompt construction
└── server/
    └── rest_api/
        └── routers/
            ├── v1/
            │   ├── agents.py  # Agent endpoints
            │   ├── blocks.py  # Block endpoints
            │   ├── sources.py # Data source endpoints
            │   └── tools.py   # Tool endpoints
```

---

## References

1. Packer, C., Wooders, S., Lin, K., Fang, V., Patil, S. G., Stoica, I., & Gonzalez, J. E. (2023). MemGPT: Towards LLMs as Operating Systems. *arXiv:2310.08560*.
2. Letta Documentation: https://docs.letta.com
3. Letta GitHub: https://github.com/letta-ai/letta
4. Letta Blog: https://www.letta.com/blog
5. Charles Packer talks on memory-augmented agents (2024-2025)
