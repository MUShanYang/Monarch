import { mkdir, writeFile, readFile, access } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

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
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM request failed: ${response.status} - ${errorBody}`);
  }

  return response.json() as Promise<LLMResponse>;
}

async function checkModelLoaded(): Promise<string | null> {
  try {
    const response = await fetch(`${LMSTUDIO_URL}/models`);
    const data = await response.json() as { data: Array<{ id: string }> };
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== InkOS 本地模型小说编写测试 ===\n");

  const modelId = await checkModelLoaded();
  if (!modelId) {
    console.error("错误：LM Studio 没有加载模型！");
    console.error("请在 LM Studio 中加载一个模型后再运行此脚本。");
    process.exit(1);
  }
  console.log(`检测到模型: ${modelId}\n`);

  const testDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "test-novel-output");
  
  console.log("1. 创建测试项目目录...");
  await mkdir(join(testDir, "chapters"), { recursive: true });
  console.log(`   目录: ${testDir}\n`);

  console.log("2. 创建项目配置...");
  const bookConfig = {
    title: "剑影江湖",
    genre: "武侠",
    author: "InkOS Test",
    targetWordsPerChapter: 1500,
    totalChapters: 3,
    premise: "少年林哲在江湖中寻找杀父仇人，却发现真相远比想象复杂。",
    style: {
      tone: "严肃",
      pov: "第三人称",
      tense: "过去时",
    },
    characters: [
      {
        id: "lin-zhe",
        name: "林哲",
        role: "protagonist",
        description: "二十岁，剑法天赋异禀，性格沉稳内敛",
        motivation: "寻找杀父仇人",
      },
      {
        id: "su-yun",
        name: "苏云",
        role: "supporting",
        description: "十八岁，医术精湛，性格活泼",
        motivation: "跟随林哲，保护他",
      },
      {
        id: "chen-mo",
        name: "陈默",
        role: "antagonist",
        description: "四十岁，神秘组织首领，城府极深",
        motivation: "阻止林哲追查真相",
      },
    ],
    locations: [
      { id: "training-ground", name: "练武场", description: "林家后山的练武场，细雨蒙蒙" },
      { id: "tea-house", name: "茶楼", description: "镇上的老茶楼，消息灵通之地" },
      { id: "secret-cave", name: "密洞", description: "藏有秘密的地下洞穴" },
    ],
  };
  await writeFile(join(testDir, "book.json"), JSON.stringify(bookConfig, null, 2));
  console.log(`   书名: ${bookConfig.title}`);
  console.log(`   类型: ${bookConfig.genre}`);
  console.log(`   主角: ${bookConfig.characters[0]?.name}\n`);

  console.log("3. 生成第一章大纲...");
  const outlinePrompt = `你是一个专业的小说大纲编写助手。请为第一章生成一个简短的大纲。

书名: ${bookConfig.title}
类型: ${bookConfig.genre}
前提: ${bookConfig.premise}

第一章要求:
- 标题: 开端
- 主要内容: 介绍主角林哲，展示他的日常和内心冲突
- 字数目标: 约1500字
- 结尾: 留下悬念

请用中文输出一个简短的大纲（100字以内），包含3-5个关键情节点。`;

  const outlineResponse = await callLocalLLM({
    systemPrompt: "你是一个专业的小说大纲编写助手。输出要简洁，直接给出大纲内容。",
    userPrompt: outlinePrompt,
    maxTokens: 300,
    temperature: 0.8,
  });
  const outline = outlineResponse.choices[0]?.message?.content || "";
  console.log(`   大纲: ${outline.substring(0, 100)}...\n`);
  console.log(`   Token 使用: ${outlineResponse.usage.total_tokens}\n`);

  console.log("4. 生成第一章内容...");
  const chapterPrompt = `你是一个专业的武侠小说作家。请根据以下信息写出第一章的正文。

书名: ${bookConfig.title}
类型: ${bookConfig.genre}

第一章大纲:
${outline}

主角: 林哲，二十岁，剑法天赋异禀，性格沉稳内敛，寻找杀父仇人。
地点: 练武场，细雨蒙蒙

写作要求:
- 使用第三人称，过去时
- 字数约1500字
- 开头要有画面感
- 展示而非讲述（show, don't tell）
- 结尾留下悬念
- 不要使用"他感到"、"他心想"、"仿佛"等露骨表达

请直接输出正文内容，不要有任何前言或解释。`;

  const startTime = Date.now();
  const chapterResponse = await callLocalLLM({
    systemPrompt: "你是一个专业的武侠小说作家。直接输出正文，不要有任何前言或解释。",
    userPrompt: chapterPrompt,
    maxTokens: 2000,
    temperature: 0.8,
  });
  const elapsed = Date.now() - startTime;
  
  let chapterContent = chapterResponse.choices[0]?.message?.content || "";
  
  if (chapterResponse.choices[0]?.message?.reasoning_content) {
    console.log(`   检测到 reasoning 内容，提取实际文本...`);
    const reasoning = chapterResponse.choices[0].message.reasoning_content;
    console.log(`   Reasoning 长度: ${reasoning.length} 字符`);
  }
  
  console.log(`   响应时间: ${elapsed}ms`);
  console.log(`   Token 使用: ${chapterResponse.usage.total_tokens} (prompt: ${chapterResponse.usage.prompt_tokens}, completion: ${chapterResponse.usage.completion_tokens})`);
  console.log(`   生成内容长度: ${chapterContent.length} 字符\n`);

  if (chapterContent.length < 100) {
    console.error("警告：生成内容过短，可能是模型问题或 token 限制");
    console.log(`   实际内容: "${chapterContent}"\n`);
  }

  console.log("5. 保存章节...");
  const chapterPath = join(testDir, "chapters", "chapter-0001.md");
  const chapterWithHeader = `# 第一章：开端\n\n${chapterContent}`;
  await writeFile(chapterPath, chapterWithHeader);
  console.log(`   已保存: ${chapterPath}\n`);

  console.log("6. 生成第二章大纲...");
  const outline2Prompt = `你是一个专业的小说大纲编写助手。请为第二章生成一个简短的大纲。

书名: ${bookConfig.title}
类型: ${bookConfig.genre}
第一章概要: ${outline.substring(0, 50)}...

第二章要求:
- 标题: 线索
- 主要内容: 林哲得到一条关于父亲死因的线索
- 字数目标: 约1500字
- 引入新角色: 苏云

请用中文输出一个简短的大纲（100字以内）。`;

  const outline2Response = await callLocalLLM({
    systemPrompt: "你是一个专业的小说大纲编写助手。输出要简洁。",
    userPrompt: outline2Prompt,
    maxTokens: 200,
    temperature: 0.8,
  });
  const outline2 = outline2Response.choices[0]?.message?.content || "";
  console.log(`   大纲: ${outline2.substring(0, 100)}...\n`);

  console.log("7. 生成第二章内容...");
  const chapter2Prompt = `你是一个专业的武侠小说作家。请根据以下信息写出第二章的正文。

书名: ${bookConfig.title}
类型: ${bookConfig.genre}

第二章大纲:
${outline2}

新角色: 苏云，十八岁，医术精湛，性格活泼
地点: 茶楼，消息灵通之地

写作要求:
- 使用第三人称，过去时
- 字数约1500字
- 通过对话展示人物性格
- 结尾要有转折

请直接输出正文内容。`;

  const chapter2Response = await callLocalLLM({
    systemPrompt: "你是一个专业的武侠小说作家。直接输出正文。",
    userPrompt: chapter2Prompt,
    maxTokens: 2000,
    temperature: 0.8,
  });
  const chapter2Content = chapter2Response.choices[0]?.message?.content || "";
  console.log(`   Token 使用: ${chapter2Response.usage.total_tokens}`);
  console.log(`   生成内容长度: ${chapter2Content.length} 字符\n`);

  const chapter2Path = join(testDir, "chapters", "chapter-0002.md");
  const chapter2WithHeader = `# 第二章：线索\n\n${chapter2Content}`;
  await writeFile(chapter2Path, chapter2WithHeader);
  console.log(`   已保存: ${chapter2Path}\n`);

  console.log("=== 测试完成 ===");
  console.log(`输出目录: ${testDir}`);
  console.log(`第一章: ${chapterPath}`);
  console.log(`第二章: ${chapter2Path}`);
  console.log("\n请查看生成的章节文件。");
}

main().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
