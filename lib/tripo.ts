import { config } from "./config";

// Tripo image→3D。用户给 key 后即通；缺 key 时返回 not_configured（不报错，UI 友好提示）。
// 参考 Tripo openapi：upload → create task(image_to_model) → poll task → output.model(glb)
export type TripoResult =
  | { status: "not_configured"; message: string }
  | { status: "mock"; modelUrl: string }
  | { status: "done"; modelUrl: string; taskId: string }
  | { status: "error"; message: string };

async function tripoFetch(path: string, init: RequestInit) {
  const res = await fetch(`${config.tripoBaseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.tripoApiKey}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Tripo ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
  return res.json();
}

export async function imageTo3D(imageB64: string, mime = "image/png"): Promise<TripoResult> {
  if (config.mock) return { status: "mock", modelUrl: "" };
  if (!config.tripoApiKey) {
    return { status: "not_configured", message: "未配置 TRIPO_API_KEY，转3D暂不可用（填入 .env.local 即通）" };
  }
  try {
    // 1) 上传图片拿 file_token
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(imageB64, "base64")], { type: mime }), "asset.png");
    const up = await tripoFetch("/v2/openapi/upload", { method: "POST", body: form });
    const fileToken = up?.data?.image_token || up?.data?.token;

    // 2) 建 image_to_model 任务
    const task = await tripoFetch("/v2/openapi/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "image_to_model", file: { type: "png", file_token: fileToken } }),
    });
    const taskId = task?.data?.task_id;

    // 3) 轮询直到完成
    for (let i = 0; i < 120; i++) {
      const st = await tripoFetch(`/v2/openapi/task/${taskId}`, { method: "GET" });
      const status = st?.data?.status;
      if (status === "success") {
        const modelUrl = st?.data?.output?.pbr_model || st?.data?.output?.model || "";
        return { status: "done", modelUrl, taskId };
      }
      if (status === "failed" || status === "cancelled" || status === "unknown") {
        return { status: "error", message: `Tripo 任务 ${status}` };
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    return { status: "error", message: "Tripo 任务超时" };
  } catch (e) {
    return { status: "error", message: String(e).slice(0, 200) };
  }
}
