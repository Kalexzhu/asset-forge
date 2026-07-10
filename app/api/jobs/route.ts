import { NextResponse } from "next/server";
import { listJobs } from "@/lib/jobs";

export const runtime = "nodejs";

// 最近任务列表（不带大图，前端恢复/历史用）
export async function GET() {
  const jobs = listJobs(10).map((j) => ({
    id: j.id,
    createdAt: j.createdAt,
    description: j.description,
    count: j.count,
    status: j.status,
    doneCount: j.results.filter((r) => r.done).length,
  }));
  return NextResponse.json({ jobs });
}
