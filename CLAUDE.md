# AssetForge

批量资产生成 Web 工具。描述 + 画风 → LLM 扩 N 个发散子描述 → 批量出图 → 转 3D。

## ⚠️ Next.js 16（新版，有 breaking changes）
本项目 Next 16.2 + React 19 + Tailwind 4，可能与训练数据里的旧 Next 有出入。
写代码前若不确定某 API，读 `node_modules/next/dist/docs/`，并留意 deprecation。

## 技术栈
- Next.js 16（App Router）+ TypeScript + Tailwind 4，前后端一体
- 图像:OpenAI 兼容 Images API（gpt-image-2，复用 WHEEL 的 yunjintao 网关）
- LLM:Claude（提取画风 + 发散扩写）
- 3D:Tripo（image→model，待 key）

## 目录
- `lib/config.ts` env 配置
- `lib/image.ts` 图像客户端（generations + edits 参考图 + 504 自愈重试）
- `lib/llm.ts` Claude（extractStyle 提风格 / expandDescriptions 发散扩 N）
- `lib/tripo.ts` Tripo image→3D（upload→task→轮询→glb；缺 key 返回 not_configured）
- `app/api/extract-style/route.ts` 上传图 → 画风提示词
- `app/api/generate/route.ts` 描述+画风+数量 → 发散批量出图
- `app/api/to3d/route.ts` 图 → Tripo 3D
- `app/page.tsx` 主 UI（两文本框 + 上传提取 + 数量滑块 + 生成 + 画廊）

## 关键约定
- **画风与内容解耦**:画风(style)全程锁定、只前置到 prompt，不进发散;发散只变"画什么"。
- **画风=可插拔**:现走 prompt(style_prompt);LoRA 路线以后作第二后端接入，UI 不变。
- **密钥只在服务端**（非 NEXT_PUBLIC），`.env.local` 已 gitignore。
- **MOCK=1** 离线跑通 UI。
- 图像/3D 都带 504/超时自愈重试。

## 待接（用户提供）
- 服务器（部署）;Tripo API key（填 .env.local 即通）。

## 文档
- 用法/部署见 README.md;进度见 TODO.md。
