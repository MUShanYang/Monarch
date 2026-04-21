/**
 * Model Health Checker
 *
 * 检测 LLM 服务和模型的健康状态,在模型掉线时提供友好提示
 */

export interface ModelHealthStatus {
  readonly available: boolean;
  readonly modelId?: string;
  readonly error?: string;
  readonly suggestion?: string;
}

export interface ModelHealthCheckOptions {
  readonly baseUrl: string;
  readonly service?: string;
  readonly timeoutMs?: number;
}

/**
 * 检查 LM Studio 模型是否已加载
 */
async function checkLMStudioModels(baseUrl: string, timeoutMs: number): Promise<ModelHealthStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/models`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        available: false,
        error: `LM Studio API 返回 ${response.status}`,
        suggestion: "请检查 LM Studio 是否正在运行",
      };
    }

    const data = await response.json() as { data?: Array<{ id: string }> };
    const models = data.data ?? [];

    if (models.length === 0) {
      return {
        available: false,
        error: "LM Studio 没有加载任何模型",
        suggestion: "请在 LM Studio 中加载一个模型:\n  1. 打开 LM Studio\n  2. 在 'Local Server' 标签页中加载模型\n  3. 确保服务器正在运行 (端口 1234)",
      };
    }

    return {
      available: true,
      modelId: models[0]?.id,
    };
  } catch (error) {
    const msg = String(error);

    if (msg.includes("aborted") || msg.includes("timeout")) {
      return {
        available: false,
        error: "连接 LM Studio 超时",
        suggestion: "请检查 LM Studio 是否正在运行,或尝试重启 LM Studio",
      };
    }

    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return {
        available: false,
        error: "无法连接到 LM Studio",
        suggestion: "请确保 LM Studio 正在运行并且 Local Server 已启动 (http://127.0.0.1:1234)",
      };
    }

    return {
      available: false,
      error: `检查失败: ${msg}`,
      suggestion: "请检查 LM Studio 是否正常运行",
    };
  }
}

/**
 * 检查通用 OpenAI 兼容服务的模型
 */
async function checkGenericModels(baseUrl: string, timeoutMs: number): Promise<ModelHealthStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/models`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        available: false,
        error: `API 返回 ${response.status}`,
      };
    }

    const data = await response.json() as { data?: Array<{ id: string }> };
    const models = data.data ?? [];

    if (models.length === 0) {
      return {
        available: false,
        error: "服务没有可用的模型",
      };
    }

    return {
      available: true,
      modelId: models[0]?.id,
    };
  } catch (error) {
    return {
      available: false,
      error: String(error),
    };
  }
}

/**
 * 检查模型健康状态
 */
export async function checkModelHealth(options: ModelHealthCheckOptions): Promise<ModelHealthStatus> {
  const { baseUrl, service, timeoutMs = 5000 } = options;

  // LM Studio 特殊处理
  if (service === "lmstudio" || baseUrl.includes("127.0.0.1:1234") || baseUrl.includes("localhost:1234")) {
    return checkLMStudioModels(baseUrl, timeoutMs);
  }

  // Ollama 特殊处理
  if (service === "ollama" || baseUrl.includes("11434")) {
    const status = await checkGenericModels(baseUrl, timeoutMs);
    if (!status.available && !status.suggestion) {
      return {
        ...status,
        suggestion: "请确保 Ollama 正在运行: ollama serve",
      };
    }
    return status;
  }

  // 通用检查
  return checkGenericModels(baseUrl, timeoutMs);
}

/**
 * 在重试前检查模型健康状态,如果是模型未加载问题则给出友好提示
 */
export async function checkModelHealthBeforeRetry(
  error: unknown,
  baseUrl: string,
  service?: string,
): Promise<void> {
  const msg = String(error);

  // 只在连接错误时检查
  if (!msg.includes("ECONNREFUSED") && !msg.includes("fetch failed") && !msg.includes("无法连接")) {
    return;
  }

  console.log(`[monarch] 检测到连接错误,正在检查模型状态...`);

  const status = await checkModelHealth({ baseUrl, service, timeoutMs: 3000 });

  if (!status.available && status.suggestion) {
    console.error(`\n[monarch] ❌ 模型健康检查失败:`);
    console.error(`  错误: ${status.error}`);
    console.error(`\n  ${status.suggestion}\n`);
  }
}
