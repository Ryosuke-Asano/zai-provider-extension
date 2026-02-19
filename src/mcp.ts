import * as vscode from "vscode";

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
   * Analyze an image using Z.ai Vision model
   * This can be used for non-Vision models to add image processing capabilities
   * @param imageData Base64-encoded image (data URL format)
   * @param prompt What to analyze in the image
   * @returns Image analysis result
   */
  async analyzeImage(imageData: string, prompt: string): Promise<string> {
    if (!(await this.ensureApiKey())) {
      throw new Error("Z.ai API key not found");
    }

    // Call Vision model via chat completions endpoint
    const response = await fetch(
      "https://api.z.ai/api/coding/paas/v4/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "glm-4.6v",
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
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const result =
      data.choices?.[0]?.message?.content ?? "Failed to analyze image";
    return result;
  }
}
