import { NextRequest, NextResponse } from "next/server";
import { extractStyle } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

// 上传若干参考图 → 提取一段可复用画风提示词
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: "未上传图片" }, { status: 400 });

    const images = await Promise.all(
      files.slice(0, 6).map(async (f) => ({
        b64: Buffer.from(await f.arrayBuffer()).toString("base64"),
        mime: f.type || "image/png",
      }))
    );
    const stylePrompt = await extractStyle(images);
    return NextResponse.json({ stylePrompt });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
