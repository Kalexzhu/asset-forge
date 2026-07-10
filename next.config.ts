import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本地构建、上传精简产物；服务器只跑不构建（1GB 内存友好）
  output: "standalone",
};

export default nextConfig;
