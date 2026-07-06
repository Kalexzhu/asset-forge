import { NextRequest, NextResponse } from "next/server";
import { imageTo3D } from "@/lib/tripo";

export const runtime = "nodejs";
export const maxDuration = 600;

// 一张图（data URL 或 base64）→ Tripo 3D 模型
export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: "缺少图片" }, { status: 400 });
    const b64 = String(image).replace(/^data:[^;]+;base64,/, "");
    const result = await imageTo3D(b64);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
