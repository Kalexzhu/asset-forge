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
      "你是资深美术总监，为 AI 图像模型（偏爱光泽渲染与堆细节，需用强正面词压制）提炼可复用画风提示词。\n" +
      "看参考图，输出一段【英文】画风提示词（50-90词），必须逐项覆盖以下轴，每轴用强而具体的正面词：\n" +
      "①渲染方式：明确判定是 flat matte 平涂 / cel-shading(平涂+硬边two-tone阴影) / painterly / glossy 3D render，选中的要用力写死（如 solid flat matte color fills, clean two-tone cel shading）\n" +
      "②光照：平光高明度(even flat bright high-key) 还是 戏剧光，写明\n" +
      "③描边：有无、粗细、性质（crisp clean outlines / sketchy / none）\n" +
      "④配色：具体色名 + 饱和度与明度（如 bright light airy palette: teal, mint, coral, warm yellow）\n" +
      "⑤细节密度与造型：simple chunky low-detail 还是 ornate intricate，留白程度\n" +
      "⑥视角构图：isometric/平视/俯视等\n" +
      "⑦背景：纯色？什么色？（如 solid flat light warm apricot background）\n" +
      "规则：只用正面描述词（禁止 no/not/avoid 这类否定式）；只描述画风，不描述图中具体内容。\n" +
      "输出格式与颗粒度参考这个范例（这是别的画风，勿照抄内容，学它的写法密度）：\n" +
      "\"flat 2D vector cartoon isometric casual mobile game illustration, solid flat matte color fills, simple clean two-tone cel shading, even flat bright high-key lighting, bright light airy cheerful palette (teal, mint green, coral pink, warm yellow), simple chunky low-detail stylized shapes with clean crisp edges, thin clean outlines, solid flat light warm apricot background, tidy geometric readable composition\"\n" +
      "只输出提示词本身，不要任何前后缀。",
  });
  return callClaude(content, 1024);
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
          `基于下面的【基础描述】，生成 ${n} 个互不相同、发散的变体描述（换造型/元素/子主题/配色侧重），` +
          `每个都是自包含的英文图像内容描述，只写【画什么】，不要写画风词（画风统一由系统另行锁定）。` +
          `每个变体必须是【一个可单独建模的单体物件/资产】（如一栋建筑、一件道具、一个装置），` +
          `不要整片场景/城镇/多物体组合（产出将用作 3D 建模的多视图原画）。\n\n` +
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
