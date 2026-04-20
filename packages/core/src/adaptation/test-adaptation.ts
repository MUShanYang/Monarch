import { z } from "zod";
import { LexicalMonitor, AI_TELL_WORDS } from "./audit/lexical-monitor.js";
import { RhythmGuard, KINETIC_SCAFFOLDS } from "./beat/rhythm-guard.js";
import { CascadeAuditor } from "./audit/cascade-auditor.js";
import { DnaCompressor, createLexicalState } from "./context/dna-compressor.js";
import { getApiConstraintsForBeat } from "./llm/api-constraints.js";
import type { BeatType, NarrativeDNA } from "./beat/beat-types.js";

const LMSTUDIO_URL = "http://127.0.0.1:1234/v1";

interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
      reasoning_content?: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function callLocalLLM(params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
  stopSequences?: string[];
}): Promise<LLMResponse> {
  const response = await fetch(`${LMSTUDIO_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "local-model",
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0.7,
      stop: params.stopSequences,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM request failed: ${response.status} - ${errorBody}`);
  }

  return response.json() as Promise<LLMResponse>;
}

async function testAdaptationLayer() {
  console.log("=== Small Model Adaptation Layer 测试 ===\n");

  // 1. 初始化词法监控器
  console.log("1. 初始化词法监控器...");
  const lexicalMonitor = new LexicalMonitor({
    windowSize: 5,
    overuseThreshold: 2,
    minWordLength: 5,
    banDuration: 10,
  });
  lexicalMonitor.addAiTellWords();
  const bannedWords = lexicalMonitor.getBannedWords();
  console.log(`   已加载 ${bannedWords.length} 个禁止词`);
  console.log(`   示例: ${bannedWords.slice(0, 5).join(", ")}...\n`);

  // 2. 初始化节奏守卫
  console.log("2. 初始化节奏守卫...");
  const rhythmGuard = new RhythmGuard({ maxRepeatTypes: 2 });
  const rhythmResult = rhythmGuard.guard("action");
  console.log(`   允许类型: ${rhythmResult.allowedTypes.join(", ")}`);
  console.log(`   Kinetic Scaffold: "${rhythmResult.kineticScaffold}"\n`);

  // 3. 构建 DNA
  console.log("3. 构建 Narrative DNA...");
  const dna: NarrativeDNA = {
    who: [
      {
        id: "lin-zhe",
        name: "林哲",
        spatialPosture: "standing",
        handState: "empty",
        heldItems: [],
        activeDebts: ["愤怒"],
      },
    ],
    where: "练武场，细雨蒙蒙",
    mustInclude: ["林哲的剑意"],
    mustNotInclude: bannedWords.slice(0, 10),
    lastBeatSummary: "林哲刚刚完成了晨练",
    hookContext: [],
    spatialConstraints: [],
  };
  console.log(`   角色: ${dna.who.map((c: { name: string }) => c.name).join(", ")}`);
  console.log(`   地点: ${dna.where}`);
  console.log(`   必须包含: ${dna.mustInclude.join(", ")}`);
  console.log(`   禁止词: ${dna.mustNotInclude.length} 个\n`);

  // 4. 获取 API 约束
  console.log("4. 获取 API 约束...");
  const apiConstraints = getApiConstraintsForBeat("action", [60, 120]);
  // 对于 4B reasoning 模型，需要更多 tokens
  const maxTokens = 500; // 增加 token 预算
  console.log(`   maxTokens: ${maxTokens}`);
  console.log(`   temperature: ${apiConstraints.temperature}`);
  console.log(`   stopSequences: ${apiConstraints.stopSequences.slice(0, 3).join(", ")}...\n`);

  // 5. 构建提示词
  console.log("5. 构建提示词...");
  const systemPrompt = `你是一个专业的小说写作助手。你的任务是根据给定的上下文写一段简短的动作场景（60-120字）。

规则：
- 使用第三人称，过去时
- 不要使用禁止词
- 必须包含指定的元素
- 开头使用给定的起始短语`;

  const userPrompt = `起始短语: "${rhythmResult.kineticScaffold}"

角色: ${dna.who.map((c: { name: string; activeDebts: string[] }) => `${c.name}（${c.activeDebts.join(", ")}）`).join(", ")}
地点: ${dna.where}
必须包含: ${dna.mustInclude.join("; ")}
禁止使用: ${dna.mustNotInclude.slice(0, 5).join(", ")}

请写一段动作场景。`;

  console.log(`   System Prompt: ${systemPrompt.substring(0, 50)}...`);
  console.log(`   User Prompt: ${userPrompt.substring(0, 100)}...\n`);

  // 6. 调用本地 LLM
  console.log("6. 调用本地 LLM (gemma-4-e4b)...");
  const startTime = Date.now();
  const llmResponse = await callLocalLLM({
    systemPrompt,
    userPrompt,
    maxTokens,
    temperature: apiConstraints.temperature,
    stopSequences: apiConstraints.stopSequences,
  });
  const elapsed = Date.now() - startTime;

  // 调试：打印完整响应结构
  console.log(`   完整响应: ${JSON.stringify(llmResponse.choices[0]?.message, null, 2)}`);

  const generatedText = llmResponse.choices[0]?.message?.content 
    || llmResponse.choices[0]?.message?.reasoning_content 
    || "";
  console.log(`   响应时间: ${elapsed}ms`);
  console.log(`   Token 使用: ${llmResponse.usage.total_tokens} (prompt: ${llmResponse.usage.prompt_tokens}, completion: ${llmResponse.usage.completion_tokens})`);
  console.log(`   生成文本:\n   "${generatedText}"\n`);

  // 7. 级联审计
  console.log("7. 级联审计...");
  const cascadeAuditor = new CascadeAuditor({
    minWordCount: 30,
    maxWordCount: 200,
    strictProperNoun: false,
    requiredPov: "third",
    requiredTense: "past",
    forbiddenWords: bannedWords.slice(0, 10),
  });

  const auditResult = cascadeAuditor.audit(generatedText, dna);
  console.log(`   通过: ${auditResult.passed}`);
  console.log(`   分数: ${auditResult.score}/100`);
  console.log(`   层级结果:`);
  for (const [layer, passed] of Object.entries(auditResult.layerResults)) {
    console.log(`     - ${layer}: ${passed ? "✓" : "✗"}`);
  }
  if (auditResult.issues.length > 0) {
    console.log(`   问题:`);
    for (const issue of auditResult.issues.slice(0, 5)) {
      console.log(`     - [${issue.severity}] ${issue.message}`);
    }
  }
  console.log();

  // 8. 词法分析
  console.log("8. 词法分析...");
  const lexicalResult = lexicalMonitor.analyzeBeat(generatedText);
  console.log(`   新禁止词: ${lexicalResult.newlyBanned.length > 0 ? lexicalResult.newlyBanned.join(", ") : "无"}`);
  console.log(`   过度使用词: ${lexicalResult.overusedWords.length > 0 ? lexicalResult.overusedWords.join(", ") : "无"}\n`);

  // 9. 总结
  console.log("=== 测试总结 ===");
  console.log(`✓ 词法监控器: 已加载 ${bannedWords.length} 个禁止词`);
  console.log(`✓ 节奏守卫: 已分配 Kinetic Scaffold`);
  console.log(`✓ DNA 压缩器: 已构建上下文`);
  console.log(`✓ 本地 LLM: ${elapsed}ms, ${llmResponse.usage.total_tokens} tokens`);
  console.log(`${auditResult.passed ? "✓" : "✗"} 级联审计: 分数 ${auditResult.score}/100`);
  console.log(`${lexicalResult.newlyBanned.length === 0 ? "✓" : "✗"} 词法分析: ${lexicalResult.newlyBanned.length} 个新禁止词`);
}

testAdaptationLayer().catch(console.error);
