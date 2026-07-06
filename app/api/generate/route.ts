import { NextRequest, NextResponse } from "next/server";
import { expandDescriptions } from "@/lib/llm";
import { generateImage } from "@/lib/image";

export const runtime = "nodejs";
export const maxDuration = 300;

// 描述 + 画风 + 数量 → LLM 扩 N 个发散子描述 → 各出一张
export async function POST(req: NextRequest) {
  try {
    const { description, style, count, size } = await req.json();
    if (!description?.trim()) return NextResponse.json({ error: "描述不能为空" }, { status: 400 });
    const n = Math.max(1, Math.min(12, Number(count) || 4));

    const subs = await expandDescriptions(description.trim(), (style || "").trim(), n);

    // 画风锁定：每条 = 画风提示词 + 子描述（画风在前）
    const results = await Promise.all(
      subs.map(async (sub) => {
        const fullPrompt = [style?.trim(), sub].filter(Boolean).join("\n");
        try {
          const image = await generateImage(fullPrompt, { size });
          return { prompt: sub, image, ok: true as const };
        } catch (e) {
          return { prompt: sub, error: String(e).slice(0, 160), ok: false as const };
        }
      })
    );
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
