import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatCompletion, createLLMClient, type LLMClient, type RetryConfig } from "../llm/provider.js";
import type { LLMConfig } from "../models/project.js";

describe("LLM Retry Mechanism", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  const createTestClient = (): LLMClient => {
    const config: LLMConfig = {
      provider: "openai",
      service: "custom",
      baseUrl: "https://api.test.com/v1",
      apiKey: "test-key",
      model: "test-model",
      temperature: 0.7,
      maxTokens: 1000,
    };
    return createLLMClient(config);
  };

  it("应该在网络错误时重试", async () => {
    const client = createTestClient();

    // 前两次失败,第三次成功
    mockFetch
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        json: async () => ({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response);

    const retryConfig: Partial<RetryConfig> = {
      maxRetries: 3,
      initialDelayMs: 10, // 快速测试
      backoffMultiplier: 1.5,
    };

    const result = await chatCompletion(
      client,
      "test-model",
      [{ role: "user", content: "test" }],
      { retryConfig }
    );

    expect(result.content).toBe("success");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("应该在 429 错误时重试", async () => {
    const client = createTestClient();

    // 第一次 429,第二次成功
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => JSON.stringify({ error: { message: "Rate limit exceeded" } }),
        json: async () => ({ error: { message: "Rate limit exceeded" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: "success after retry" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        json: async () => ({
          choices: [{ message: { content: "success after retry" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response);

    const retryConfig: Partial<RetryConfig> = {
      maxRetries: 2,
      initialDelayMs: 10,
    };

    const result = await chatCompletion(
      client,
      "test-model",
      [{ role: "user", content: "test" }],
      { retryConfig }
    );

    expect(result.content).toBe("success after retry");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("应该在 500/502/503/504 错误时重试", async () => {
    const client = createTestClient();

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => JSON.stringify({ error: { message: "Server error" } }),
        json: async () => ({ error: { message: "Server error" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: async () => JSON.stringify({ error: { message: "Service unavailable" } }),
        json: async () => ({ error: { message: "Service unavailable" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: "recovered" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        json: async () => ({
          choices: [{ message: { content: "recovered" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response);

    const retryConfig: Partial<RetryConfig> = {
      maxRetries: 3,
      initialDelayMs: 10,
    };

    const result = await chatCompletion(
      client,
      "test-model",
      [{ role: "user", content: "test" }],
      { retryConfig }
    );

    expect(result.content).toBe("recovered");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("不应该在 400 错误时重试", async () => {
    const client = createTestClient();

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify({ error: { message: "Invalid request" } }),
      json: async () => ({ error: { message: "Invalid request" } }),
    } as Response);

    const retryConfig: Partial<RetryConfig> = {
      maxRetries: 3,
      initialDelayMs: 10,
    };

    await expect(
      chatCompletion(
        client,
        "test-model",
        [{ role: "user", content: "test" }],
        { retryConfig }
      )
    ).rejects.toThrow();

    // 400 错误不可重试,只调用一次
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("不应该在 401 错误时重试", async () => {
    const client = createTestClient();

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => JSON.stringify({ error: { message: "Invalid API key" } }),
      json: async () => ({ error: { message: "Invalid API key" } }),
    } as Response);

    const retryConfig: Partial<RetryConfig> = {
      maxRetries: 3,
      initialDelayMs: 10,
    };

    await expect(
      chatCompletion(
        client,
        "test-model",
        [{ role: "user", content: "test" }],
        { retryConfig }
      )
    ).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("应该在达到最大重试次数后抛出错误", async () => {
    const client = createTestClient();

    // 所有尝试都失败
    mockFetch.mockRejectedValue(new Error("fetch failed"));

    const retryConfig: Partial<RetryConfig> = {
      maxRetries: 2,
      initialDelayMs: 10,
    };

    await expect(
      chatCompletion(
        client,
        "test-model",
        [{ role: "user", content: "test" }],
        { retryConfig }
      )
    ).rejects.toThrow();

    // 初始调用 + 2 次重试 = 3 次
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("应该使用指数退避延迟", async () => {
    const client = createTestClient();
    const startTime = Date.now();

    mockFetch
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        json: async () => ({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response);

    const retryConfig: Partial<RetryConfig> = {
      maxRetries: 3,
      initialDelayMs: 50,
      backoffMultiplier: 2,
    };

    await chatCompletion(
      client,
      "test-model",
      [{ role: "user", content: "test" }],
      { retryConfig }
    );

    const totalTime = Date.now() - startTime;

    // 第一次重试: 50ms
    // 第二次重试: 100ms
    // 总延迟应该至少 150ms
    expect(totalTime).toBeGreaterThanOrEqual(140); // 留一些误差空间
  });

  it("应该限制最大延迟时间", async () => {
    const client = createTestClient();

    mockFetch
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        json: async () => ({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response);

    const retryConfig: Partial<RetryConfig> = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 100, // 限制最大延迟
      backoffMultiplier: 10,
    };

    const startTime = Date.now();
    await chatCompletion(
      client,
      "test-model",
      [{ role: "user", content: "test" }],
      { retryConfig }
    );
    const totalTime = Date.now() - startTime;

    // 即使指数退避会产生很大的延迟,也应该被限制在 maxDelayMs
    // 两次重试,每次最多 100ms = 200ms
    expect(totalTime).toBeLessThan(300);
  });
});
