import { config, imageApiBase } from "./config";

// 1x1 透明 PNG（MOCK 占位）
const MOCK_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export type RefImage = { b64: string; mime: string };

function pickImage(json: any): string {
  const item = json?.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url; // 交给前端直接展示/下载
  throw new Error("Images API 响应无 b64_json/url：" + JSON.stringify(json).slice(0, 200));
}

// 生成一张图，返回 data URL 或远程 url。带 504 自愈重试。
export async function generateImage(
  prompt: string,
  opts?: { size?: string; ref?: RefImage }
): Promise<string> {
  if (config.mock) return `data:image/png;base64,${MOCK_PNG}`;
  const base = imageApiBase();
  const size = opts?.size || config.imageSize;
  const headers = { Authorization: `Bearer ${config.imageApiKey}` };

  const genBody = () => ({ model: config.imageModel, prompt, size, n: 1 });

  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      let res: Response;
      if (opts?.ref) {
        // 参考图 → /v1/images/edits（multipart）
        const form = new FormData();
        form.append("model", config.imageModel);
        form.append("prompt", prompt);
        form.append("size", size);
        form.append("n", "1");
        const bytes = Buffer.from(opts.ref.b64, "base64");
        form.append("image[]", new Blob([bytes], { type: opts.ref.mime }), "ref.png");
        res = await fetch(`${base}/v1/images/edits`, { method: "POST", headers, body: form });
        if (!res.ok) {
          // edits 偶发 5xx → 降级纯文生图
          res = await fetch(`${base}/v1/images/generations`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(genBody()),
          });
        }
      } else {
        res = await fetch(`${base}/v1/images/generations`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(genBody()),
        });
      }
      if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 160));
      return pickImage(await res.json());
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error("图像生成失败（重试5次）：" + String(lastErr).slice(0, 160));
}
