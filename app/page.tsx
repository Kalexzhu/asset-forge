"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type JobResult = { prompt: string; image?: string; error?: string; ok?: boolean; done: boolean };
type Job = {
  id: string;
  createdAt: number;
  description: string;
  count: number;
  status: "running" | "done" | "interrupted";
  results: JobResult[];
};
type JobBrief = { id: string; createdAt: number; description: string; count: number; status: string; doneCount: number };
type Folder = { id: string; title: string; imageCount: number; cover: string | null; updatedAt: number };
type GImage = { file: string; url: string };

export default function Home() {
  const [tab, setTab] = useState<"gen" | "gallery">("gen");
  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg font-bold text-white">✦</div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-white">AssetForge</h1>
          <p className="text-sm text-slate-400">描述 + 画风 → 批量发散新资产</p>
        </div>
        <nav className="flex gap-1 rounded-lg border border-slate-700 p-1">
          {(["gen", "gallery"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm ${tab === t ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}>
              {t === "gen" ? "生成" : "画廊"}
            </button>
          ))}
        </nav>
      </header>
      {tab === "gen" ? <GenView /> : <GalleryView />}
    </div>
  );
}

/* ================= 生成 ================= */
function GenView() {
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("");
  const [count, setCount] = useState(4);
  const [refImage, setRefImage] = useState<{ b64: string; mime: string; preview: string } | null>(null);
  const [useRef2Gen, setUseRef2Gen] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [recent, setRecent] = useState<JobBrief[]>([]);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 轮询任务
  const poll = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const r = await fetch(`/api/generate?id=${id}`);
        if (!r.ok) return;
        const j: Job = await r.json();
        setJob(j);
        if (j.status !== "running" && pollRef.current) clearInterval(pollRef.current);
      } catch {}
    };
    tick();
    pollRef.current = setInterval(tick, 2500);
  }, []);

  // 挂载时恢复：最近的任务（跑着的自动续显）
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/jobs");
        const { jobs } = await r.json();
        setRecent(jobs || []);
        const active = (jobs || []).find((x: JobBrief) => x.status === "running") || (jobs || [])[0];
        if (active) poll(active.id);
      } catch {}
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [poll]);

  async function onUpload(files: FileList) {
    const arr = Array.from(files).slice(0, 6);
    if (!arr.length) return;
    setErr(""); setExtracting(true);
    try {
      // 第一张留作生图参考图（FileReader 转 base64，避免大图栈溢出）
      const first = arr[0];
      const b64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(",", 2)[1] || "");
        fr.onerror = rej;
        fr.readAsDataURL(first);
      });
      setRefImage({ b64, mime: first.type || "image/png", preview: URL.createObjectURL(first) });
      // 全部图送去提取画风
      const fd = new FormData();
      arr.forEach((f) => fd.append("images", f));
      const r = await fetch("/api/extract-style", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "提取失败");
      setStyle(j.stylePrompt || "");
    } catch (e) { setErr("提取画风失败：" + String(e)); }
    finally { setExtracting(false); }
  }

  async function generate() {
    if (!description.trim()) { setErr("请先填写描述"); return; }
    setErr("");
    try {
      const body: Record<string, unknown> = { description, style, count };
      if (refImage && useRef2Gen) { body.refB64 = refImage.b64; body.refMime = refImage.mime; }
      const r = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "提交失败");
      poll(j.jobId);
    } catch (e) { setErr("提交失败：" + String(e)); }
  }

  const running = job?.status === "running";
  const doneCount = job?.results.filter((r) => r.done).length ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <Field label="描述（要生成什么）">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            placeholder="例：沙漠魔法主题的等距游乐设施地块…"
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 outline-none focus:border-violet-500" />
        </Field>

        <Field label="画风提示词" right={
          <button onClick={() => fileRef.current?.click()} disabled={extracting}
            className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50">
            {extracting ? "提取中…" : "⬆ 上传参考图提取"}
          </button>}>
          <textarea value={style} onChange={(e) => setStyle(e.target.value)} rows={5}
            placeholder="可手写，或上传参考图自动提取。画风全程锁定，不进发散。"
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 outline-none focus:border-violet-500" />
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => e.target.files && onUpload(e.target.files)} />
        </Field>

        {refImage && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={refImage.preview} alt="ref" className="h-12 w-12 rounded object-cover" />
            <label className="flex flex-1 items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={useRef2Gen} onChange={(e) => setUseRef2Gen(e.target.checked)}
                className="accent-violet-500" />
              参考图直传生图（edits 锚定，更贴画风）
            </label>
            <button onClick={() => setRefImage(null)} className="text-xs text-slate-500 hover:text-red-400">移除</button>
          </div>
        )}

        <Field label={`生成数量：${count} 张（发散变体）`}>
          <input type="range" min={1} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))}
            className="w-full accent-violet-500" />
        </Field>

        <button onClick={generate} disabled={running}
          className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90 disabled:opacity-50">
          {running ? `生成中… ${doneCount}/${job?.results.length || count}` : "⚡ 生成"}
        </button>

        {err && <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">{err}</div>}

        {recent.length > 0 && (
          <div className="rounded-lg border border-slate-800 p-3">
            <p className="mb-2 text-xs font-medium text-slate-500">最近任务（刷新不丢，点击查看）</p>
            <div className="space-y-1">
              {recent.slice(0, 5).map((r) => (
                <button key={r.id} onClick={() => poll(r.id)}
                  className="block w-full truncate rounded px-2 py-1 text-left text-xs text-slate-400 hover:bg-slate-800">
                  <span className={r.status === "running" ? "text-amber-400" : r.status === "interrupted" ? "text-red-400" : "text-emerald-500"}>
                    {r.status === "running" ? `跑${r.doneCount}/${r.count}` : r.status === "interrupted" ? "中断" : "完成"}
                  </span>{" · "}{r.description}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <main>
        {!job && (
          <div className="grid h-full min-h-[400px] place-items-center rounded-2xl border border-dashed border-slate-700 text-slate-500">
            填好描述与画风，点击生成；任务在服务器排队执行，刷新页面不丢
          </div>
        )}
        {job && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {job.results.map((r, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                <div className="relative aspect-square bg-slate-800">
                  {!r.done && <div className="h-full w-full animate-pulse bg-slate-800/70" />}
                  {r.done && r.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt={r.prompt} className="h-full w-full object-cover" />
                  )}
                  {r.done && !r.image && (
                    <div className="grid h-full place-items-center p-3 text-center text-xs text-red-400">{r.error || "失败"}</div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <p className="line-clamp-2 text-xs text-slate-400" title={r.prompt}>{r.prompt}</p>
                  {r.image && (
                    <a href={r.image} download={`asset_${i + 1}.png`}
                      className="inline-block rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">下载</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/* ================= 画廊（共享，按 画风+参考图 归档主题） ================= */
function GalleryView() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [open, setOpen] = useState<Folder | null>(null);
  const [images, setImages] = useState<GImage[]>([]);
  const [busy, setBusy] = useState(false);

  const loadFolders = useCallback(async () => {
    const r = await fetch("/api/gallery");
    const j = await r.json();
    setFolders(j.folders || []);
  }, []);
  const openFolder = useCallback(async (f: Folder) => {
    setOpen(f);
    const r = await fetch(`/api/gallery?f=${f.id}`);
    const j = await r.json();
    setImages(j.images || []);
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  async function del(f: string, file?: string) {
    if (!confirm(file ? "删除这张图？" : "删除整个主题文件夹及全部图片？")) return;
    setBusy(true);
    await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", f, file }) });
    setBusy(false);
    if (file && open) openFolder(open);
    else { setOpen(null); loadFolders(); }
  }

  if (open) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => { setOpen(null); loadFolders(); }}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">← 返回</button>
          <h2 className="flex-1 truncate text-sm text-slate-300" title={open.title}>{open.title}</h2>
          <button onClick={() => del(open.id)} disabled={busy}
            className="rounded bg-red-900/50 px-3 py-1.5 text-xs text-red-300 hover:bg-red-900">删除整个文件夹</button>
        </div>
        {images.length === 0 && <p className="py-16 text-center text-slate-500">（空）</p>}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {images.map((im) => (
            <div key={im.file} className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.url} alt="" className="aspect-square w-full object-cover" />
              <div className="flex items-center justify-between p-2">
                <a href={im.url} download className="text-xs text-slate-300 hover:text-white">下载</a>
                <button onClick={() => del(open.id, im.file)} disabled={busy}
                  className="text-xs text-slate-500 hover:text-red-400">删除</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {folders.length === 0 && (
        <p className="py-16 text-center text-slate-500">画廊为空——生成的图会自动按【画风+参考图】主题归档到这里（所有用户共享）</p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {folders.map((f) => (
          <button key={f.id} onClick={() => openFolder(f)}
            className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 text-left hover:border-violet-600">
            <div className="aspect-square bg-slate-800">
              {f.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.cover} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="p-2.5">
              <p className="line-clamp-2 text-xs text-slate-300" title={f.title}>{f.title}</p>
              <p className="mt-1 text-[11px] text-slate-500">{f.imageCount} 张</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">{label}</label>
        {right}
      </div>
      {children}
    </div>
  );
}
