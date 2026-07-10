import { NextRequest, NextResponse } from "next/server";
import { listFolders, listImages, getFolderMeta, deleteImage, deleteFolder } from "@/lib/gallery";

export const runtime = "nodejs";

// GET → 文件夹列表；GET ?f=<id> → 该文件夹图片列表
export async function GET(req: NextRequest) {
  const f = req.nextUrl.searchParams.get("f");
  if (!f) return NextResponse.json({ folders: listFolders() });
  const meta = getFolderMeta(f);
  if (!meta) return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
  return NextResponse.json({ meta, images: listImages(f) });
}

// POST {f, file?} → 删除单图（带 file）或整个文件夹（不带 file）
export async function POST(req: NextRequest) {
  const { f, file, action } = await req.json();
  if (action !== "delete" || !f) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const ok = file ? deleteImage(f, file) : deleteFolder(f);
  return NextResponse.json({ ok });
}
