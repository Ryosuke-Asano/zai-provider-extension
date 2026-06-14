import * as vscode from "vscode";

/**
 * Z.ai usage / quota status bar indicator.
 *
 * Shows the account's Token-window usage percentage in the status bar,
 * color-coded by tier (green / yellow / red), with a rich hover tooltip
 * that lists each quota window (Token 5h / MCP 1mo), the used amount,
 * limit, percentage, and a humanized "resets in ..." countdown derived
 * from the API's `nextResetTime`.
 *
 * Visibility is governed ONLY by a user toggle. Key / auth / network
 * problems do NOT hide the item — instead they render a grayed-out
 * error state so the problem stays visible.
 *
 * The status bar calls `https://api.z.ai/api/monitor/usage/quota/limit`
 * directly via the global `fetch` (self-contained; no external tool).
 */

/** Secret key used across the extension (same as src/mcp.ts / src/provider.ts). */
const API_KEY_SECRET = "zai.apiKey";

/** Quota limit endpoint (verified working with `Authorization: Bearer <key>`). */
const QUOTA_URL = "https://api.z.ai/api/monitor/usage/quota/limit";

/** Poll interval (ms). Overridable via the globalState key below for testing. */
const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** Persisted-toggle globalState key. */
const TOGGLE_STATE_KEY = "zai.usageStatusBarEnabled";

/** Codicon shown before the percentage in the normal state. */
const NORMAL_ICON = "$(pulse)";
/** Codicon shown in error / grayed-out states. */
const ERROR_ICON = "$(warning)";

/** Status bar alignment + priority (right side, fairly high). */
const STATUS_BAR_ALIGNMENT = vscode.StatusBarAlignment.Right;
const STATUS_BAR_PRIORITY = 100;

/** Limit type identifiers returned by the quota API. */
type LimitType = string;

/** A single usage-detail row (per-model breakdown for the MCP window). */
interface UsageDetail {
  modelCode?: string;
  usage?: number;
}

/** One quota window as returned by `data.limits[]`. */
interface QuotaLimit {
  type: LimitType;
  /** Window size magnitude (e.g. 5 for 5h, 1 for 1 month). */
  unit?: number;
  /** Window size count paired with `unit`. */
  number?: number;
  /** % used (0–100). Present for every limit type. */
  percentage?: number;
  /** Epoch-ms timestamp when this window resets. Present for every limit type. */
  nextResetTime?: number;
  /** Hard limit value (MCP window only). */
  usage?: number;
  /** Current consumed amount (MCP window only). */
  currentValue?: number;
  /** Remaining amount (MCP window only). */
  remaining?: number;
  /** Per-model breakdown (MCP window only). */
  usageDetails?: UsageDetail[];
}

/** Top-level quota response. */
interface QuotaResponse {
  code?: number;
  success?: boolean;
  data?: {
    level?: string;
    limits?: QuotaLimit[];
  };
}

/** Normalized quota window used for rendering. */
interface QuotaWindow {
  /** Display label, e.g. "Token (5h)". */
  label: string;
  /** % used (0–100). */
  percentage: number;
  /** Epoch-ms when the window resets (undefined when unknown). */
  nextResetTime?: number;
  /** Current consumed amount (optional; TOKENS_LIMIT omits it). */
  currentValue?: number;
  /** Hard limit amount (optional; TOKENS_LIMIT omits it). */
  limit?: number;
  /** Per-model breakdown rows (optional). */
  usageDetails?: UsageDetail[];
}

/** Why the indicator is currently in an error / grayed-out state. */
type ErrorState = "no-key" | "auth" | "network" | undefined;

/**
 * Humanize a remaining duration (ms) into a compact countdown string.
 *
 * - `< 60m`        → "45m"
 * - `< 24h`        → "3h 20m"
 * - `< 30d`        → "2d 5h"
 * - `>= 30d`       → "27d"
 * - `<= 0`         → "0m" (window rolled over; refresh will correct it)
 *
 * Pure function — trivially unit-testable.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) {
    return "0m";
  }
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days >= 1) {
    // Omit a trailing zero hours component (e.g. "27d", not "27d 0h").
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours >= 1) {
    // Omit a trailing zero minutes component (e.g. "3h", not "3h 0m").
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/** Pick a toned-down foreground `ThemeColor` for a given used-percentage. */
function colorForPercentage(percentage: number): vscode.ThemeColor {
  if (percentage >= 95) {
    return new vscode.ThemeColor("charts.red");
  }
  if (percentage >= 80) {
    return new vscode.ThemeColor("charts.yellow");
  }
  return new vscode.ThemeColor("charts.green");
}

/**
 * Owns the Z.ai usage status bar item: fetches quota, polls on a timer,
 * refreshes on demand, and renders either a normal or a grayed-out error
 * state. Visibility is controlled solely by the user toggle.
 */
export class ZaiUsageMonitor implements vscode.Disposable {
  private readonly _secrets: vscode.SecretStorage;
  private readonly _globalState: vscode.Memento;
  private readonly _item: vscode.StatusBarItem;
  private readonly _pollIntervalMs: number;

  private _timer: NodeJS.Timeout | undefined;
  private _windows: QuotaWindow[] = [];
  private _errorState: ErrorState = undefined;
  private _userEnabled: boolean;

  constructor(
    secrets: vscode.SecretStorage,
    globalState: vscode.Memento,
    pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
  ) {
    this._secrets = secrets;
    this._globalState = globalState;
    this._pollIntervalMs = pollIntervalMs;

    // Restore persisted toggle (default ON).
    this._userEnabled =
      this._globalState.get<boolean>(TOGGLE_STATE_KEY) ?? true;

    this._item = vscode.window.createStatusBarItem(
      STATUS_BAR_ALIGNMENT,
      STATUS_BAR_PRIORITY
    );
    this._item.name = "Z.ai Usage";
    this._item.command = "zai.refreshUsage";
    this.applyVisibility();
  }

  /** Begin polling and do an initial refresh. Safe to call once on activate. */
  start(): void {
    void this.refresh();
    this._timer = setInterval(() => {
      void this.refresh();
    }, this._pollIntervalMs);
  }

  /** Stop the polling timer. */
  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  /** Dispose the status bar item and the polling timer. */
  dispose(): void {
    this.stop();
    this._item.dispose();
  }

  /**
   * Flip the user toggle, persist it, and show/hide accordingly.
   * Returns the new enabled state.
   */
  async toggle(): Promise<boolean> {
    this._userEnabled = !this._userEnabled;
    await this._globalState.update(TOGGLE_STATE_KEY, this._userEnabled);
    this.applyVisibility();
    return this._userEnabled;
  }

  /** Current toggle state (exposed for tests / inspection). */
  get enabled(): boolean {
    return this._userEnabled;
  }

  /**
   * Fetch the latest quota and re-render. Never throws: any failure is
   * translated into a grayed-out error state so the indicator stays
   * visible to signal the problem.
   */
  async refresh(): Promise<void> {
    const apiKey = await this._secrets.get(API_KEY_SECRET);
    if (!apiKey) {
      this._errorState = "no-key";
      this._windows = [];
      this.render();
      return;
    }

    try {
      const windows = await this.fetchQuota(apiKey);
      this._windows = windows;
      this._errorState = undefined;
      this.render();
    } catch (err) {
      this._errorState = this.classifyError(err);
      this._windows = [];
      this.render();
    }
  }

  /**
   * Call the quota endpoint. Throws a tagged error on auth failure so the
   * caller can distinguish auth vs network problems.
   */
  private async fetchQuota(apiKey: string): Promise<QuotaWindow[]> {
    const response = await fetch(QUOTA_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(
        `Z.ai API key rejected (${response.status})`,
        response.status
      );
    }
    if (!response.ok) {
      throw new Error(
        `Z.ai usage API error: ${response.status} ${response.statusText}`
      );
    }

    const body = (await response.json()) as QuotaResponse;
    const limits = body?.data?.limits ?? [];
    return limits.map(toWindow).filter((w): w is QuotaWindow => w !== null);
  }

  /** Map an HTTP/fetch failure to the appropriate {@link ErrorState}. */
  private classifyError(err: unknown): ErrorState {
    if (err instanceof AuthError) {
      return "auth";
    }
    return "network";
  }

  /** Show or hide the item based solely on the user toggle. */
  private applyVisibility(): void {
    if (this._userEnabled) {
      this._item.show();
      // Ensure the displayed content matches the current state when re-shown.
      this.render();
    } else {
      this._item.hide();
    }
  }

  /** Re-render the status bar text / color / tooltip for the current state. */
  private render(): void {
    if (!this._userEnabled) {
      return; // hidden; nothing to paint
    }

    if (this._errorState) {
      this.renderError();
      return;
    }
    this.renderNormal();
  }

  /** Grayed-out error state: dim color, warning icon, explanatory tooltip. */
  private renderError(): void {
    this._item.text = `${ERROR_ICON} Z.ai`;
    this._item.color = new vscode.ThemeColor("disabledForeground");
    this._item.backgroundColor = undefined;
    this._item.tooltip = this.buildErrorTooltip(this._errorState!);
  }

  /** Normal state: percentage text + tier color + detailed markdown tooltip. */
  private renderNormal(): void {
    const tokenWindow = this._windows.find((w) => w.label.startsWith("Token"));
    const percentage = tokenWindow?.percentage ?? 0;
    const rounded = Math.round(percentage);

    this._item.text = `${NORMAL_ICON} Z.ai ${rounded}%`;
    this._item.color = colorForPercentage(percentage);
    this._item.backgroundColor = undefined;
    this._item.tooltip = this.buildNormalTooltip();
  }

  /** Build the markdown hover tooltip for the error state. */
  private buildErrorTooltip(
    state: Exclude<ErrorState, undefined>
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.supportThemeIcons = true;
    md.supportHtml = true;

    let message: string;
    switch (state) {
      case "no-key":
        message =
          "No Z.ai API key set. Run **Z.ai: Manage Z.ai Provider** to add one.";
        break;
      case "auth":
        message =
          "Z.ai API key rejected (401/403). Update it via **Z.ai: Manage Z.ai Provider**.";
        break;
      default:
        message =
          "Unable to reach the Z.ai usage API (network error). Will retry.";
        break;
    }

    md.appendMarkdown(`$(warning) **Z.ai Usage — Unavailable**\n\n`);
    md.appendMarkdown(message);
    md.appendMarkdown(`\n\n---\n`);
    md.appendMarkdown(
      `[Refresh](command:zai.refreshUsage) · [Hide](command:zai.toggleUsageStatusBar)`
    );
    return md;
  }

  /** Build the markdown hover tooltip for the normal state. */
  private buildNormalTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.supportThemeIcons = true;
    md.supportHtml = true;

    md.appendMarkdown(`$(pulse) **Z.ai Usage**\n\n`);
    md.appendMarkdown(
      "| Window | Used | Limit | % | Resets in |\n|---|---|---|---|---|\n"
    );

    for (const w of this._windows) {
      const used = w.currentValue != null ? String(w.currentValue) : "—";
      const limit = w.limit != null ? String(w.limit) : "—";
      const pct = `${Math.round(w.percentage)}%`;
      const resets =
        w.nextResetTime != null
          ? formatDuration(w.nextResetTime - Date.now())
          : "—";
      md.appendMarkdown(
        `| ${w.label} | ${used} | ${limit} | ${pct} | ${resets} |\n`
      );
    }

    // Append per-model breakdown for windows that expose it (MCP).
    const detailWindow = this._windows.find(
      (w) => w.usageDetails && w.usageDetails.length > 0
    );
    if (detailWindow?.usageDetails?.length) {
      md.appendMarkdown(`\n**${detailWindow.label} breakdown**\n\n`);
      md.appendMarkdown(`| Model | Usage |\n|---|---|\n`);
      for (const d of detailWindow.usageDetails) {
        md.appendMarkdown(
          `| ${d.modelCode ?? "—"} | ${d.usage ?? 0} |\n`
        );
      }
    }

    md.appendMarkdown(`\n---\n`);
    md.appendMarkdown(
      `[Refresh](command:zai.refreshUsage) · [Hide](command:zai.toggleUsageStatusBar)`
    );
    return md;
  }
}

/** Error tag used to distinguish auth failures from network errors. */
class AuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Convert a raw API limit object into a normalized {@link QuotaWindow}.
 * Returns null for unknown / unsupported limit types.
 */
function toWindow(limit: QuotaLimit): QuotaWindow | null {
  switch (limit.type) {
    case "TOKENS_LIMIT":
      return {
        label: "Token (5h)",
        percentage: limit.percentage ?? 0,
        nextResetTime: limit.nextResetTime,
      };
    case "TIME_LIMIT":
      return {
        label: "MCP (1mo)",
        percentage: limit.percentage ?? 0,
        nextResetTime: limit.nextResetTime,
        currentValue: limit.currentValue,
        limit: limit.usage,
        usageDetails: limit.usageDetails,
      };
    default:
      return null;
  }
}
