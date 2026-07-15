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
  if (config.mock) return "扁平二维矢量卡通等距游戏插画，纯平涂哑光色块，边缘干净利落，明快配色（MOCK）";
  const content: ContentBlock[] = images.slice(0, 6).map((im) => ({
    type: "image",
    source: { type: "base64", media_type: im.mime, data: im.b64 },
  }));
  content.push({
    type: "text",
    text:
      "你是资深美术总监，为 AI 图像模型（偏爱光泽渲染与堆细节，需用强正面词压制）提炼可复用画风提示词。\n" +
      "看参考图，输出一段【中文】画风提示词，要求【宏观、简洁、精确】，总长 40-70 字。逐项覆盖以下轴，但每轴只许一个宏观短语：\n" +
      "①渲染方式（纯平涂哑光/赛璐璐硬边阴影/手绘肌理/光泽3D渲染，判定后用力写死）\n" +
      "②光照（平光高明度/戏剧光影）\n" +
      "③描边（有无、粗细）\n" +
      "④配色（3-5个具体色名+饱和度明度）\n" +
      "⑤细节密度（只许宏观词：简洁敦实低细节/中等/繁复精雕）\n" +
      "⑥视角（等距/平视/俯视）\n" +
      "⑦背景（纯色？什么色？）\n" +
      "【硬性禁令】提示词里不得出现图中任何具体元素、物件、结构、装饰的名词（如建筑、轨道、植物、图案位置等）——那是内容不是画风，写了会导致生成时堆元素。\n" +
      "只用正面描述词（禁止\"无/不要/避免\"这类否定式）。\n" +
      "范例（别的画风，学写法密度勿抄内容）：「扁平二维矢量卡通等距手游插画，纯平涂哑光色块，硬边双调赛璐璐阴影，高明度平光，细而干净的描边，明快轻盈配色（青绿、薄荷、珊瑚粉、暖黄），简洁敦实低细节，纯浅暖杏色背景」\n" +
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
  if (config.mock) return Array.from({ length: n }, (_, i) => `${description} — 变体 ${i + 1}（MOCK）`);
  const raw = await callClaude(
    [
      {
        type: "text",
        text:
          `基于下面的【基础描述】，生成 ${n} 个互不相同、发散的变体描述（换造型/元素/子主题/配色侧重），` +
          `每个都是自包含的【中文】图像内容描述，只写【画什么】，不要写画风词（画风统一由系统另行锁定）。` +
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
