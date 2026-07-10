# AssetForge TODO

⚠️ 核心不变规则：
- 画风与内容解耦（style 锁定不进发散）
- 密钥只在服务端，.env.local 勿提交
- Next 16 有 breaking changes，改动前读 node_modules/next/dist/docs/

## 进度（2026-07-02 夜，框架+UI 已跑通）
- [x] Next.js 16 脚手架（TS + Tailwind4 + App Router）
- [x] lib：config / image（504自愈）/ llm（提风格+发散扩N）/ tripo（image→3D，待key）
- [x] 三 API：extract-style / generate / to3d
- [x] 主 UI：描述+画风两文本框、上传参考图提取画风、数量滑块1-12、生成、画廊(下载/转3D)
- [x] `npm run build` 通过；`npm run dev` 真实链路验证：描述→LLM发散→gpt-image-2出图 端到端成功
- [x] 接 Tripo：填 key 实测走通（upload→task→轮询格式全对，lib/tripo.ts 校准，业务错误优雅返回）。仅差账号充值 credits（code 2010）
- [ ] 部署到服务器（待用户提供服务器）
- [ ] Tripo 充值 credits 后跑一张真图验证出 glb（零代码改动）
- [ ] LoRA 路线作为第二图像后端接入（保留，未来）

## 下次最重要的 3 件事
1. **接 Tripo**：拿到 key 填 `.env.local` 的 `TRIPO_API_KEY`，点一张图"转3D"验证 upload→task→轮询→glb 全通；若 Tripo 接口字段与 lib/tripo.ts 假设不符，按官方文档校准。
2. **上线服务器**：`npm run build && npm start`（或 PM2/容器），配 `.env.local`，对标 SD2 部署；配反代 + 域名。
3. **体验打磨**：拖拽上传、生成中断/重试单张、画廊放大预览、历史记录；按主美反馈调发散强度与画风锁定方式。

## 备注
- 图像/Claude 复用 WHEEL 的 yunjintao 网关 key（已配 .env.local）。
- yunjintao 代理偶发 504，lib 里已带重试；批量大时前端会分张显示成功/失败。
- 关联：WHEEL 项目（CLI + LoRA 路线）在 ~/Projects/WHEEL；本工具是其"prompt 路线的产品化 Web 版"。

## 部署信息（2026-07-10 已上线）
- 地址：http://47.84.32.235:3000（阿里云新加坡 2C1G，pm2 name=assetforge，开机自启）
- 方式：本地 `npm run build`(standalone) → 打包 → GitHub Release → 服务器下载解压 `pm2 start start.sh`
  - 服务器 npm install 不可靠（1G内存+unrs-resolver postinstall崩），**永远走预构建包，别在服务器构建**
- 服务器路径：/root/af-app（server.js + start.sh 含全部 env）；nvm node22；pm2 需先 `. /root/.nvm/nvm.sh`
- 更新流程：本地构建打包 → `gh release create vX.X` → 服务器 curl 下载解压 → `pm2 restart assetforge`
- 我本机出站22被封无法直接SSH，运维走阿里云网页"远程连接/命令助手"
- 3D(Tripo)暂搁置：API 积分为 0（网页积分与 API 积分分离，需在 platform.tripo3d.ai 给 API 单独充值）
