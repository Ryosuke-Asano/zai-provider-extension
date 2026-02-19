/// <reference types="jest" />
/**
 * Unit tests for MCP client in mcp.ts
 */

import { ZaiMcpClient } from "../src/mcp";
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

      const internal = client as {
        analyzeImage(imageData: string, prompt: string): Promise<string>;
      };
      const result = await internal.analyzeImage(
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

      const internal = client as {
        analyzeImage(imageData: string, prompt: string): Promise<string>;
      };
      await expect(
        internal.analyzeImage("data:image/png;base64,...", "Describe")
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
      const internal = client as {
        analyzeImage(imageData: string, prompt: string): Promise<string>;
      };
      await internal.analyzeImage(imageUrl, "Describe");

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      // Check that image is in messages array
      expect(body.messages).toBeDefined();
      expect(body.messages[0].content).toBeDefined();
      const imageContent = body.messages[0].content.find(
        (c: { type?: string }) => c.type === "image_url"
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
      const internal = client as {
        analyzeImage(imageData: string, prompt: string): Promise<string>;
      };
      await internal.analyzeImage("data:image/png;base64,...", prompt);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const messages = body.messages;
      const promptContent = messages[0].content.find(
        (c: { type?: string }) => c.type === "text"
      );
      expect(promptContent?.text).toBe(prompt);
    });
  });
});
