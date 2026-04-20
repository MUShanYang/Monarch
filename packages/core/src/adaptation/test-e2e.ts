import { mkdir, writeFile, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const LMSTUDIO_URL = "http://127.0.0.1:1234/v1";

interface LLMResponse {
  choices: Array<{
    message: { content: string; reasoning_content?: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function callLLM(params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
}): Promise<LLMResponse> {
  const response = await fetch(`${LMSTUDIO_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemma-4-e4b",
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM failed: ${response.status} - ${errorBody}`);
  }

  return response.json() as Promise<LLMResponse>;
}

async function main() {
  console.log("=== Monarch Adaptation Layer 端到端测试 ===\n");

  const testDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "test-adaptation-e2e");
  const chaptersDir = join(testDir, "chapters");
  await mkdir(chaptersDir, { recursive: true });

  console.log("1. 创建测试项目...");
  const bookConfig = {
    title: "雨中剑",
    genre: "xianxia",
    author: "Monarch Test",
    language: "zh",
    chapterWordCount: 800,
  };
  await writeFile(join(testDir, "inkos.json"), JSON.stringify(bookConfig, null, 2));
  console.log(`   书名: ${bookConfig.title}`);
  console.log(`   类型: ${bookConfig.genre}`);
  console.log(`   目标字数: ${bookConfig.chapterWordCount} 字/章\n`);

  console.log("2. 模拟 Adaptation Layer 节拍生成流程...");

  const beats = [
    { type: "environment", tension: 3, prompt: "细雨蒙蒙的练武场，青石板湿滑，远处竹林若隐若现。" },
    { type: "action", tension: 6, prompt: "林哲正在练剑，剑光如虹，雨水被剑气劈开。" },
    { type: "interiority", tension: 5, prompt: "他想起父亲临终前的嘱托，眼神坚定。" },
    { type: "dialogue", tension: 7, prompt: "苏云突然出现，带来了一条关于仇人的线索。" },
    { type: "tension", tension: 8, prompt: "线索指向一个危险的地方，两人产生分歧。" },
  ];

  let chapterContent = "# 第一章：雨中剑\n\n";
  let lastBeatSummary = "";

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i]!;
    console.log(`\n--- 节拍 ${i + 1}: ${beat.type} (张力: ${beat.tension}/10) ---`);

    const systemPrompt = `你是一个专业的武侠作家。使用第三人称，过去时。
直接输出正文，不要任何前言或解释。
节拍类型: ${beat.type}
张力等级: ${beat.tension}/10`;

    const userPrompt = `场景: ${beat.prompt}
${lastBeatSummary ? `上一节: ${lastBeatSummary}` : ""}
请写 100-150 字的段落。`;

    const startTime = Date.now();
    const response = await callLLM({
      systemPrompt,
      userPrompt,
      maxTokens: 800,
      temperature: 0.8,
    });

    const elapsed = Date.now() - startTime;
    const prose = response.choices[0]?.message?.content || "";
    
    if (response.choices[0]?.message?.reasoning_content) {
      console.log(`   Reasoning: ${response.choices[0].message.reasoning_content.length} 字符`);
    }

    console.log(`   用时: ${elapsed}ms`);
    console.log(`   Tokens: ${response.usage.total_tokens} (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens})`);
    console.log(`   生成: ${prose.substring(0, 100)}${prose.length > 100 ? "..." : ""}`);

    if (prose.length > 0) {
      chapterContent += prose + "\n\n";
      lastBeatSummary = prose.substring(0, 100);
    }
  }

  console.log("\n3. 保存章节...");
  const chapterPath = join(chaptersDir, "chapter-0001.md");
  await writeFile(chapterPath, chapterContent);
  console.log(`   已保存: ${chapterPath}`);
  console.log(`   总字数: ${chapterContent.length} 字符`);

  console.log("\n4. 生成第二章（带有母题回响）...");

  const beat2 = { type: "environment", tension: 4, prompt: "三天后，同样的雨，同样的练武场。林哲的剑上多了一道裂痕。" };

  const systemPrompt2 = `你是一个专业的武侠作家。
场景: ${beat2.prompt}
母题回响: 雨再次出现。上次雨与训练和决心联系在一起，这次应该呼应但不重复。
在角色的身体感受中加入一个短暂的干扰（指尖一顿、呼吸微滞），不解释原因。
直接输出正文。`;

  const response2 = await callLLM({
    systemPrompt: systemPrompt2,
    userPrompt: "写 100-150 字的段落。",
    maxTokens: 300,
    temperature: 0.8,
  });

  const prose2 = response2.choices[0]?.message?.content || "";
  console.log(`   Tokens: ${response2.usage.total_tokens}`);
  console.log(`   生成: ${prose2.substring(0, 100)}${prose2.length > 100 ? "..." : ""}`);

  const chapter2Path = join(chaptersDir, "chapter-0002.md");
  const chapter2Content = `# 第二章：裂痕\n\n${prose2}`;
  await writeFile(chapter2Path, chapter2Content);
  console.log(`   已保存: ${chapter2Path}`);

  console.log("\n=== 测试完成 ===");
  console.log(`输出目录: ${testDir}`);
  console.log(`第一章: ${chapterPath}`);
  console.log(`第二章: ${chapter2Path}`);
}

main().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
