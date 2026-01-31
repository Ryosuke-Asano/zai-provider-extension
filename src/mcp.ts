import * as vscode from "vscode";
import type { ZaiMcpServer } from "./types";

/**
 * MCP Tool definition
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP Tool call result
 */
export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Z.ai MCP Client for making HTTP-based MCP tool calls
 */
export class ZaiMcpClient {
  private apiKey: string;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.apiKey = "";
  }

  /**
   * Initialize the client with API key from secrets
   */
  private async ensureApiKey(): Promise<boolean> {
    if (!this.apiKey) {
      this.apiKey = (await this.secrets.get("zai.apiKey")) ?? "";
    }
    return !!this.apiKey;
  }

  /**
   * Call an MCP tool via HTTP
   * @param serverName The MCP server name (e.g., "web-search-prime")
   * @param toolName The tool name to call
   * @param args The tool arguments
   * @returns The tool result
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    if (!(await this.ensureApiKey())) {
      throw new Error("Z.ai API key not found");
    }

    const { ZAI_MCP_SERVERS } = await import("./types");
    const server = ZAI_MCP_SERVERS[serverName];

    if (!server) {
      throw new Error(`Unknown MCP server: ${serverName}`);
    }

    if (server.type === "http" && server.url) {
      return await this.callHttpTool(server, toolName, args);
    }

    throw new Error(`Unsupported MCP server type: ${server.type}`);
  }

  /**
   * Call an HTTP-based MCP tool
   */
  private async callHttpTool(
    server: ZaiMcpServer,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const url = new URL(server.url!);
    url.pathname = `/tools/${toolName}`;

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...server.headers,
      },
      body: JSON.stringify({
        arguments: args,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `MCP tool call failed: ${response.status} ${response.statusText}\n${errorText}`
      );
    }

    const result = (await response.json()) as McpToolResult;
    return result;
  }

  /**
   * List available tools from an MCP server
   * @param serverName The MCP server name
   * @returns List of available tools
   */
  async listTools(serverName: string): Promise<McpTool[]> {
    if (!(await this.ensureApiKey())) {
      throw new Error("Z.ai API key not found");
    }

    const { ZAI_MCP_SERVERS } = await import("./types");
    const server = ZAI_MCP_SERVERS[serverName];

    if (!server) {
      throw new Error(`Unknown MCP server: ${serverName}`);
    }

    if (server.type === "http" && server.url) {
      const response = await fetch(new URL("/tools", server.url).toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...server.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to list tools: ${response.statusText}`);
      }

      const data = await response.json() as { tools?: McpTool[] };
      return data.tools ?? [];
    }

    throw new Error(`Unsupported MCP server type: ${server.type}`);
  }

  /**
   * Get predefined MCP tool schemas for Z.ai built-in tools
   * These tools are automatically available for all Z.ai models
   */
  static getBuiltinTools(): McpTool[] {
    return [
      {
        name: "web_search_prime",
        description: "Search the web for current information using Z.ai Web Search Prime",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
            search_recency_filter: {
              type: "string",
              enum: ["oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"],
              description: "Filter results by recency",
            },
            location: {
              type: "string",
              enum: ["cn", "us"],
              description: "Search region (cn or us)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "web_reader",
        description: "Read and convert a URL to text/markdown format",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL to read",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "zread",
        description: "Read GitHub repository files and search documentation",
        inputSchema: {
          type: "object",
          properties: {
            repo_name: {
              type: "string",
              description: "Repository name in format 'owner/repo'",
            },
            file_path: {
              type: "string",
              description: "File path to read",
            },
            query: {
              type: "string",
              description: "Search query for documentation",
            },
          },
          required: [],
        },
      },
      {
        name: "vision_analyze_image",
        description: "Analyze an image using Z.ai Vision capabilities. Use this to understand image content, extract text, or describe scenes.",
        inputSchema: {
          type: "object",
          properties: {
            image: {
              type: "string",
              description: "Base64-encoded image data (data URL format)",
            },
            prompt: {
              type: "string",
              description: "What to analyze or extract from the image",
            },
          },
          required: ["image", "prompt"],
        },
      },
    ];
  }

  /**
   * Analyze an image using Z.ai Vision MCP
   * This can be used for non-Vision models to add image processing capabilities
   * @param imageData Base64-encoded image (data URL format)
   * @param prompt What to analyze in the image
   * @returns Image analysis result
   */
  async analyzeImage(imageData: string, prompt: string): Promise<string> {
    if (!(await this.ensureApiKey())) {
      throw new Error("Z.ai API key not found");
    }

    const { ZAI_MCP_SERVERS } = await import("./types");
    const server = ZAI_MCP_SERVERS["vision-mcp"];

    if (!server || server.type !== "http") {
      throw new Error("Vision MCP server not configured");
    }

    // Call the Vision API directly via Z.ai chat completions endpoint
    const response = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "glm-4v-plus", // Use Vision model for image analysis
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices?.[0]?.message?.content ?? "Failed to analyze image";
  }
}
