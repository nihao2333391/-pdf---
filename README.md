# 微信报销材料整理小程序

用户按费用组整理发票和附件，在手机本地生成凭证 PDF 与带页码说明的 Word，并在本机历史记录中重新编辑。

## 当前可试用的流程

**新建报销 → 填写一项描述 → 添加发票和附件 → 保存并添加下一项 → 返回列表拖拽排序 → 生成 PDF 和 Word → 打开或导出 → 历史记录重新编辑。**

业务首版代码已接通，支持 PDF 和 JPG／PNG 图片。导入阶段保存原文件；生成时逐组复制 PDF 页面、将每张图片排在独立 A4 页面上。Word 原样保留描述，使用本次 PDF 实际页码。标题选填，历史记录按创建时间组织。

完全空白的报销记录（包括只添加空白费用组）会在再次进入历史时自动从列表略过。只要已有标题、描述、材料或生成结果就继续保留；标题依然选填。

报销内部的项目若描述、发票、附件都为空，返回项目列表时自动移除；“保存并添加下一项”会复用尚未填写的空项目。仅填描述或仅添加材料的项目继续保留，材料选择和导入过程受到保护。

原材料、JSON 草稿和生成结果存入微信本机用户目录。首版没有服务器、云数据库、付费文档接口或运行时 AI 调用。

电脑测试、页面编译与 Android 真机分别验收。当前通过 TypeScript 检查及 19 项流程测试；页面模板曾通过全部 6 份 WXML 和 7 份 WXSS 的微信编译检查，开发工具模拟器已显示业务列表。最新两层空白处理的微信运行效果与材料导入、生成、文件打开、拖拽等 Android 业务验证仍待完成。详见 [进度](docs/progress.md) 与 [验证记录](docs/validation.md)。

## 开发命令

```powershell
npm.cmd ci --ignore-scripts --no-fund
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
```

`build` 把已锁定的免费开源依赖打包为小程序可直接加载的 CommonJS 文件，同时保留许可证。修改 `engine/documents.cjs` 后重新运行此命令。当前文档引擎约 785 KiB，加入界面资源后整个小程序目录为 1,784,901 字节，约 1.70 MiB；微信实际上传体积以开发工具为准。无需点击开发工具的“构建 npm”。

测试使用项目自带的虚构凭证，结果放在 `.cache/tests/`。它们不会进入小程序包，也不读取个人报销材料。`tests/create-fixtures.py` 只用于重新制作测试用图片，日常测试直接使用已有样例。

## 微信开发者工具

工程已导入，保留 `project.config.json` 中现有 AppID、TypeScript 插件及 `miniprogram/` 源码目录。开发工具为 2.02.2608060，本机基础库为 3.17.2。源码更新后重新编译即可。

本机安装位置：`C:\Users\lenovo\AppData\Local\Programs\WeChatDevTools`。使用其界面编译和真机调试。此前 `wechatide.cmd` 授权连接超时单独保留，业务开发已继续。

当前仍处于开发验证阶段。公开上线前还需核对正式账号、隐私声明、材料选择权限、手机文件导出能力以及真机容量限制。

## 文件入口

| 文件或目录 | 负责什么 |
|---|---|
| `miniprogram/pages/` | 首页、报销列表、单项编辑、历史记录、生成结果 |
| `miniprogram/components/sort-list/` | 手柄拖拽、材料预览与移除入口 |
| `miniprogram/core/model.ts` | 报销、分组、材料、生成结果的共同格式与校验 |
| `miniprogram/core/repository.ts` | 草稿读写、备份恢复、按项修改 |
| `miniprogram/core/generation.ts` | 同一次快照生成两个文件，成功后更新历史结果 |
| `miniprogram/services/` | 微信文件选择、本机文件读写、打开与分享、生成调用 |
| `engine/documents.cjs` | PDF 合成与 Word 模板生成源代码 |
| `scripts/build.cjs` | 依赖构建、体积检查与许可证收集 |
| `tests/workflow.test.cjs` | 真实 PDF／DOCX 及本地仓库的流程测试 |
| [需求与验收](docs/requirements.md) | 用户已确认的产品规则 |
| [技术设计](docs/technical-design.md) | 数据流程、设计依据与待验证问题 |
| [代码方案筛选](docs/implementation-notes.md) | 本轮编码前的候选比较、许可证与取舍 |

## 当前实际限制

- 生成引擎支持 PDF、JPG/JPEG、PNG。其他图片格式可保留原文件，生成时会明确提示换用 JPG 或 PNG；格式适配尚待追加验证。
- 加密、损坏或空 PDF 会阻止本次生成，并指出具体材料。原材料和上次成功文件保留。
- 长图仍按“一张一页”缩放，较长截图在纸面上可能较小；超大材料的 Android 内存上限尚未测定。
- 本机记录不跨设备恢复。清理微信应用数据会影响记录。
- 目前保留原文件和旧生成版本以便排查，长期使用的空间清理策略待容量验证后处理。
- Word 内容可由解析器完整读回；当前机器缺少配套 LibreOffice，Word 页面渲染和手机实际打开尚待验证。
