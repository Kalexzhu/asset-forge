import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AssetForge · 批量资产生成",
  description: "描述 + 画风 → 批量发散新资产 → 转 3D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
