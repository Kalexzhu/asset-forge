import { NextRequest, NextResponse } from "next/server";
import { expandDescriptions } from "@/lib/llm";
import { generateImage, RefImage } from "@/lib/image";
import { Job, newJobId, saveJob, getJob } from "@/lib/jobs";
import { saveImageToGallery } from "@/lib/gallery";

export const runtime = "nodejs";
export const maxDuration = 300;

// 生成结果统一转成 base64 再落画廊（generateImage 可能返回 data URL 或远程 url）
async function toB64(image: string): Promise<string> {
  if (image.startsWith("data:")) return image.split(",", 2)[1];
  const res = await fetch(image);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

// 后台执行：逐张完成→存进共享画廊(按 画风+参考图 归档)→任务里只存 URL。
// 刷新/重连不丢；pm2 重启后历史仍在。
async function runJob(job: Job, ref?: RefImage) {
  try {
    const subs = await expandDescriptions(job.description, job.style, job.count);
    job.results = subs.map((p) => ({ prompt: p, done: false }));
    saveJob(job);

    await Promise.all(
      subs.map(async (sub, i) => {
        const fullPrompt = [job.style, sub].filter(Boolean).join("\n");
        try {
          const image = await generateImage(fullPrompt, { ref: job.useRef ? ref : undefined });
          const saved = saveImageToGallery(job.style, job.useRef ? ref?.b64 : undefined, await toB64(image));
          job.results[i] = { prompt: sub, image: saved.url, ok: true, done: true };
        } catch (e) {
          job.results[i] = { prompt: sub, error: String(e).slice(0, 160), ok: false, done: true };
        }
        saveJob(job); // 每张完成即持久化
      })
    );
  } catch (e) {
    job.results = job.results.length
      ? job.results
      : [{ prompt: job.description, error: String(e).slice(0, 200), ok: false, done: true }];
  }
  job.status = "done";
  saveJob(job);
}

// POST：创建任务，立刻返回 jobId（不等出图）
export async function POST(req: NextRequest) {
  try {
    const { description, style, count, refB64, refMime } = await req.json();
    if (!description?.trim()) return NextResponse.json({ error: "描述不能为空" }, { status: 400 });
    const n = Math.max(1, Math.min(12, Number(count) || 4));
    const ref: RefImage | undefined = refB64 ? { b64: refB64, mime: refMime || "image/png" } : undefined;

    const job: Job = {
      id: newJobId(),
      createdAt: Date.now(),
      description: description.trim(),
      style: (style || "").trim(),
      count: n,
      useRef: !!ref,
      status: "running",
      results: [],
    };
    saveJob(job);
    void runJob(job, ref); // 后台跑，不 await
    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}

// GET ?id=xxx：查任务状态/结果（前端轮询用）
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json(job);
}
