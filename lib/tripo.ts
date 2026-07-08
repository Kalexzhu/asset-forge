import { config } from "./config";

// Tripo image→3D。已按官方 API 实测校准（2026-07）：
//   upload → data.image_token → task{type:image_to_model, file:{type,file_token}} → 轮询 → output.pbr_model/model
// 注意：Tripo 业务错误是 HTTP 200 + body.code!=0（如点数不足 code 2010），必须查 code。
export type TripoResult =
  | { status: "not_configured"; message: string }
  | { status: "mock"; modelUrl: string }
  | { status: "done"; modelUrl: string; taskId: string }
  | { status: "error"; message: string };

// 返回 body.data；code!=0 直接抛出清晰错误（message + suggestion）
async function tripoFetch(path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${config.tripoBaseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.tripoApiKey}`, ...(init.headers || {}) },
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Tripo ${res.status} ${text.slice(0, 160)}`);
  }
  if (json.code !== undefined && json.code !== 0) {
    throw new Error(`${json.message || "Tripo 错误"}${json.suggestion ? "（" + json.suggestion + "）" : ""}`);
  }
  return json.data;
}

export async function imageTo3D(imageB64: string, mime = "image/png"): Promise<TripoResult> {
  if (config.mock) return { status: "mock", modelUrl: "" };
  if (!config.tripoApiKey) {
    return { status: "not_configured", message: "未配置 TRIPO_API_KEY，转3D暂不可用（填入 .env.local 即通）" };
  }
  try {
    // 1) 上传拿 image_token
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(imageB64, "base64")], { type: mime }), "asset.png");
    const up = await tripoFetch("/v2/openapi/upload", { method: "POST", body: form });
    const fileToken = up?.image_token || up?.token;
    if (!fileToken) return { status: "error", message: "Tripo 上传无 image_token" };

    // 2) 建 image_to_model 任务（可选 model_version）
    const body: any = { type: "image_to_model", file: { type: "png", file_token: fileToken } };
    if (config.tripoModelVersion) body.model_version = config.tripoModelVersion;
    const task = await tripoFetch("/v2/openapi/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const taskId = task?.task_id;
    if (!taskId) return { status: "error", message: "Tripo 未返回 task_id" };

    // 3) 轮询直到 success（image→model 约 1-3 分钟）
    for (let i = 0; i < 120; i++) {
      const st = await tripoFetch(`/v2/openapi/task/${taskId}`, { method: "GET" });
      const status = st?.status;
      if (status === "success") {
        const modelUrl = st?.output?.pbr_model || st?.output?.model || "";
        return { status: "done", modelUrl, taskId };
      }
      if (status && !["queued", "running", "pending"].includes(status)) {
        return { status: "error", message: `Tripo 任务 ${status}` };
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    return { status: "error", message: "Tripo 任务超时" };
  } catch (e) {
    return { status: "error", message: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
}
