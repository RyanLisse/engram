import { Notice, Plugin, SuggestModal, TFile } from "obsidian";
import {
  EngramClient,
  type EngramEvent,
  type RecallResult,
} from "./engram-client";
import {
  EngramSettingTab,
  DEFAULT_SETTINGS,
  type EngramPluginSettings,
} from "./settings";
import { EngramStatusBar } from "./status-bar";

class EngramRecallModal extends SuggestModal<RecallResult> {
  private lastInputAt = 0;
  private readonly client: EngramClient;

  constructor(plugin: EngramPlugin) {
    super(plugin.app);
    this.client = plugin.client;
    this.setPlaceholder("Search Engram memory...");
  }

  async getSuggestions(query: string): Promise<RecallResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const token = Date.now();
    this.lastInputAt = token;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 300));

    if (this.lastInputAt !== token) return [];

    try {
      return await this.client.recall(trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Engram recall failed: ${message}`);
      return [];
    }
  }

  renderSuggestion(result: RecallResult, el: HTMLElement): void {
    const row = el.createDiv({ cls: "engram-recall-row" });
    row.createDiv({
      cls: "engram-recall-content",
      text: this.buildSnippet(result.content),
    });

    const meta = row.createDiv({ cls: "engram-recall-meta" });
    meta.createSpan({ cls: "engram-badge engram-score", text: this.scoreText(result) });
    meta.createSpan({
      cls: "engram-badge engram-fact-type",
      text: result.factType || "fact",
    });
    meta.createSpan({
      cls: "engram-time",
      text: this.relativeTime(result.createdAt),
    });
  }

  onChooseSuggestion(result: RecallResult, _evt: MouseEvent | KeyboardEvent): void {
    void this.openSuggestion(result);
  }

  private buildSnippet(content: string): string {
    const normalized = content.replace(/\s+/g, " ").trim();
    return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
  }

  private scoreText(result: RecallResult): string {
    return `score ${result.score.toFixed(2)}`;
  }

  private relativeTime(createdAt: number): string {
    const ts = createdAt < 1_000_000_000_000 ? createdAt * 1000 : createdAt;
    const deltaMs = Date.now() - ts;
    if (deltaMs < 60_000) return "just now";
    if (deltaMs < 3_600_000) return `${Math.floor(deltaMs / 60_000)}m ago`;
    if (deltaMs < 86_400_000) return `${Math.floor(deltaMs / 3_600_000)}h ago`;
    return `${Math.floor(deltaMs / 86_400_000)}d ago`;
  }

  private async openSuggestion(result: RecallResult): Promise<void> {
    if (result.vaultPath) {
      const abstractFile = this.app.vault.getAbstractFileByPath(result.vaultPath);
      if (abstractFile instanceof TFile) {
        await this.app.workspace.getLeaf(true).openFile(abstractFile);
        return;
      }
    }

    const fileName = `Engram Recall ${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.md`;
    const file = await this.app.vault.create(fileName, result.content);
    await this.app.workspace.getLeaf(true).openFile(file);
  }
}

export default class EngramPlugin extends Plugin {
  settings: EngramPluginSettings = DEFAULT_SETTINGS;
  client!: EngramClient;
  statusBar!: EngramStatusBar;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize the Engram HTTP/SSE client
    this.client = new EngramClient({
      sseUrl: this.settings.sseUrl,
      agentId: this.settings.agentId,
    });

    // Status bar
    this.statusBar = new EngramStatusBar(this);
    this.updateStatusBarVisibility();

    // Settings tab
    this.addSettingTab(new EngramSettingTab(this.app, this));

    // Auto-connect if configured
    if (this.settings.autoConnect) {
      this.connectToEngram();
    }

    // Start health polling for the status bar
    if (this.settings.showStatusBar) {
      this.statusBar.startPolling();
    }

    // Register command: toggle connection
    this.addCommand({
      id: "engram-toggle-connection",
      name: "Toggle Engram connection",
      callback: () => {
        if (this.client.isConnected) {
          this.client.disconnect();
          this.statusBar.stopPolling();
        } else {
          this.connectToEngram();
          this.statusBar.startPolling();
        }
      },
    });

    // Register command: check health
    this.addCommand({
      id: "engram-health-check",
      name: "Check Engram health",
      callback: async () => {
        const health = await this.client.health();
        if (health.ok) {
          const uptime = health.uptime
            ? `${Math.round(health.uptime / 60)}m`
            : "unknown";
          const subs = health.totalSubscriptions ?? 0;
          new Notice(
            `Engram: Connected | Uptime: ${uptime} | Subscriptions: ${subs}`
          );
        } else {
          new Notice("Engram: Cannot reach SSE server");
        }
      },
    });

    // Register command: store active note as fact
    this.addCommand({
      id: "engram-store-as-fact",
      name: "Engram: Store as Fact",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("No active file");
          return;
        }

        try {
          const content = await this.app.vault.read(file);
          const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
          const factType =
            typeof frontmatter?.factType === "string" ? frontmatter.factType : undefined;
          const tags = this.parseTags(frontmatter?.tags);
          const importanceScore = this.parseImportance(frontmatter?.importance);

          await this.client.storeFact({ content, factType, tags, importanceScore });
          new Notice("Fact stored in Engram");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          new Notice(`Engram store failed: ${message}`);
        }
      },
    });

    // Register command: recall search modal
    this.addCommand({
      id: "engram-recall",
      name: "Engram: Recall",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "R" }],
      callback: () => {
        new EngramRecallModal(this).open();
      },
    });
  }

  async onunload(): Promise<void> {
    this.client.disconnect();
    this.statusBar.destroy();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Propagate config changes to client
    this.client.updateConfig({
      sseUrl: this.settings.sseUrl,
      agentId: this.settings.agentId,
    });
  }

  /**
   * Connect to the Engram SSE event stream.
   * Events are logged to console for now; future beads will add UI.
   */
  connectToEngram(): void {
    this.client.connectEventStream((event: EngramEvent) => {
      console.log(`[engram] Event: ${event.type}`, event);
    });
  }

  /**
   * Show/hide the status bar based on settings.
   */
  updateStatusBarVisibility(): void {
    this.statusBar.setVisible(this.settings.showStatusBar);
  }

  /**
   * Restart health polling (called from settings when interval changes).
   */
  restartHealthPolling(): void {
    if (this.settings.showStatusBar) {
      this.statusBar.restartPolling();
    }
  }

  private parseTags(value: unknown): string[] | undefined {
    if (Array.isArray(value)) {
      const tags = value.filter((tag): tag is string => typeof tag === "string");
      return tags.length > 0 ? tags : undefined;
    }

    if (typeof value === "string") {
      const tags = value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      return tags.length > 0 ? tags : undefined;
    }

    return undefined;
  }

  private parseImportance(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }
}
