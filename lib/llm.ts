import { config } from "./config";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

async function callClaude(content: ContentBlock[], maxTokens = 2048): Promise<string> {
  const res = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.llmModel,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const j = await res.json();
  return (j.content || []).map((b: any) => b.text || "").join("").trim();
}

// 上传参考图 → 提取一段可复用的英文画风提示词
export async function extractStyle(images: { b64: string; mime: string }[]): Promise<string> {
  if (config.mock) return "flat 2D vector cartoon isometric game illustration, clean crisp edges, flat matte color fills, bright cheerful palette (MOCK)";
  const content: ContentBlock[] = images.slice(0, 6).map((im) => ({
    type: "image",
    source: { type: "base64", media_type: im.mime, data: im.b64 },
  }));
  content.push({
    type: "text",
    text:
      "你是资深美术总监。看这些参考图，写一段【英文】可复用的画风提示词（30-70词），" +
      "抓住：渲染方式(扁平/渲染)、描边、上色/阴影、配色、细节密度、视角/构图。" +
      "只描述【画风】，不描述具体内容。只输出这段提示词本身，不要任何前后缀。",
  });
  return callClaude(content, 512);
}

// 描述 + 锁定画风 → N 个发散子描述（只写"画什么"，不写画风）
export async function expandDescriptions(
  description: string,
  style: string,
  count: number
): Promise<string[]> {
  const n = Math.max(1, Math.min(12, count));
  if (config.mock) return Array.from({ length: n }, (_, i) => `${description} — variant ${i + 1} (MOCK)`);
  const raw = await callClaude(
    [
      {
        type: "text",
        text:
          `基于下面的【基础描述】，生成 ${n} 个互不相同、发散的变体描述（换构图/元素/子主题/配色侧重），` +
          `每个都是自包含的英文图像内容描述，只写【画什么】，不要写画风词（画风统一由系统另行锁定）。\n\n` +
          `【基础描述】${description}\n【已锁画风(仅供你把握调性，勿复述)】${style}\n\n` +
          `只输出一个 JSON 数组，${n} 个字符串，不要任何其它文字。`,
      },
    ],
    3000
  );
  try {
    const s = raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1);
    const arr = JSON.parse(s);
    if (Array.isArray(arr) && arr.length) return arr.slice(0, n).map(String);
  } catch {
    /* 落到兜底 */
  }
  // 兜底：解析失败就用基础描述复制 n 份
  return Array.from({ length: n }, () => description);
}
