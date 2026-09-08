# 业务首版实施记录（2026-09-07）

## 字体反馈修正

编码前检索 [微信官方 WeUI 样式库](https://github.com/Tencent/weui-wxss) 和 [腾讯 WXSS 尺寸说明](https://intl.cloud.tencent.com/ind/document/product/1219/60346)。沿用项目原生 WXSS 与系统字体，通过明确字号和 700 字重修复层次，无新增依赖／费用。未引入完整 WeUI，以保留用户指定设计；未增加网络字体，以保持当前本地运行路径。系统实际字形和字重映射需设备验证。

改动限 app.wxss、四页 WXSS、sort-list/index.wxss。栏目标签的局部 28／29rpx 覆盖改为 32rpx，主标题 38 改 44rpx；700 字重明确应用到栏目、页标题、按钮和项目名称。材料名维持 400，辅助说明保留常规，以拉开层次。模拟器列表与编辑已目视检查，typecheck 与 7 WXSS 编译通过；Android 待验。

## 四页细化图落地补充

本轮编码前重新检索 [微信官方示例](https://github.com/wechat-miniprogram/miniprogram-demo) 的原生 flex 样式及 [Tabler 官方仓库](https://github.com/tabler/tabler-icons)。沿用原生 WXML／WXSS 与 MIT 静态 SVG，免新增框架、运行依赖与服务费用。新增 photo.svg，来源 main/icons/outline/photo.svg，2026-09-07 下载，描边改为暖灰褐，沿用目录 MIT 许可证。

四页按 four-pages-detail-v1.png 实现；为保留真实材料大小和格式说明，材料行比概念图稍高，普通行最小 72px、紧凑材料行最小 58px。observer 同时观察 items、compact，渲染和拖拽共用同一高度；取消保留拖拽前顺序。历史只新增 time 展示字段，底层 createdAt、排序、存储格式保持；生成数据路径保持原值。

## 五页 UI 实现补充（2026-09-07）

用户确认 v3 后，按原生 WXML／WXSS 实现五页及 sort-list，首页额外按窗口尺寸计算入口面积。页面继续通过原仓库读写草稿，通过原生成服务产生 PDF 与 Word，数据约定及依赖锁文件保持原值。

编码前比较来源与采用理由：

| 方案 | 来源、环境与取舍 |
|---|---|
| 微信原生组件与窗口 API（采用） | [官方示例](https://github.com/wechat-miniprogram/miniprogram-demo)、[官方类型](https://github.com/wechat-miniprogram/api-typings)，MIT，沿用项目已有平台类型，无新增运行依赖或费用；直接用于既有五页 |
| Tabler 线图（采用） | [官方仓库](https://github.com/tabler/tabler-icons)，MIT；静态 SVG 覆盖钱币、文档、排序及操作图标。2026-09-07 从 main 的 icons/outline 下载 9 份文件，许可证保存在 assets/icons/LICENSE.txt；改为明确描边颜色和宽度，文件随项目固定，运行时无需联网。手机 SVG 显示待验 |
| ImageGen 渐变资源（采用） | 从已确认 v3 方向独立生成无文字背景，保存 assets/home-flow.png，1836×857、842862 字节；已目视检查。文字与交互由原生控件承担，生成资源随包分发，无运行时 AI 调用 |
| 网页 UI 框架 | 需要额外运行与适配层，当前五页原生界面可直接修改，本轮沿用原生方案 |
| miniprogram-simulate | [微信官方工具](https://github.com/wechat-miniprogram/miniprogram-simulate)，MIT，提供组件 DOM 测试，需要对应测试环境；当前已有流程模拟及原生编译检查，本轮未额外接入，实际布局仍交由微信模拟器及手机验证 |

检查结果：typecheck 通过；19 项流程测试通过；6 份 WXML 与 7 份 WXSS 原生编译器检查通过；13 处本地图片引用有效。首页三个常见尺寸的面积计算为 35%／20%，短窗口优先最小高度。包目录约 1.70 MiB，真实上传体积待报告。开发工具当前为扫码登录页，实际五页视觉与真机验收待补。

本轮范围：接通新建报销、分组编辑、原材料导入、拖拽排序、本机历史、PDF 与 Word 生成和文件导出。输入是用户填写的描述及自己选择的原材料；输出是本机记录及同一版本的一对文档。按 requirements.md 的 AC01—AC07 验证。服务器、账号系统、OCR、云同步保持首版范围之外。

## 编码前的已有代码筛选

| 环节 | 比较与结论 | 来源与约束 |
|---|---|---|
| 页面与文件选择 | 采用微信原生页面、chooseMessageFile、文件系统 API；沿用已运行的 TypeScript 工程。Taro / uni-app 的跨端层对当前单端项目增加适配工作 | [官方示例，MIT](https://github.com/wechat-miniprogram/miniprogram-demo)、[官方类型与 API 注释，MIT](https://github.com/wechat-miniprogram/api-typings)；官方网站部分 API 页面本轮访问失败，结合本地 5.2.3 类型核对 |
| 文件与草稿保存 | 原材料放 USER_DATA_PATH；JSON 清单通过临时文件、备份与改名保存。setStorage 适合少量键值，不用于存放 PDF 二进制；云数据库增加账号、联网和运营负担 | 官方 FileSystemManager 示例与类型；针对本项目的分组和原文件引用编写薄封装 |
| 拖拽排序 | 使用微信触摸事件与固定行高的手柄组件；movable-view 官方示例提供基础交互参考。SortableJS 依赖网页 DOM，不能直接用于原生 WXML | [微信示例](https://github.com/wechat-miniprogram/miniprogram-demo)、[SortableJS，MIT](https://github.com/SortableJS/Sortable)；独立实现组件，不引入 DOM 库 |
| PDF | 采用 pdf-lib 1.17.1，可 copyPages / embedJpg / embedPng。@cantoo/pdf-lib 延续维护但依赖更多，留为兼容性备选；jsPDF 偏创建 PDF，本任务现有 PDF 页面复制更适合 pdf-lib | [pdf-lib，MIT](https://github.com/Hopding/pdf-lib)、[cantoo 分支](https://github.com/cantoo-scribe/pdf-lib)、[jsPDF，MIT](https://github.com/parallax/jsPDF)。pdf-lib 发版较旧，依靠锁定版本与真实合成测试判断适用性 |
| Word | 采用 Docxtemplater 3.69.3 免费核心 + PizZip 3.2.0；简单本地模板、循环和文本换行即可覆盖页码说明。docx 库可编程创建文档，但本轮不需要更复杂的文档结构；纯文本不满足 Word 需求 | [官方浏览器例子](https://docxtemplater.com/docs/get-started-browser/)、[docx](https://github.com/dolanmiu/docx)。Docxtemplater MIT，PizZip 双许可证中采用 MIT；不用付费模块 |
| 依赖构建 | 采用 esbuild 0.28.2，在开发电脑生成本地 CommonJS 包。与开发工具手动“构建 npm”相比，构建命令可重跑、可检查体积，用户无需每次点击菜单 | [esbuild API，MIT](https://esbuild.github.io/api/)。浏览器目标移除 Node 内置模块依赖；是否适配微信以编译和真机结果分别记载 |

以上库免费使用，无远程调用。npm 查询已确认上述固定版本、许可证和依赖。候选可行性、电脑测试、微信编译和 Android 真机结果分别记录，安装成功本身不代表手机验证成功。

## 完全空白记录处理（2026-09-07）

用户反馈：新建后任何内容都没填写，仍进入历史；期望再次打开时空记录消失。定位到 `create()` 立即保存清单，而 `list()` 原来会返回所有可读清单。

编码前搜索了微信官方存储示例、文件系统接口与现有代码，没有找到直接覆盖本项目“标题选填、多组材料、历史导出”判断的现成实现。具体比较：

| 候选 | 功能、依赖和取舍 |
|---|---|
| [官方 storage 示例](https://raw.githubusercontent.com/wechat-miniprogram/miniprogram-demo/master/miniprogram/packageAPI/pages/storage/storage/storage.js)，MIT | 提供原生同步读写和清空键值存储示例，无额外运行费用；判断对象是存储键，无法直接判断本项目完整报销内容，保留为 API 参考 |
| [官方 FileSystemManager 类型](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)，MIT | 可做物理文件删除，但会扩大到原文件、备份和页面生命周期处理；本轮目标是历史列表自动消失，保留现有持久化接口 |
| 延迟到第一份内容输入后创建记录 | 可减少空清单，但需改写新建、分组、材料导入和连续编辑的记录 ID 生命周期；对已有空历史还需迁移处理 |
| 现有仓库读取时按内容筛选（采用） | 添加一个 TypeScript 判断函数并在 `list()` 使用；零新依赖、零服务成本，兼容已有空记录，保留正在编辑的记录 ID 和原材料 |

上述修正的范围是历史可见性：过滤完全空白的整条报销记录。内部项目的清理随后按下述规则补充。底层原文件和备份保留，物理空间回收仍属于原有待评估的容量管理。

## 内部空白项目处理（2026-09-07）

用户进一步指出：一次报销中“添加一项”产生的空项目仍存在。定位到报销列表直接读取全部 `groups`，编辑页的下一项操作每次都会新增组。

编码前再次搜索现有小程序生命周期和存储代码，采用腾讯维护的 [Page 生命周期类型与注释](https://raw.githubusercontent.com/wechat-miniprogram/api-typings/master/types/wx/lib.wx.page.d.ts) 和 [官方存储示例](https://raw.githubusercontent.com/wechat-miniprogram/miniprogram-demo/master/miniprogram/packageAPI/pages/storage/storage/storage.js) 作为平台行为依据。两者采用 MIT，无新运行依赖或服务费用；没有直接适用于本项目多组材料规则的成品实现。

| 方案 | 结论 |
|---|---|
| 编辑页 onHide 直接清理 | 页面隐藏也可能由临时切后台产生，会影响选择材料中的组，排除 |
| 只在报销列表视觉上隐藏空组 | 生成、排序、历史项目数仍可能读取原始空组，需要多处重复修正，排除 |
| 只在 onUnload 清理 | 需另补“保存并添加下一项”及旧记录恢复路径，单独使用覆盖不足 |
| 报销列表显示时统一清理，连续添加复用空组（采用） | 仓库中统一判断并保存清理后的组；兼顾系统返回、页面按钮、旧记录恢复、排序与生成，保留部分填写的草稿 |

增加导入中的组 ID 登记，确保极端情况下用户离开编辑页时正在选择／复制材料的组仍被保留。原始文件、上次导出和备份保留；对手机实际页面生命周期行为继续通过 Android 验证。
