import crypto from "crypto";
import fs from "fs";
import path from "path";

// 共享画廊：所有用户共用。单主题 = 相同【参考图 + 画风提示词】归入同一文件夹
// （同画风+同参考图下，描述怎么变、点多少次生成，产出都进同一个文件夹）。
// 磁盘结构：data/gallery/<folderId>/meta.json + <时间戳>_<n>.png

const GALLERY_DIR = path.join(process.cwd(), "data", "gallery");

export type FolderMeta = {
  id: string;
  title: string; // 主题名 = 画风提示词摘要（可含参考图标记）
  style: string;
  hasRef: boolean;
  createdAt: number;
  updatedAt: number;
};

function folderDir(id: string) {
  return path.join(GALLERY_DIR, id);
}

// 单主题键 = 画风提示词 + 参考图内容哈希（无参考图则仅画风）
export function folderIdFor(style: string, refB64?: string): string {
  const refHash = refB64 ? crypto.createHash("sha1").update(refB64).digest("hex") : "noref";
  return crypto.createHash("sha1").update(`${style}\n${refHash}`).digest("hex").slice(0, 12);
}

export function saveImageToGallery(
  style: string,
  refB64: string | undefined,
  pngB64: string
): { folderId: string; file: string; url: string } {
  const id = folderIdFor(style, refB64);
  const dir = folderDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const metaPath = path.join(dir, "meta.json");
  const now = Date.now();
  let meta: FolderMeta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    meta.updatedAt = now;
  } catch {
    const title = (style || "未命名主题").slice(0, 60) + (refB64 ? "〔带参考图〕" : "");
    meta = { id, title, style, hasRef: !!refB64, createdAt: now, updatedAt: now };
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta));

  const file = `${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}.png`;
  fs.writeFileSync(path.join(dir, file), Buffer.from(pngB64, "base64"));
  return { folderId: id, file, url: `/api/gallery/img?f=${id}&file=${file}` };
}

export function listFolders(): (FolderMeta & { imageCount: number; cover: string | null })[] {
  try {
    fs.mkdirSync(GALLERY_DIR, { recursive: true });
    return fs
      .readdirSync(GALLERY_DIR)
      .filter((d) => fs.existsSync(path.join(GALLERY_DIR, d, "meta.json")))
      .map((d) => {
        const meta = JSON.parse(fs.readFileSync(path.join(GALLERY_DIR, d, "meta.json"), "utf-8")) as FolderMeta;
        const imgs = listImages(d);
        return { ...meta, imageCount: imgs.length, cover: imgs[0]?.url || null };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function listImages(folderId: string): { file: string; url: string; mtime: number }[] {
  try {
    const dir = folderDir(folderId);
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .map((f) => ({
        file: f,
        url: `/api/gallery/img?f=${folderId}&file=${f}`,
        mtime: fs.statSync(path.join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

// 安全取文件路径（防目录穿越）
export function imagePath(folderId: string, file: string): string | null {
  if (!/^[a-z0-9]+$/i.test(folderId) || !/^[a-z0-9_]+\.png$/i.test(file)) return null;
  const p = path.join(folderDir(folderId), file);
  return fs.existsSync(p) ? p : null;
}

export function deleteImage(folderId: string, file: string): boolean {
  const p = imagePath(folderId, file);
  if (!p) return false;
  fs.unlinkSync(p);
  return true;
}

export function deleteFolder(folderId: string): boolean {
  if (!/^[a-z0-9]+$/i.test(folderId)) return false;
  const dir = folderDir(folderId);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function getFolderMeta(folderId: string): FolderMeta | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(folderDir(folderId), "meta.json"), "utf-8"));
  } catch {
    return null;
  }
}
