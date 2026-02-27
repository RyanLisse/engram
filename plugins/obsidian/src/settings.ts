import { App, PluginSettingTab, Setting } from "obsidian";
import type EngramPlugin from "./main";

export interface EngramPluginSettings {
  /** SSE server URL (default: http://localhost:3940) */
  sseUrl: string;
  /** Agent identity for this Obsidian instance */
  agentId: string;
  /** Auto-connect to SSE stream on plugin load */
  autoConnect: boolean;
  /** Show connection status in the status bar */
  showStatusBar: boolean;
  /** Health check polling interval in milliseconds */
  pollIntervalMs: number;
}

export const DEFAULT_SETTINGS: EngramPluginSettings = {
  sseUrl: "http://localhost:3940",
  agentId: "obsidian",
  autoConnect: true,
  showStatusBar: true,
  pollIntervalMs: 30000,
};

export class EngramSettingTab extends PluginSettingTab {
  plugin: EngramPlugin;

  constructor(app: App, plugin: EngramPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Engram Memory" });
    containerEl.createEl("p", {
      text: "Connect your Obsidian vault to Engram for unified multi-agent memory.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("SSE Server URL")
      .setDesc(
        "The Engram SSE server address. Set ENGRAM_SSE_PORT when starting the MCP server."
      )
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:3940")
          .setValue(this.plugin.settings.sseUrl)
          .onChange(async (value) => {
            this.plugin.settings.sseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Agent ID")
      .setDesc("Unique identifier for this Obsidian instance in the Engram network.")
      .addText((text) =>
        text
          .setPlaceholder("obsidian")
          .setValue(this.plugin.settings.agentId)
          .onChange(async (value) => {
            this.plugin.settings.agentId = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-connect")
      .setDesc("Automatically connect to the SSE event stream when Obsidian starts.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoConnect).onChange(async (value) => {
          this.plugin.settings.autoConnect = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Show status bar")
      .setDesc("Display Engram connection status in the bottom status bar.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showStatusBar).onChange(async (value) => {
          this.plugin.settings.showStatusBar = value;
          await this.plugin.saveSettings();
          this.plugin.updateStatusBarVisibility();
        })
      );

    new Setting(containerEl)
      .setName("Health check interval")
      .setDesc("How often to poll the health endpoint (in seconds).")
      .addSlider((slider) =>
        slider
          .setLimits(5, 120, 5)
          .setValue(this.plugin.settings.pollIntervalMs / 1000)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.pollIntervalMs = value * 1000;
            await this.plugin.saveSettings();
            this.plugin.restartHealthPolling();
          })
      );

    // Connection actions
    containerEl.createEl("h3", { text: "Connection" });

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Check if the Engram SSE server is reachable.")
      .addButton((button) =>
        button.setButtonText("Test").onClick(async () => {
          button.setButtonText("Testing...");
          button.setDisabled(true);
          const health = await this.plugin.client.health();
          if (health.ok) {
            button.setButtonText(
              `Connected (uptime: ${Math.round((health.uptime ?? 0) / 60)}m)`
            );
          } else {
            button.setButtonText("Failed — check URL");
          }
          setTimeout(() => {
            button.setButtonText("Test");
            button.setDisabled(false);
          }, 3000);
        })
      );
  }
}
