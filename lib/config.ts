// 服务端配置：只读 env，不暴露到前端（非 NEXT_PUBLIC）。
export const config = {
  // 图像（OpenAI 兼容 Images API，复用 WHEEL 的 gpt-image-2 网关）
  imageApiKey: process.env.IMAGE_API_KEY || "",
  imageBaseUrl: (process.env.IMAGE_BASE_URL || "https://api.openai.com").replace(/\/+$/, ""),
  imageModel: process.env.IMAGE_MODEL || "gpt-image-2",
  imageSize: process.env.IMAGE_SIZE || "1024x1024",

  // LLM（Claude，用于：上传图→提取画风、描述→N 个发散子描述）
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, ""),
  llmModel: process.env.LLM_MODEL || "claude-sonnet-4-6",

  // 3D（Tripo，image→model；待用户提供 key，缺则留桩）
  tripoApiKey: process.env.TRIPO_API_KEY || "",
  tripoBaseUrl: (process.env.TRIPO_BASE_URL || "https://api.tripo3d.ai").replace(/\/+$/, ""),

  // MOCK=1：不联网，返回占位（离线跑通 UI）
  mock: process.env.MOCK === "1",
};

export function imageApiBase(): string {
  return config.imageBaseUrl.replace(/\/v1$/, "");
}
