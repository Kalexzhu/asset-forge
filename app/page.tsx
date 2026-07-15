"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type JobResult = { prompt: string; image?: string; error?: string; ok?: boolean; done: boolean };
type Job = {
  id: string; createdAt: number; description: string; count: number;
  mode?: "diverge" | "gacha";
  status: "running" | "done" | "interrupted"; results: JobResult[];
};
type JobBrief = { id: string; createdAt: number; description: string; count: number; status: string; doneCount: number };
type Folder = { id: string; title: string; imageCount: number; cover: string | null; updatedAt: number };
type GImage = { file: string; url: string };
type RefState = { b64: string; mime: string };

const SIZES = [
  { v: "1024x1024", label: "方图 1024²" },
  { v: "1536x1024", label: "横版 1536×1024" },
  { v: "1024x1536", label: "竖版 1024×1536" },
];

// ---- localStorage 帮手（参考图可能超配额，超了就只留内存） ----
function lsGet(k: string): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(k) || ""; } catch { return ""; }
}
function lsSet(k: string, v: string) {
  try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* 超配额忽略 */ }
}

export default function Home() {
  const [tab, setTab] = useState<"gen" | "gacha" | "gallery">("gen");
  const [showHelp, setShowHelp] = useState(false);

  // ---- 跨页共享：画风 + 参考图；描述各页独立 ----
  const [style, setStyleRaw] = useState("");
  const [refImage, setRefRaw] = useState<RefState | null>(null);
  const [descGen, setDescGenRaw] = useState("");
  const [descGacha, setDescGachaRaw] = useState("");
  const [count, setCountRaw] = useState(4);
  const [size, setSizeRaw] = useState("1024x1024");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setStyleRaw(lsGet("af.style"));
    setDescGenRaw(lsGet("af.desc.gen"));
    setDescGachaRaw(lsGet("af.desc.gacha"));
    setCountRaw(Number(lsGet("af.count")) || 4);
    setSizeRaw(lsGet("af.size") || "1024x1024");
    try { const r = lsGet("af.ref"); if (r) setRefRaw(JSON.parse(r)); } catch {}
    setLoaded(true);
  }, []);

  const setStyle = (v: string) => { setStyleRaw(v); lsSet("af.style", v); };
  const setRef = (v: RefState | null) => { setRefRaw(v); lsSet("af.ref", v ? JSON.stringify(v) : ""); };
  const setDescGen = (v: string) => { setDescGenRaw(v); lsSet("af.desc.gen", v); };
  const setDescGacha = (v: string) => { setDescGachaRaw(v); lsSet("af.desc.gacha", v); };
  const setCount = (v: number) => { setCountRaw(v); lsSet("af.count", String(v)); };
  const setSize = (v: string) => { setSizeRaw(v); lsSet("af.size", v); };

  if (!loaded) return null;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg font-bold text-white">✦</div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-white">AssetForge</h1>
          <p className="text-sm text-slate-400">描述 + 画风 → 批量新资产（建模原画）</p>
        </div>
        <nav className="flex gap-1 rounded-lg border border-slate-700 p-1">
          {([["gen", "生成(发散)"], ["gacha", "抽卡"], ["gallery", "画廊"]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm ${tab === t ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </nav>
        <button onClick={() => setShowHelp(true)}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:border-violet-500 hover:text-white">
          使用教程
        </button>
      </header>

      {tab !== "gallery" && (
        <WorkView key={tab} mode={tab === "gen" ? "diverge" : "gacha"}
          desc={tab === "gen" ? descGen : descGacha}
          setDesc={tab === "gen" ? setDescGen : setDescGacha}
          style={style} setStyle={setStyle}
          refImage={refImage} setRef={setRef}
          count={count} setCount={setCount} size={size} setSize={setSize} />
      )}
      {tab === "gallery" && <GalleryView setRef={setRef} />}

      {showHelp && <Tutorial onClose={() => setShowHelp(false)} />}
    </div>
  );
}

/* ================= 工作页（生成/抽卡 共用） ================= */
function WorkView(props: {
  mode: "diverge" | "gacha";
  desc: string; setDesc: (v: string) => void;
  style: string; setStyle: (v: string) => void;
  refImage: RefState | null; setRef: (v: RefState | null) => void;
  count: number; setCount: (v: number) => void;
  size: string; setSize: (v: string) => void;
}) {
  const { mode, desc, setDesc, style, setStyle, refImage, setRef, count, setCount, size, setSize } = props;
  const [useRef2Gen, setUseRef2Gen] = useState(true);
  const [sheet, setSheet] = useState(true); // 建模原画模式（抽卡页可关）
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [recent, setRecent] = useState<JobBrief[]>([]);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const r = await fetch(`/api/generate?id=${id}`);
        if (!r.ok) return;
        const j: Job = await r.json();
        setJob(j); setSubmitting(false);
        if (j.status !== "running" && pollRef.current) clearInterval(pollRef.current);
      } catch {}
    };
    tick();
    pollRef.current = setInterval(tick, 2500);
  }, []);

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
      const first = arr[0];
      const b64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(",", 2)[1] || "");
        fr.onerror = rej;
        fr.readAsDataURL(first);
      });
      setRef({ b64, mime: first.type || "image/png" });
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
    if (!desc.trim()) { setErr("请先填写描述"); return; }
    setErr(""); setSubmitting(true); setJob(null);
    try {
      const body: Record<string, unknown> = { description: desc, style, count, mode, sheet, size };
      if (refImage && useRef2Gen) { body.refB64 = refImage.b64; body.refMime = refImage.mime; }
      const r = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "提交失败");
      poll(j.jobId);
    } catch (e) { setErr("提交失败：" + String(e)); setSubmitting(false); }
  }

  const running = submitting || job?.status === "running";
  const doneCount = job?.results.filter((r) => r.done).length ?? 0;
  const skeletonN = job?.results.length || count;
  const refPreview = refImage ? `data:${refImage.mime};base64,${refImage.b64}` : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <Field label="描述（要生成什么）" onClear={desc ? () => setDesc("") : undefined}>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4}
            placeholder={mode === "diverge" ? "例：沙漠魔法主题的游乐设施" : "例：一座神灯造型的旋转飞椅（原样抽卡，不发散）"}
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 outline-none focus:border-violet-500" />
          {mode === "diverge" && (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              发散示例：填「沙漠魔法主题的游乐设施」数量4 → 神灯旋转飞椅 / 仙人掌塔过山车 / 飞毯跳楼机 / 蛇形水上滑道
            </p>
          )}
          {mode === "gacha" && (
            <p className="mt-1 text-[11px] text-slate-500">抽卡：同一描述出 {count} 张（只有随机差异），方向已定时刷质量用</p>
          )}
        </Field>

        <Field label="画风提示词（生成/抽卡两页共用）" onClear={style ? () => setStyle("") : undefined}
          right={
            <button onClick={() => fileRef.current?.click()} disabled={extracting}
              className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50">
              {extracting ? "提取中…" : "⬆ 上传参考图提取"}
            </button>}>
          <textarea value={style} onChange={(e) => setStyle(e.target.value)} rows={4}
            placeholder="可手写，或上传参考图自动提取（宏观简洁，不含具体元素）。画风全程锁定。"
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 outline-none focus:border-violet-500" />
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => e.target.files && onUpload(e.target.files)} />
        </Field>

        {refImage && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={refPreview} alt="ref" className="h-12 w-12 rounded object-cover" />
            <label className="flex flex-1 items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={useRef2Gen} onChange={(e) => setUseRef2Gen(e.target.checked)} className="accent-violet-500" />
              参考图直传生图（更贴画风）
            </label>
            <button onClick={() => setRef(null)} className="text-sm text-slate-500 hover:text-red-400" title="删除参考图">✕</button>
          </div>
        )}

        <Field label={`生成数量：${count} 张`}>
          <input type="range" min={1} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-violet-500" />
        </Field>

        <Field label="出图尺寸">
          <div className="flex gap-2">
            {SIZES.map((s) => (
              <button key={s.v} onClick={() => setSize(s.v)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${size === s.v ? "border-violet-500 bg-violet-950/50 text-violet-200" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        {mode === "gacha" && (
          <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-xs text-slate-300">
            <input type="checkbox" checked={sheet} onChange={(e) => setSheet(e.target.checked)} className="accent-violet-500" />
            建模原画模式（多视图+白底设定图；关掉=自由构图）
          </label>
        )}

        <button onClick={generate} disabled={running}
          className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90 disabled:opacity-60">
          {submitting && !job ? (mode === "diverge" ? "✓ 已提交，正在扩写变体…" : "✓ 已提交，排队出图…")
            : running ? `生成中… ${doneCount}/${job?.results.length || count}`
            : "⚡ 生成"}
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
        {!running && !job && (
          <div className="grid h-full min-h-[400px] place-items-center rounded-2xl border border-dashed border-slate-700 text-slate-500">
            填好描述与画风，点击生成；任务在服务器执行，刷新页面不丢
          </div>
        )}
        {(running || job) && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: skeletonN }).map((_, i) => {
              const r = job?.results[i];
              return (
                <div key={i} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                  <div className="relative aspect-square bg-slate-800">
                    {(!r || !r.done) && <div className="h-full w-full animate-pulse bg-slate-800/70" />}
                    {r?.done && r.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt={r.prompt} className="h-full w-full object-cover" />
                    )}
                    {r?.done && !r.image && (
                      <div className="grid h-full place-items-center p-3 text-center text-xs text-red-400">{r.error || "失败"}</div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="line-clamp-2 text-xs text-slate-400" title={r?.prompt}>{r?.prompt || "…"}</p>
                    {r?.image && (
                      <a href={r.image} download={`asset_${i + 1}.png`}
                        className="inline-block rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">下载</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

/* ================= 画廊 ================= */
function GalleryView({ setRef }: { setRef: (v: RefState | null) => void }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [open, setOpen] = useState<Folder | null>(null);
  const [images, setImages] = useState<GImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

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

  async function useAsRef(url: string) {
    try {
      const blob = await (await fetch(url)).blob();
      const b64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(",", 2)[1] || "");
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      setRef({ b64, mime: blob.type || "image/png" });
      setToast("✓ 已设为参考图，去「生成」或「抽卡」页使用");
      setTimeout(() => setToast(""), 3000);
    } catch { setToast("设置失败"); setTimeout(() => setToast(""), 3000); }
  }

  return (
    <div>
      {toast && <div className="mb-3 rounded-lg border border-emerald-700 bg-emerald-950/50 p-2.5 text-sm text-emerald-300">{toast}</div>}
      {open ? (
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
              <div key={im.file} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt="" className="aspect-square w-full object-cover" />
                <div className="flex items-center justify-between gap-1 p-2 text-xs">
                  <a href={im.url} download className="text-slate-300 hover:text-white">下载</a>
                  <button onClick={() => useAsRef(im.url)} className="text-violet-400 hover:text-violet-300">设为参考图</button>
                  <button onClick={() => del(open.id, im.file)} disabled={busy} className="text-slate-500 hover:text-red-400">删除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {folders.length === 0 && (
            <p className="py-16 text-center text-slate-500">画廊为空——生成的图会自动按【画风+参考图】主题归档到这里（所有人共享）</p>
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
      )}
    </div>
  );
}

/* ================= 使用教程 ================= */
function Tutorial({ onClose }: { onClose: () => void }) {
  const steps: [string, string][] = [
    ["1. 教 AI 画风", "点「上传参考图提取」，把你想要的画风的图丢进去（可多张）。上面的画风框会自动填一段中文描述——觉得哪里不对，直接改字就行。"],
    ["2. 写描述", "在「描述」里写你要什么东西，比如“沙漠魔法主题的游乐设施”。只写要什么，不用写画风——画风由上面那个框管。"],
    ["3. 选数量，点生成", "「生成(发散)」页：AI 会把你的描述变成 N 个不同的东西（比如神灯飞椅、仙人掌过山车…）各出一张。「抽卡」页：同一个描述抽 N 张，方向定了刷质量用。"],
    ["4. 等图，不用盯着", "出图要一两分钟。提交后可以随便刷新、关页面，回来在左下角「最近任务」点一下就找回。"],
    ["5. 画廊", "所有图自动进「画廊」，同一套画风+参考图的归在同一个文件夹（大家共用）。可以下载、删除。"],
    ["6. 拿老图继续生成", "画廊里任何一张图点「设为参考图」，它就成了新的参考图。比如做等级进化：拿1级的图当参考图，描述写“在此基础上更华丽的下一级”。"],
    ["7. 两个开关", "「参考图直传生图」：开着=AI 照着参考图的样子画（更像）；关掉=只看文字。「建模原画模式」（抽卡页）：开着=出多视图白底设定图能拿去建模；关掉=自由构图。"],
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">使用教程</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="space-y-4">
          {steps.map(([t, d]) => (
            <div key={t}>
              <p className="mb-1 text-sm font-medium text-violet-300">{t}</p>
              <p className="text-sm leading-relaxed text-slate-300">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, right, onClear, children }: {
  label: string; right?: React.ReactNode; onClear?: () => void; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">{label}</label>
        <div className="flex items-center gap-3">
          {right}
          {onClear && (
            <button onClick={onClear} className="text-sm text-slate-500 hover:text-red-400" title="清空">✕</button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
