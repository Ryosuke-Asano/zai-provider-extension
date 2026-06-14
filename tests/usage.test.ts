/// <reference types="jest" />
import * as vscode from "vscode";
import { ZaiUsageMonitor, formatDuration } from "../src/usage";
import { createMockStatusBarItem } from "../__mocks__/vscode";

/** Build a mock SecretStorage with an overridable API key. */
function createSecrets(key: string | undefined) {
  return {
    get: jest.fn().mockResolvedValue(key),
    store: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    onDidChange: jest.fn(),
  } as unknown as vscode.SecretStorage;
}

/** Build a mock Memento (globalState) backed by a Map. */
function createGlobalState(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    get: jest.fn(<T = unknown>(key: string, defaultValue?: T): T =>
      store.has(key) ? (store.get(key) as T) : (defaultValue as T)
    ),
    update: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    keys: jest.fn(() => Array.from(store.keys())),
  } as unknown as vscode.Memento;
}

/** Build a quota response body matching the verified API shape. */
function quotaResponse(
  tokenPct: number,
  tokenResetMs: number,
  mcpPct: number,
  mcpResetMs: number,
  extras: Partial<{
    currentValue: number;
    usage: number;
    remaining: number;
    usageDetails: { modelCode: string; usage: number }[];
  }> = {}
) {
  return {
    code: 200,
    success: true,
    data: {
      level: "max",
      limits: [
        {
          type: "TIME_LIMIT",
          unit: 5,
          number: 1,
          usage: extras.usage ?? 4000,
          currentValue: extras.currentValue ?? 25,
          remaining: extras.remaining ?? 3975,
          percentage: mcpPct,
          nextResetTime: mcpResetMs,
          usageDetails: extras.usageDetails ?? [
            { modelCode: "search-prime", usage: 11 },
            { modelCode: "web-reader", usage: 14 },
          ],
        },
        {
          type: "TOKENS_LIMIT",
          unit: 3,
          number: 5,
          percentage: tokenPct,
          nextResetTime: tokenResetMs,
        },
      ],
    },
  };
}

/** Create a monitor against fresh mocks + a known item handle. */
function createMonitor(
  key: string | undefined,
  state: Record<string, unknown> = {},
  pollMs = 60000
) {
  const secrets = createSecrets(key);
  const globalState = createGlobalState(state);
  // Reset any stale return value left by a previous test (clearAllMocks does
  // NOT clear mockReturnValue), then hand back a fresh, isolated item.
  const statusMock = vscode.window.createStatusBarItem as jest.Mock;
  statusMock.mockReset();
  statusMock.mockImplementation(() => createMockStatusBarItem());
  const item = statusMock() as unknown as vscode.StatusBarItem & {
    __shown: number[];
    __hidden: number[];
  };
  statusMock.mockReturnValue(item);
  const monitor = new ZaiUsageMonitor(secrets, globalState, pollMs);
  return { monitor, secrets, globalState, item };
}

/** Helper to read the rendered tooltip markdown value (mock stores a MarkdownString). */
function tooltipText(item: vscode.StatusBarItem): string {
  const tip = item.tooltip as unknown as vscode.MarkdownString | string;
  return typeof tip === "string" ? tip : tip?.value ?? "";
}

describe("formatDuration", () => {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it("formats sub-hour durations as minutes", () => {
    expect(formatDuration(45 * MIN)).toBe("45m");
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(1 * MIN)).toBe("1m");
  });

  it("formats sub-day durations as hours+minutes", () => {
    expect(formatDuration(3 * HOUR + 20 * MIN)).toBe("3h 20m");
  });

  it("formats sub-month durations as days+hours", () => {
    expect(formatDuration(2 * DAY + 5 * HOUR)).toBe("2d 5h");
  });

  it("formats month+ durations as days only", () => {
    expect(formatDuration(27 * DAY)).toBe("27d");
    expect(formatDuration(30 * DAY)).toBe("30d");
  });

  it("clamps non-positive durations to 0m", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(-1000)).toBe("0m");
  });
});

describe("ZaiUsageMonitor — visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the item by default when enabled (independent of key/auth state)", async () => {
    const { item } = createMonitor(undefined);
    // Constructor calls applyVisibility() → show() when enabled (default true).
    expect(item.__shown.length).toBeGreaterThan(0);
  });

  it("hides the item when the toggle is disabled in persisted state", async () => {
    const { item } = createMonitor("key", { "zai.usageStatusBarEnabled": false });
    expect(item.__hidden.length).toBeGreaterThan(0);
    expect(item.__shown.length).toBe(0);
  });

  it("toggle flips visibility and persists the preference", async () => {
    const { monitor, item, globalState } = createMonitor("key");
    expect(monitor.enabled).toBe(true);

    const nowEnabled = await monitor.toggle();
    expect(nowEnabled).toBe(false);
    expect(monitor.enabled).toBe(false);
    expect(item.__hidden.length).toBeGreaterThan(0);
    expect(globalState.update).toHaveBeenCalledWith(
      "zai.usageStatusBarEnabled",
      false
    );

    const again = await monitor.toggle();
    expect(again).toBe(true);
    expect(item.__shown.length).toBeGreaterThan(1);
  });
});

describe("ZaiUsageMonitor — error states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it("renders a grayed-out error state when no API key is set (still visible)", async () => {
    const { monitor, item } = createMonitor(undefined);
    await monitor.refresh();

    expect(item.text).toContain("$(warning)");
    expect(item.color).toEqual(new vscode.ThemeColor("disabledForeground"));
    // Still visible (shown), not hidden.
    expect(item.__shown.length).toBeGreaterThan(0);
    expect(tooltipText(item)).toContain("No Z.ai API key set");
  });

  it("renders a grayed-out error state on auth failure (401)", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "unauthorized",
    });
    const { monitor, item } = createMonitor("bogus-key");
    await monitor.refresh();

    expect(item.text).toContain("$(warning)");
    expect(item.color).toEqual(new vscode.ThemeColor("disabledForeground"));
    expect(tooltipText(item)).toContain("API key rejected");
    expect(item.__shown.length).toBeGreaterThan(0);
  });

  it("renders a grayed-out error state on network error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));
    const { monitor, item } = createMonitor("some-key");
    await monitor.refresh();

    expect(item.text).toContain("$(warning)");
    expect(tooltipText(item)).toContain("network error");
    expect(item.__shown.length).toBeGreaterThan(0);
  });
});

describe("ZaiUsageMonitor — normal state", () => {
  const NOW = Date.now();
  const HOUR = 60 * 60 * 1000;

  beforeEach(() => {
    jest.clearAllMocks();
    // Lock Date.now so the reset countdown is deterministic.
    jest.spyOn(Date, "now").mockReturnValue(NOW);
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockQuota(tokenPct: number) {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        quotaResponse(tokenPct, NOW + 3 * HOUR, 1, NOW + 11 * 24 * HOUR),
    });
  }

  it("shows the token percentage with the pulse icon", async () => {
    mockQuota(73);
    const { monitor, item } = createMonitor("real-key");
    await monitor.refresh();

    expect(item.text).toBe("$(pulse) Z.ai 73%");
  });

  it("uses the green tier below 80%", async () => {
    mockQuota(72);
    const { monitor, item } = createMonitor("real-key");
    await monitor.refresh();
    expect(item.color).toEqual(new vscode.ThemeColor("charts.green"));
    expect(item.backgroundColor).toBeUndefined();
  });

  it("uses the yellow tier at 80-95%", async () => {
    mockQuota(88);
    const { monitor, item } = createMonitor("real-key");
    await monitor.refresh();
    expect(item.color).toEqual(new vscode.ThemeColor("charts.yellow"));
    expect(item.backgroundColor).toBeUndefined();
  });

  it("uses the red tier at >=95%", async () => {
    mockQuota(97);
    const { monitor, item } = createMonitor("real-key");
    await monitor.refresh();
    expect(item.color).toEqual(new vscode.ThemeColor("charts.red"));
    expect(item.backgroundColor).toBeUndefined();
  });

  it("clicking triggers the refresh command", async () => {
    mockQuota(10);
    const { item } = createMonitor("real-key");
    expect(item.command).toBe("zai.refreshUsage");
  });

  it("tooltip lists both windows, a reset countdown, and command links", async () => {
    mockQuota(50);
    const { monitor, item } = createMonitor("real-key");
    await monitor.refresh();

    const tip = tooltipText(item);
    expect(tip).toContain("Token (5h)");
    expect(tip).toContain("MCP (1mo)");
    // Token window resets in ~3h.
    expect(tip).toContain("3h");
    expect(tip).toContain("[Refresh](command:zai.refreshUsage)");
    expect(tip).toContain("[Hide](command:zai.toggleUsageStatusBar)");
    // MCP window exposes a per-model breakdown.
    expect(tip).toContain("search-prime");
  });
});
