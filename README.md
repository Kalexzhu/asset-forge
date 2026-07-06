# AssetForge

批量资产生成工具:**描述 + 画风 → LLM 扩 N 个发散子描述 → 批量出图 → 转 3D(Tripo)**。
prompt 路线(即开即用),LoRA 路线作为未来第二后端保留。

## 跑起来
```bash
cp .env.example .env.local   # 填 key（图像/Claude 已在 .env.local 配好 yunjintao 网关）
npm install
npm run dev                  # http://localhost:3000
```
离线只看 UI:`.env.local` 设 `MOCK=1`。

## 用法
1. **描述**框:要生成什么(内容);
2. **画风提示词**框:手写,或**上传若干参考图 → 自动提取画风**(画风全程锁定,不进发散);
3. **数量**滑块:1–12 张发散变体;
4. **生成** → 画廊出图,每张可**下载 / 转3D**。

## 架构
- Next.js 16(App Router)+ TS + Tailwind 4,前后端一体(API 路由)。
- `lib/image.ts` 图像(OpenAI 兼容 Images API + 504 自愈);`lib/llm.ts` Claude(提风格 + 发散扩写);`lib/tripo.ts` Tripo 3D。
- `app/api/{extract-style,generate,to3d}/route.ts` 三接口。

## 部署(待服务器)
`npm run build && npm start`,或 PM2/容器,配 `.env.local`。对标 SD2 上线方式。

## 待接
- **服务器**:用户提供后部署。
- **Tripo API key**:填 `.env.local` 的 `TRIPO_API_KEY` 即通(接口已写好:upload→image_to_model→轮询→glb)。
