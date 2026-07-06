"use client";

import { useRef, useState } from "react";

type Result = {
  prompt: string;
  image?: string;
  error?: string;
  ok: boolean;
  three?: { status: string; modelUrl?: string; message?: string; loading?: boolean };
};

export default function Home() {
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("");
  const [count, setCount] = useState(4);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function extractStyle(files: FileList | File[]) {
    const arr = Array.from(files).slice(0, 6);
    if (!arr.length) return;
    setErr("");
    setExtracting(true);
    try {
      const fd = new FormData();
      arr.forEach((f) => fd.append("images", f));
      const r = await fetch("/api/extract-style", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "提取失败");
      setStyle(j.stylePrompt || "");
    } catch (e) {
      setErr("提取画风失败：" + String(e));
    } finally {
      setExtracting(false);
    }
  }

  async function generate() {
    if (!description.trim()) {
      setErr("请先填写描述");
      return;
    }
    setErr("");
    setGenerating(true);
    setResults([]);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, style, count }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "生成失败");
      setResults(j.results || []);
    } catch (e) {
      setErr("生成失败：" + String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function to3d(idx: number) {
    const res = results[idx];
    if (!res?.image) return;
    setResults((prev) => {
      const n = [...prev];
      n[idx] = { ...n[idx], three: { status: "loading", loading: true } };
      return n;
    });
    try {
      const r = await fetch("/api/to3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: res.image }),
      });
      const j = await r.json();
      setResults((prev) => {
        const n = [...prev];
        n[idx] = { ...n[idx], three: { ...j, loading: false } };
        return n;
      });
    } catch (e) {
      setResults((prev) => {
        const n = [...prev];
        n[idx] = { ...n[idx], three: { status: "error", message: String(e), loading: false } };
        return n;
      });
    }
  }

  function download(dataUrl: string, name: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = name;
    a.click();
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-8 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg font-bold text-white">
          ✦
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">AssetForge</h1>
          <p className="text-sm text-slate-400">描述 + 画风 → 批量发散新资产 → 转 3D</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ---- 控制面板 ---- */}
        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <Field label="描述（要生成什么）">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="例：沙漠魔法主题的等距游乐设施地块，一条过山车轨道+几栋建筑…"
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 outline-none focus:border-violet-500"
            />
          </Field>

          <Field
            label="画风提示词"
            right={
              <button
                onClick={() => fileRef.current?.click()}
                disabled={extracting}
                className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50"
              >
                {extracting ? "提取中…" : "⬆ 上传参考图提取"}
              </button>
            }
          >
            <textarea
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              rows={5}
              placeholder="可手写，或上传若干参考图自动提取。画风全程锁定，不进发散。"
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 outline-none focus:border-violet-500"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => e.target.files && extractStyle(e.target.files)}
            />
          </Field>

          <Field label={`生成数量：${count} 张（发散变体）`}>
            <input
              type="range"
              min={1}
              max={12}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </Field>

          <button
            onClick={generate}
            disabled={generating}
            className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90 disabled:opacity-50"
          >
            {generating ? "生成中…（LLM 扩描述 + 批量出图）" : "⚡ 生成"}
          </button>

          {err && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">{err}</div>
          )}
        </aside>

        {/* ---- 结果画廊 ---- */}
        <main>
          {generating && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-xl bg-slate-800/60" />
              ))}
            </div>
          )}

          {!generating && results.length === 0 && (
            <div className="grid h-full min-h-[400px] place-items-center rounded-2xl border border-dashed border-slate-700 text-slate-500">
              填好描述与画风，点击生成，结果会出现在这里
            </div>
          )}

          {!generating && results.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {results.map((r, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                  <div className="relative aspect-square bg-slate-800">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt={r.prompt} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center p-3 text-center text-xs text-red-400">
                        {r.error || "失败"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="line-clamp-2 text-xs text-slate-400" title={r.prompt}>
                      {r.prompt}
                    </p>
                    {r.image && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => download(r.image!, `asset_${i + 1}.png`)}
                          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                        >
                          下载
                        </button>
                        <button
                          onClick={() => to3d(i)}
                          disabled={r.three?.loading}
                          className="rounded bg-violet-800/60 px-2 py-1 text-xs text-violet-200 hover:bg-violet-700/60 disabled:opacity-50"
                        >
                          {r.three?.loading ? "转3D中…" : "转3D"}
                        </button>
                        {r.three && !r.three.loading && (
                          <span className="text-xs text-slate-400">
                            {r.three.status === "done" && r.three.modelUrl ? (
                              <a href={r.three.modelUrl} className="text-emerald-400" target="_blank" rel="noreferrer">
                                模型✓
                              </a>
                            ) : (
                              r.three.message || r.three.status
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Field({
  label,
  right,
  children,
}: {
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
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
