import { Notice, Plugin } from "obsidian";
import { EngramClient, type EngramEvent } from "./engram-client";
import {
  EngramSettingTab,
  DEFAULT_SETTINGS,
  type EngramPluginSettings,
} from "./settings";
import { EngramStatusBar } from "./status-bar";

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
}
