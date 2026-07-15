import fs from "fs";
import path from "path";

// 服务端任务存储：内存 Map + 磁盘持久化（data/jobs/<id>.json）。
// 页面刷新甚至 pm2 重启后任务/结果都还在。单机工具，不引数据库。

export type JobResult = {
  prompt: string;
  image?: string; // data URL
  error?: string;
  ok?: boolean;
  done: boolean;
};

export type Job = {
  id: string;
  createdAt: number;
  description: string;
  style: string;
  count: number;
  useRef: boolean;
  mode?: "diverge" | "gacha"; // diverge=LLM发散变体；gacha=同描述抽卡（旧任务缺省视为 diverge）
  sheet?: boolean; // 是否附加建模原画规格（多视图+白底）
  size?: string; // 出图尺寸，如 1024x1024 / 1536x1024
  status: "running" | "done" | "interrupted";
  results: JobResult[];
};

const DATA_DIR = path.join(process.cwd(), "data", "jobs");
const KEEP = 30; // 只留最近 30 个任务，防磁盘/内存膨胀

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const mem = new Map<string, Job>();

function jobPath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

export function saveJob(job: Job) {
  mem.set(job.id, job);
  try {
    ensureDir();
    fs.writeFileSync(jobPath(job.id), JSON.stringify(job));
  } catch {
    /* 磁盘失败不阻断（内存仍在） */
  }
}

export function getJob(id: string): Job | null {
  if (mem.has(id)) return mem.get(id)!;
  try {
    const j = JSON.parse(fs.readFileSync(jobPath(id), "utf-8")) as Job;
    // 进程重启后读到的"running"任务已无人在跑 → 标记中断
    if (j.status === "running") j.status = "interrupted";
    mem.set(id, j);
    return j;
  } catch {
    return null;
  }
}

export function listJobs(limit = 10): Job[] {
  try {
    ensureDir();
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    const jobs = files
      .map((id) => getJob(id))
      .filter((j): j is Job => !!j)
      .sort((a, b) => b.createdAt - a.createdAt);
    // 清理超出保留数的旧任务
    for (const old of jobs.slice(KEEP)) {
      mem.delete(old.id);
      try {
        fs.unlinkSync(jobPath(old.id));
      } catch {}
    }
    return jobs.slice(0, limit);
  } catch {
    return [];
  }
}

export function newJobId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
