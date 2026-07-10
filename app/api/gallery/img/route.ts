import { NextRequest } from "next/server";
import fs from "fs";
import { imagePath } from "@/lib/gallery";

export const runtime = "nodejs";

// 出图文件（画廊与任务结果共用此地址）
export async function GET(req: NextRequest) {
  const f = req.nextUrl.searchParams.get("f") || "";
  const file = req.nextUrl.searchParams.get("file") || "";
  const p = imagePath(f, file);
  if (!p) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(p)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
