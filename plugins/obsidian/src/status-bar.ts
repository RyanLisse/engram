import type EngramPlugin from "./main";
import type { EngramHealth } from "./engram-client";

export type ConnectionState = "connected" | "connecting" | "disconnected";

/**
 * Status bar item showing Engram connection health.
 *
 * States:
 *   connected    — green dot, "Engram: Connected (N subs, Xm uptime)"
 *   connecting   — yellow dot, "Engram: Connecting..."
 *   disconnected — red dot, "Engram: Disconnected"
 *
 * Polls /health at the configured interval. Clicking opens settings.
 */
export class EngramStatusBar {
  private plugin: EngramPlugin;
  private statusBarEl: HTMLElement;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private state: ConnectionState = "disconnected";

  constructor(plugin: EngramPlugin) {
    this.plugin = plugin;
    this.statusBarEl = plugin.addStatusBarItem();
    this.statusBarEl.addClass("engram-status-bar");

    // Click to open settings
    this.statusBarEl.addEventListener("click", () => {
      // Open the Engram settings tab
      const app = this.plugin.app as any;
      if (app.setting) {
        app.setting.open();
        app.setting.openTabById("engram-memory");
      }
    });

    this.render();
  }

  /**
   * Start polling the health endpoint at the configured interval.
   */
  startPolling(): void {
    this.stopPolling();
    this.setState("connecting");
    this.checkHealth();
    this.pollInterval = setInterval(
      () => this.checkHealth(),
      this.plugin.settings.pollIntervalMs
    );
  }

  /**
   * Stop health polling.
   */
  stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Restart polling (e.g., after settings change).
   */
  restartPolling(): void {
    this.startPolling();
  }

  /**
   * Set visibility based on settings.
   */
  setVisible(visible: boolean): void {
    this.statusBarEl.style.display = visible ? "" : "none";
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.stopPolling();
    this.statusBarEl.remove();
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.render();
  }

  private async checkHealth(): Promise<void> {
    const health: EngramHealth = await this.plugin.client.health();
    if (health.ok) {
      this.setState("connected");
      this.renderConnected(health);
    } else {
      this.setState("disconnected");
    }
  }

  private render(): void {
    this.statusBarEl.empty();

    // Remove old state classes
    this.statusBarEl.removeClass(
      "engram-status-connected",
      "engram-status-connecting",
      "engram-status-disconnected"
    );

    switch (this.state) {
      case "connected":
        this.statusBarEl.addClass("engram-status-connected");
        this.statusBarEl.setText("Engram: Connected");
        break;
      case "connecting":
        this.statusBarEl.addClass("engram-status-connecting");
        this.statusBarEl.setText("Engram: Connecting...");
        break;
      case "disconnected":
        this.statusBarEl.addClass("engram-status-disconnected");
        this.statusBarEl.setText("Engram: Disconnected");
        break;
    }
  }

  private renderConnected(health: EngramHealth): void {
    this.statusBarEl.empty();
    this.statusBarEl.removeClass(
      "engram-status-connected",
      "engram-status-connecting",
      "engram-status-disconnected"
    );
    this.statusBarEl.addClass("engram-status-connected");

    const parts: string[] = ["Engram: Connected"];
    if (health.totalSubscriptions !== undefined && health.totalSubscriptions > 0) {
      parts.push(`${health.totalSubscriptions} subs`);
    }
    if (health.uptime !== undefined) {
      const mins = Math.round(health.uptime / 60);
      parts.push(`${mins}m`);
    }

    this.statusBarEl.setText(parts.join(" | "));
  }
}
