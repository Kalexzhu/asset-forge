# AssetForge 架构与决策记录

## 定位
中文受众的批量美术资产生成 Web 工具：**画风锚定(提取/手写/参考图) + 描述 → 批量出建模原画(多视图白底) → (未来)转3D**。
是 WHEEL 项目(`~/Projects/WHEEL`，CLI + LoRA 路线)的 **prompt 路线产品化 Web 版**。

## 演进脉络(为什么长这样)
1. **WHEEL(2026-06)**：游戏大纲→2D设计图→3D 管线。学到:画风与内容必须解耦、负面词无效、LLM 写内容提示词会自己跑偏需纪律约束、prompt-only 锁画风有天花板(转 LoRA 主力,本工具保留 prompt 路线)。
2. **PARK(2026-07)**：甲方糖果等距乐园岛。学到:**参考图锚定 > 纯提示词**、参考图链式可做等级进化、画风提取必须按"实战轴"校准(渲染方式/光照/描边/配色/细节密度/视角/背景)。
3. **AssetForge(2026-07)**：把上面沉淀产品化。

## 核心设计
- **两种生成模式**（同一 API,`mode` 区分）：
  - `diverge` 发散：Claude 把描述扩成 N 个互不相同的**单体物件**变体(换造型/元素/子主题/配色)，各出一张。画风词不进发散。
  - `gacha` 抽卡：描述原样 ×N，纯随机差异，刷质量用。
- **提示词拼装**：`画风提示词 + 内容描述(或变体) + 建模原画规格(可关)`。
  - 建模规格 = WHEEL object_sheet：正/背/左/右四正交+顶视+3/4透视、同一物体统一比例、纯白底。
  - 全链路中文(客户群体中文受众)。
- **画风提取**（Claude 视觉）：按 7 轴逐项提取但**宏观化**——40-70字、每轴一个宏观短语、**硬性禁止提图中具体元素/物件/结构名词**(否则生成堆元素)、只用正面词、附范例锚定颗粒度。
- **任务队列**：POST 立刻返回 jobId，后台跑，逐张落盘(`data/jobs/`)；前端轮询+localStorage，刷新/重启不丢。进程重启时 running→interrupted。
- **共享画廊**：`data/gallery/<folderId>/`，**主题键 = sha1(画风提示词+参考图内容)**——同画风+同参考图的所有产出进同一文件夹。图片存真 PNG 文件，任务/画廊引用 URL(不在 JSON 塞 base64)。
- **状态共享**：画风+参考图跨页共享(项目级)，描述各页独立(任务级)；全部 localStorage 持久化，✕ 按钮手动清空。
- **可插拔后端**：图像=OpenAI 兼容 Images API(gpt-image-2 经 yunjintao 网关，edits 传参考图，5xx 降级+重试)；未来 LoRA/ComfyUI 作第二后端；3D=Tripo(代码就绪，等 API 积分)。

## 关键教训(改动前先读)
- gpt-image-2 偏爱光泽渲染+堆细节，画风词要强正面词压制；**否定词(无/不要/avoid)无效**。
- 画风提示词管"怎么画"，元素多少由内容描述管——**画风词里出现内容名词=元素爆炸**。
- yunjintao 网关偶发 504：lib 内置重试+降级；批量场景逐张 try 不互相拖死。
- 服务器 1GB 内存：**永远本地构建 standalone 传包，不在服务器 npm install/build**(实测 install 崩)。

## 目录速查
```
lib/config.ts     env 配置          lib/image.ts   图像客户端(504自愈)
lib/llm.ts        提取画风+发散扩写   lib/tripo.ts   Tripo image→3D(搁置)
lib/jobs.ts       任务持久化         lib/gallery.ts 画廊存储(主题归档)
app/api/generate  提交任务(POST)/查任务(GET?id)
app/api/jobs      最近任务列表       app/api/extract-style 提取画风
app/api/gallery   画廊列表/删除      app/api/gallery/img   出图文件
app/api/to3d      Tripo(搁置)       app/page.tsx   全部 UI(生成/抽卡/画廊/教程)
data/             运行数据(任务+画廊)，不进 git 不进包，更新时勿删
```

## Roadmap(用户 2026-07 排期)
- [下批] 角色设定图模式(char_sheet 三视图+胸像、16:9)→ 大纲批量拆解(贴大纲→资产清单→勾选批量)→ A/B 对照(带参考图 vs 纯提示词)
- [远期] LoRA/ComfyUI 第二后端、Tripo 转3D(等 API 积分充值)、QA 自动审图
- [未排] 等级进化专页(现可用"画廊设为参考图+抽卡"手动做)
