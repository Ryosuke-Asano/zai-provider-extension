/**
 * Unit tests for MCP client in mcp.ts
 */

import { ZaiMcpClient, McpTool, McpToolResult } from "../src/mcp";
import { secrets } from "../__mocks__/vscode";

// Mock fetch for testing
global.fetch = jest.fn();

describe("ZaiMcpClient", () => {
  let client: ZaiMcpClient;

  beforeEach(() => {
    client = new ZaiMcpClient(secrets);
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create client with empty API key", () => {
      const newClient = new ZaiMcpClient(secrets);
      expect(newClient).toBeDefined();
    });

    it("should store secrets reference", () => {
      const newClient = new ZaiMcpClient(secrets);
      expect(newClient).toHaveProperty("secrets");
    });
  });

  describe("ensureApiKey", () => {
    it("should load API key from secrets", async () => {
      (secrets.get as jest.Mock).mockResolvedValue("test-api-key");

      // Access private method via any for testing
      const result = await (client as any).ensureApiKey();

      expect(result).toBe(true);
      expect(secrets.get).toHaveBeenCalledWith("zai.apiKey");
    });

    it("should return false when API key is not found", async () => {
      (secrets.get as jest.Mock).mockResolvedValue(undefined);

      const result = await (client as any).ensureApiKey();

      expect(result).toBe(false);
    });

    it("should cache API key after first load", async () => {
      (secrets.get as jest.Mock).mockResolvedValue("test-api-key");

      await (client as any).ensureApiKey();
      await (client as any).ensureApiKey(); // Second call

      expect(secrets.get).toHaveBeenCalledTimes(1); // Should not call again
    });
  });

  describe("callTool", () => {
    beforeEach(() => {
      (secrets.get as jest.Mock).mockResolvedValue("test-api-key");
    });

    it("should call HTTP tool successfully", async () => {
      const mockResponse: McpToolResult = {
        content: [
          {
            type: "text",
            text: "Tool result",
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.callTool("vision-mcp", "analyze_image", {
        image: "data:image/png;base64,...",
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should throw error when API key is not set", async () => {
      (secrets.get as jest.Mock).mockResolvedValue(undefined);

      await expect(
        client.callTool("vision-mcp", "analyze_image", {})
      ).rejects.toThrow("Z.ai API key not found");
    });

    it("should throw error for unknown server", async () => {
      (secrets.get as jest.Mock).mockResolvedValue("test-api-key");

      await expect(
        client.callTool("unknown-server", "some_tool", {})
      ).rejects.toThrow("Unknown MCP server: unknown-server");
    });

    it("should throw error on failed HTTP response", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Server error",
      });

      await expect(
        client.callTool("vision-mcp", "analyze_image", {})
      ).rejects.toThrow("MCP tool call failed");
    });

    it("should include authorization header", async () => {
      const mockResponse: McpToolResult = {
        content: [{ type: "text", text: "Success" }],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await client.callTool("vision-mcp", "analyze_image", {});

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;
      expect(headers.Authorization).toBe("Bearer test-api-key");
    });

    it("should include Content-Type header", async () => {
      const mockResponse: McpToolResult = {
        content: [{ type: "text", text: "Success" }],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await client.callTool("vision-mcp", "analyze_image", {});

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("should send tool arguments in request body", async () => {
      const mockResponse: McpToolResult = {
        content: [{ type: "text", text: "Success" }],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const args = { image: "test-image-url", prompt: "Describe this" };
      await client.callTool("vision-mcp", "analyze_image", args);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.arguments).toEqual(args);
    });
  });

  describe("listTools", () => {
    beforeEach(() => {
      (secrets.get as jest.Mock).mockResolvedValue("test-api-key");
    });

    it("should list tools from HTTP server successfully", async () => {
      const mockTools: McpTool[] = [
        {
          name: "analyze_image",
          description: "Analyze an image",
          inputSchema: { type: "object" },
        },
        {
          name: "crop_image",
          description: "Crop an image",
          inputSchema: { type: "object" },
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ tools: mockTools }),
      });

      const result = await client.listTools("vision-mcp");

      expect(result).toEqual(mockTools);
      expect(result.length).toBe(2);
    });

    it("should throw error when API key is not set", async () => {
      (secrets.get as jest.Mock).mockResolvedValue(undefined);

      await expect(client.listTools("vision-mcp")).rejects.toThrow(
        "Z.ai API key not found"
      );
    });

    it("should throw error for unknown server", async () => {
      (secrets.get as jest.Mock).mockResolvedValue("test-api-key");

      await expect(client.listTools("unknown-server")).rejects.toThrow(
        "Unknown MCP server: unknown-server"
      );
    });

    it("should handle missing tools in response", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await client.listTools("vision-mcp");

      expect(result).toEqual([]);
    });

    it("should handle failed list request", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: "Bad Request",
      });

      await expect(client.listTools("vision-mcp")).rejects.toThrow(
        "Failed to list tools"
      );
    });

    it("should call correct endpoint for listing tools", async () => {
      const mockTools: McpTool[] = [];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ tools: mockTools }),
      });

      await client.listTools("vision-mcp");

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[0]).toContain("/tools");
    });
  });

  describe("getBuiltinTools", () => {
    it("should return static built-in tools", () => {
      const tools = ZaiMcpClient.getBuiltinTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it("should include web_search_prime tool", () => {
      const tools = ZaiMcpClient.getBuiltinTools();

      const webSearchTool = tools.find((t) => t.name === "web_search_prime");
      expect(webSearchTool).toBeDefined();
      expect(webSearchTool?.description).toBeDefined();
    });

    it("should all tools have required fields", () => {
      const tools = ZaiMcpClient.getBuiltinTools();

      tools.forEach((tool) => {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe("string");
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe("object");
      });
    });

    it("should all tool names be unique", () => {
      const tools = ZaiMcpClient.getBuiltinTools();
      const names = tools.map((t) => t.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe("analyzeImage", () => {
    beforeEach(() => {
      (secrets.get as jest.Mock).mockResolvedValue("test-api-key");
    });

    it("should call analyze_image tool via MCP", async () => {
      const mockApiResponse = {
        choices: [
          {
            message: {
              content: "This is an image of a cat",
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      });

      const result = await (client as any).analyzeImage(
        "data:image/png;base64,...",
        "Describe this image"
      );

      expect(result).toBe("This is an image of a cat");
      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[0]).toContain("api.z.ai");
    });

    it("should return error message when tool call fails", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Server error",
      });

      await expect(
        (client as any).analyzeImage("data:image/png;base64,...", "Describe")
      ).rejects.toThrow("Vision API error: 500 Server error");
    });

    it("should pass image data URL to tool", async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: "Description" },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const imageUrl = "data:image/png;base64,ABC123";
      await (client as any).analyzeImage(imageUrl, "Describe");

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      // Check that image is in messages array
      expect(body.messages).toBeDefined();
      expect(body.messages[0].content).toBeDefined();
      const imageContent = body.messages[0].content.find(
        (c: any) => c.type === "image_url"
      );
      expect(imageContent?.image_url?.url).toBe(imageUrl);
    });

    it("should pass prompt to tool", async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: "Description" },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const prompt = "Describe this cat in detail";
      await (client as any).analyzeImage("data:image/png;base64,...", prompt);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const messages = body.messages;
      const promptContent = messages[0].content.find(
        (c: any) => c.type === "text"
      );
      expect(promptContent?.text).toBe(prompt);
    });
  });
});
