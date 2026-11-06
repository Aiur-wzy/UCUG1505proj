# Flock and Flick 技术栈配置手册

> Markdown 正文同步自同名 Word 手册 v2.0。新增的同步说明和目录只帮助导航，不改变开发要求。字段类型请同时阅读 `interface-v1.1/contract.ts` 和 `vision-worker.ts`；参数见 `defaults.json`，验收样例见 `fixtures.json`。发现文字与附件不一致时先核对并同步修订，不能自行猜测。

> [Word 版](Flock-and-Flick-技术栈配置手册-v2.0.docx) · [Agent 交接入口](AGENT-交接说明-v2.0.md)

## 目录

- [01 选择适合你的配置路径](#01-选择适合你的配置路径)
- [02 每个工具负责什么](#02-每个工具负责什么)
- [03 当前电脑的已知状态](#03-当前电脑的已知状态)
- [04 另一位开发者的电脑自查](#04-另一位开发者的电脑自查)
- [05 安装或补齐基础工具](#05-安装或补齐基础工具)
- [06 解压项目与安装依赖](#06-解压项目与安装依赖)
- [07 熟悉目录与常用命令](#07-熟悉目录与常用命令)
- [08 验证 Phaser 物理与类型检查](#08-验证-phaser-物理与类型检查)
- [09 验证 OpenCV 与 Worker](#09-验证-opencv-与-worker)
- [10 摄像头与真实环境检查](#10-摄像头与真实环境检查)
- [11 两人如何保持同一环境](#11-两人如何保持同一环境)
- [12 构建 展示与离线准备](#12-构建-展示与离线准备)
- [13 常见故障与处理顺序](#13-常见故障与处理顺序)
- [14 可直接交给另一位开发者的 AI](#14-可直接交给另一位开发者的-ai)
- [15 配置记录与资料入口](#15-配置记录与资料入口)

两位开发者的环境自查与启动指南

版本 2.0    2026年11月7日    配套开发手册 v2.0

这份手册帮助两位开发者把同一个项目在各自电脑上运行起来。即使不熟悉 Node、TypeScript 或 Phaser，也可以按步骤检查工具、安装项目依赖、启动验证页面，再开始正式开发。每一步都给出预期结果与常见失败原因。

## 01 选择适合你的配置路径

| **读者** | **开始位置** | **最终需要完成** |
| --- | --- | --- |
| 当前电脑的使用者 | 第3节已有状态，再执行第5至10节 | 升级不符合基线的 Node，启动现有配置包。 |
| 另一位开发者 | 第4节独立自查，再执行第5至10节 | 确认自己的系统、已有工具和缺项；不得照搬别人电脑的状态。 |
| 协助配置的 AI | 第14节任务说明 | 只报告实际检查到的证据；配置后交回第15节记录。 |

### 成功后你应看到什么

浏览器中的技术验证页有八个圆球；键盘可以改变预览并锁定、发射、取消。点击合成图测试后，Worker 返回青色与品红色矩形的两个候选中心。随后由本人允许摄像头，再检查真实图像读取。

这只说明环境链路能够工作。正式游戏的菜单、关卡、库存、双人计分、完整命令接收器、玩家校准和手势识别，仍需按开发手册实现。配置通过不能替代真实手套的验收。

### 先理解三个位置

终端用于输入命令；编辑器用于打开和修改源文件；浏览器用于运行游戏。多数命令必须在含有 package.json 的 stack-starter-v2 目录执行。不要把浏览器地址当作文件夹路径，也不要双击 index.html 代替本地服务器。

## 02 每个工具负责什么

| **工具** | **你可以如何理解** | **本项目版本** |
| --- | --- | --- |
| Node.js 与 npm | Node 运行开发工具；npm 下载项目依赖和执行 scripts。游戏运行在浏览器。 | Node 24.x LTS |
| TypeScript | 带类型检查的 JavaScript；检查两人接口与参数。 | 7.0.2 |
| Vite | 提供本地开发网址，处理导入、资源与打包。 | 8.3.6 |
| Phaser | 游戏框架，组织场景、图形、输入、声音和物理集成。 | 4.2.1 |
| Matter | Phaser 已包含的二维物理系统；负责球的运动与碰撞。 | 随 Phaser 固定 |
| OpenCV.js | 在浏览器执行颜色处理的 WASM 运行库。 | 官方 4.13.0 |
| Web Worker | 浏览器后台线程；承载图像计算。它不是另一台服务器。 | 浏览器内置 |
| Vitest | 自动检查计分等规则；不代替真人摄像头试验。 | 5.1.0 |

工具版本已固定在 package.json，间接依赖由 package-lock.json 记录。@types/node 24.10.0 只供开发时类型检查。两人都使用 Node 24.x；本次配置验证采用 24.22.1。\[1\]\[2\]

OpenCV.js 的 WASM 随官方构建提供，本工程已放入 public/vendor/opencv。无需安装 Python 的 opencv-python、C++ 编译器、CUDA 或原生 OpenCV SDK。不要把 pip 安装当成浏览器依赖安装。\[3\]

第一版用 Phaser、HTML 和 CSS 即可完成所需界面。TypeScript 和 Vite 是开发工具，Phaser 是浏览器运行库，Worker 是浏览器能力；三者不是互相替代的选项。

## 03 当前电脑的已知状态

以下是本次在当前 Windows 工作区读取到的状态，仅适用于这台电脑。另一位开发者必须重新自查，不能把本表当作自己的结果。工具可能在之后更新；执行命令时以新的输出为准。

| **项目** | **读取到的状态** | **处理方式** |
| --- | --- | --- |
| Node.js | v22.4.1，位于 C:\\Program Files\\nodejs | 升级到本项目采用的 24.x LTS。 |
| npm | 10.8.1，随当前 Node 安装 | 随新 Node 的安装更新，再记录实际版本。 |
| Git | 已找到 C:\\Program Files\\Git\\cmd\\git.exe | 运行 git --version 确认可调用。 |
| VS Code | 已找到用户目录中的 code.cmd | 打开项目文件夹即可。 |
| 浏览器与摄像头 | 尚未据此表确认真实摄像头效果 | 按第10节由本人授权并验证。 |

Vite 当前要求 Node 20.19+ 或 22.12+；本项目另将基线统一为 24.x。22.4.1 小于 22.12，不能因为同属 Node 22 就认为符合要求。升级是为了满足工具兼容范围。\[2\]

### 升级后的复查

```powershell
node --version
npm.cmd --version
where.exe node
where.exe npm
```

预期 node 显示 v24 开头。若仍显示 v22，完全关闭并重新打开 VS Code 与终端，再执行。where.exe 若列出多个 Node 路径，先确认当前命中哪一个；不要直接删除未知目录。

本次作者验证配置包时使用了独立的 Node 24.22.1 运行时，没有替你修改全局 Node 安装。你的终端仍需按上述步骤升级和自查。

## 04 另一位开发者的电脑自查

先记录操作系统、CPU 架构、现有 Node、npm、Git、编辑器和浏览器。AI 应读取当前机器的实际输出，缺少的工具标为未安装或未发现，不推测版本。

### Windows 第一次检查

```powershell
Get-Command node,npm.cmd,git,code -ErrorAction SilentlyContinue |
  Select-Object Name,Source
node --version
npm.cmd --version
git --version
```

某条命令不存在时，记录该项缺失并继续检查其他项目。Node 不存在时还不能运行项目里的 doctor 脚本；先按第5节安装。Node 版本已经为 24.x 时，无需为了照抄另一台电脑而重装。

### 项目到手后的只读报告

```powershell
node scripts/doctor.mjs
```

脚本不安装软件、不修改系统配置。它输出系统与架构、Node 路径、npm/Git 版本、锁文件哈希、依赖是否匹配及 OpenCV 完整性。依赖尚未安装时 installed 为 null 属正常现象；npm ci 后再运行一次。

把报告保存在自己的配置记录中。两人重点对照：Node 主版本、项目直接依赖、package-lock.json 的 SHA-256，以及 OpenCV 校验是否 PASS。个人路径不同不属于错误。

### 脚本不能判定的内容

相机是否正被其他应用占用、浏览器是否拒绝权限、现场手套是否可见、光照与人体动作是否合适，需要本人操作并反馈。AI 可指导和读取报错，但没有观察到结果时必须写“待人工确认”。

若检测到 macOS 或 Linux，执行 node --version、npm --version、git --version；不要照搬 Windows 的 npm.cmd、where.exe 或安装路径。固定依赖版本仍相同。

## 05 安装或补齐基础工具

### Node 24 LTS

进入 Node.js 官方下载页，选择 24.x LTS 分支和当前系统、处理器架构。Windows 常见为 x64 MSI；ARM 电脑选择对应架构。按安装器完成 Node 与 npm 的安装，再重开终端。不要把网页默认展示的其他主版本直接当作本项目版本。\[1\]

[Node.js 官方下载](<https://nodejs.org/en/download>)

已有其他项目依赖旧 Node 时，先记录其需求，可使用团队已经熟悉的版本管理器并将本项目切到 24.x。初学者只有一个 Node 环境时，官方安装器是较直观的路径。本手册不要求额外安装版本管理器。

### 编辑器 Git 与浏览器

安装或使用已有 VS Code；TypeScript 支持已内置，首版不要求安装大量扩展。Git 用于两人同步代码；Chrome 或 Edge 用于浏览器验证。工具存在且能运行时直接复用。\[4\]\[5\]

[Visual Studio Code 官方下载](<https://code.visualstudio.com/download>)

[Git 官方安装说明](<https://git-scm.com/install/>)

### 其他操作系统

macOS 选择官方对应架构的 Node 24 安装包；Linux 按官方安装入口或现有版本管理方式选择 Node 24。命令中的 npm.cmd 改为 npm，路径换成本机路径。不要把 Windows 的 node\_modules 复制到另一系统；在本机执行 npm ci，让平台依赖重新安装。

### 通过条件

```powershell
node --version
npm.cmd --version
git --version
```

Node 应为 v24.x，npm 和 Git 应返回版本号。此时只是基础工具就绪，还没有下载 Phaser 等项目依赖。若命令找不到，优先重新打开终端并检查 PATH，不要先修改 PowerShell 的系统执行策略。

## 06 解压项目与安装依赖

配套 ZIP 包含 stack-starter-v2 和 interface-v1.1。将它解压到自己的开发目录。当前工作区已有解压目录；另一位开发者可选 C:\\Projects\\FlockAndFlick。后续命令进入 stack-starter-v2 执行。

### 打开正确的文件夹

在 VS Code 选择 File → Open Folder，打开 stack-starter-v2；再选择 Terminal → New Terminal。资源管理器右键在终端打开同一文件夹也可以。

```powershell
Get-Location
Test-Path .\package.json
Test-Path .\package-lock.json
```

后两行均应输出 True。若为 False，通常是打开了解压包的外层或其他目录。找到同时含这两个文件的文件夹后再继续。

### 安装固定依赖

```powershell
npm.cmd ci
npm.cmd run doctor
npm.cmd run check:vendor
```

npm ci 按锁文件安装依赖，会重建当前项目的 node\_modules。首次安装需要访问 npm 仓库；不会创建全局 Phaser 安装，也不会升级系统 Node。成功后 doctor 中各直接依赖应 match=true，OpenCV 应为 PASS。\[6\]

本工程已带官方 OpenCV 浏览器文件，无需单独联网下载视觉库。manifest.json 保存来源与 SHA-256。check:vendor 校验失败时，从同一配套包恢复文件；不要把网页错误响应另存为 opencv.js。

### 先保持依赖一致

A 维护 package.json 与 package-lock.json。B 得到项目后运行 npm ci。需要增加依赖时先协商，由 A 固定版本并提交两个文件；不通过删除锁文件或改为 latest 来解决安装问题。

## 07 熟悉目录与常用命令

| **文件或目录** | **作用** | **初学阶段怎么处理** |
| --- | --- | --- |
| package.json | 版本、依赖和可执行脚本 | 阅读 scripts，按手册运行。 |
| package-lock.json | 完整依赖版本树 | 双方同步，交由 npm 管理。 |
| src/ | TypeScript 源码 | 正式开发主要修改这里。 |
| public/ | 按原路径复制的静态资源 | OpenCV、图片和音频放在这里。 |
| tests/ | Vitest 与固定样例 | 验证可独立计算的规则。 |
| tsconfig.\*.json | 类型检查边界 | 主线程、Worker、工具各一份。 |
| node\_modules/ | 本机安装的依赖 | 由 npm ci 生成，不手动编辑或提交。 |
| dist/ | 构建后的浏览器文件 | 由 build 生成，不修改生成物。 |

| **命令** | **作用** |
| --- | --- |
| npm.cmd run dev | 持续运行开发服务器；保持终端打开。 |
| npm.cmd run typecheck | 执行三套 TypeScript 检查。 |
| npm.cmd test | 运行一次规则测试并退出。 |
| npm.cmd run build | 先类型检查，再生成 dist。 |
| npm.cmd run preview | 在 4173 端口检查构建结果。 |
| npm.cmd run doctor | 打印只读环境报告。 |

dev 与 preview 都会持续占用终端。按 Ctrl+C 停止。需要同时运行其他命令时，在 VS Code 再开一个终端，并确认它仍位于项目根目录。

B 修改 Worker 源码时，另开终端运行 npm.cmd run watch:worker，保存后刷新页面。dev 和 build 启动时会自动预构建 Worker；public/generated 内的脚本由工具生成，不手工修改。

## 08 验证 Phaser 物理与类型检查

### 启动开发页面

```powershell
npm.cmd run dev
```

浏览器访问 http://127.0.0.1:5173/。应看到技术栈验证页面，场地内有八个圆球，文字显示 Phaser 4.2.1、Matter 和固定步长 60 Hz。若端口被占用，服务器会明确报错，不会悄悄切到别的端口。

### 完成一次键鼠检查

先点击场地，让画布获得焦点。左右键改变角度，上下键改变力度；箭头立即变化。Enter 锁定后显示“已锁定”，Space 给第一只球施加速度，Esc 解除锁定。点击“重置八球”后重新检查，避免重进场景导致键盘事件重复。

验证页的围墙和八球布局仅用于检查物理链路；正式游戏按开发手册使用出界规则。这里还没有库存、完整回合或双模式。

### 运行开发检查

```powershell
npm.cmd run typecheck
npm.cmd test
```

typecheck 应以退出码 0 完成，没有 TypeScript 错误。test 应显示七个冰壶计分边界样例通过。开发页面能显示，并不代表类型检查已经执行；Vite 默认只负责转译。\[2\]\[7\]

类型检查分开主线程 DOM、Worker 和 Node 工具环境，以避免 window、document、self 等对象混用。若修改文件后报错，先修复具体文件和行号，不要关闭 strict 或用大量 any 隐藏问题。

## 09 验证 OpenCV 与 Worker

在页面点击“测试合成图”。首次操作会加载本地 OpenCV 并初始化 Worker，正常情况下状态先显示初始化，再显示已就绪和处理结果。此步骤不请求摄像头权限。

| **观察项** | **预期结果** | **含义** |
| --- | --- | --- |
| 画面 | 青色和品红色两个矩形 | 测试输入已生成。 |
| Worker | OpenCV 4.13.0 已就绪 | 脚本和 WASM 初始化成功。 |
| 候选中心 | 约 (70,120) 与 (250,120) | 色彩转换、阈值和连通域可用。 |
| 时间 | 显示计算时间和采样至接收时间 | 传输结果可回到主线程。 |

中心出现 69.5 或 119.5 是像素中心计算的正常结果。此处成功不表示真实手套识别率已经达标；合成图没有光照变化、背景干扰、遮挡或人体动作。

### 为什么采用 classic Worker

官方 OpenCV 是 UMD 脚本，由 classic Worker 的 importScripts 加载。Worker 的 TypeScript 源码先用 Vite 单独构建为 IIFE，输出 public/generated/vision.worker.js。dev 和 build 脚本自动完成预构建；主页面仍使用 ES Modules。\[3\]\[8\]

官方构建把 WASM 放在 opencv-4.13.0.js 内，项目不需要另找 opencv.wasm。文件约 11 MB，首次加载需要等待。Worker 里读 OffscreenCanvas 像素，使用 Mat；不用依赖 DOM 的 cv.imread(video)。

### 容易遗漏的生命周期

使用后关闭 ImageBitmap；重复使用 Mat 并在停止时 delete。初始化超过 15 秒或处理超过 1 秒应给出错误并保留键鼠。正式输入仍丢弃年龄大于 250ms 的结果；一秒是故障看门狗，不是可接受的交互延迟。

## 10 摄像头与真实环境检查

点击“开启摄像头”，由本人在浏览器权限提示中选择允许。应看到当前画面和连续返回的候选结果。读取权限本身不证明手套可被可靠识别。

### 检查顺序

1 先确认视频能显示，再把青色与品红色物体分别放进画面。配置页使用示例颜色；正式项目由 B 实现取色与校准，不能要求所有手套都正好匹配默认阈值。

2 检查两色候选是否分别出现。若背景含相同颜色，可能出现多个候选，这是后续追踪筛选要处理的情况。当前配置页只展示候选，不作正式手势判断。

3 检查遮挡、走出画面和重新出现。没有看到真实结果时，AI 的配置记录必须保留“待人工确认”，不能因为程序没有报错就写识别成功。

4 点击“停止视觉”，确认视频停止、相机指示状态释放。再次启动，检查没有多路采样同时运行。关闭页面也应停止本页媒体轨道。

### 网址和权限

使用 127.0.0.1 或 localhost 本地地址。普通局域网 HTTP 地址通常不满足摄像头安全上下文要求；需要远程访问时另行配置 HTTPS。不要用 file:// 直接打开页面。\[9\]

权限被拒绝时，在浏览器地址栏的站点权限中重新允许。Windows 还需检查系统设置中摄像头访问与桌面应用权限。其他会议软件占用摄像头时先由本人确认并关闭对应占用程序。

### 性能与结论

同时观察八球和摄像头：开启识别后是否明显卡顿，结果是否延迟堆积。当前显示的是采样至接收时间，未包含真实相机曝光到显示屏的全部延迟；人体体验仍需现场测试。

## 11 两人如何保持同一环境

A 负责游戏和依赖基线，B 负责体感实现；两人都安装完整工具链，以便各自启动、调试和构建。双方可以同时请 AI 协助，但使用同一版本的手册、接口与锁文件。

| **A 的日常动作** | **B 的日常动作** | **共同约定** |
| --- | --- | --- |
| 维护游戏场景、规则、键鼠与 host | 维护 controller、Worker、校准和手势 | 五种公共命令不在各自分支里随意改名。 |
| 更新依赖并提交两个 package 文件 | 同步锁文件后 npm ci | 使用相同依赖；不共享 node\_modules。 |
| 键鼠完成局内流程 | 模拟 host 独立调试体感 | 首次联调先用手套预览加键鼠确认。 |
| 运行类型和规则测试 | 运行类型和 Worker 测试 | 合并前说明已测与未测项目。 |

### 使用 Git 时

在仓库网页复制团队实际的仓库地址，由双方在自己的电脑上克隆；本次配置包没有创建远程仓库。建立 main 作为可运行基线，游戏和体感分别使用自己的分支。

```powershell
git status
git switch -c game-work
```

上面演示 A 创建工作分支；B 可使用 motion-work。仅在已经初始化或克隆的 Git 仓库内执行。推送、合并和远程地址以团队实际仓库为准。同步前先检查未提交改动，不能用强制重置丢弃别人的工作。

### 同步哪些文件

提交 src、tests、scripts、public、package.json、package-lock.json、tsconfig、vite.config.ts、.npmrc、.nvmrc、.gitignore 与说明。保留 OpenCV 来源、许可证和哈希。node\_modules、dist、public/generated 和本机日志不提交；构建产物需要交付时单独打包。

## 12 构建 展示与离线准备

### 检查构建版

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

浏览器访问 http://127.0.0.1:4173/。重新检查八球、键盘、合成图和摄像头。开发服务与 dist 使用不同的资源提供方式，因此必须验证 build 和 preview，不能只看 dev。\[2\]

首次构建可能提示某个 JavaScript 文件超过 500 kB，这是 Phaser 随包带来的体积提醒。退出码为 0 且生成 dist 时不属于构建失败；先完成页面验证，后续再按实际加载需求优化拆包。

### 离线展示之前

在有网络时完成 npm ci，确认依赖和 OpenCV 已在本地。构建后断开外网，保留本地服务器运行，再重测。只把源码 ZIP 带到一台从未安装依赖的离线电脑上，并不能直接运行 npm 脚本。

本项目无需后端业务服务或云端视觉服务。preview 是本地预览工具，用于课程展示电脑即可；如果以后公开部署，应把 dist 交给支持 HTTPS 的静态托管服务，并单独验证权限与资源路径。

### 交给另一个人时

交源码时附锁文件、两本手册和接口包，对方按 npm ci 复现。交最终展示包时附构建产物、可用启动方式和设备条件。不要把自己电脑的绝对路径写入源码；资源路径应相对项目或构建基址。

### 退出

先停止视觉，确认本页摄像头释放，再在 dev 或 preview 的终端按 Ctrl+C。下次启动时仍进入项目根目录运行命令。

## 13 常见故障与处理顺序

| **现象** | **先检查** | **对应处理** |
| --- | --- | --- |
| node 不是内部命令 | 安装和终端是否刷新 | 安装官方 Node 24，重开终端后查路径。 |
| EBADENGINE | node --version | 切到 24.x；不要忽略 engine-strict。 |
| npm.ps1 禁止运行 | 使用的是 npm 还是 npm.cmd | PowerShell 用 npm.cmd，不改系统执行策略。 |
| 找不到 package.json | Get-Location 和 Test-Path | 进入 stack-starter-v2 根目录。 |
| npm ci 锁文件不一致 | 两个 package 文件是否同一提交 | 让依赖负责人更新并提交匹配文件，再 ci。 |
| 下载超时 | 网络与组织代理设置 | 按本机网络规则恢复访问；保留报错，不关闭 TLS 校验。 |
| 5173 或 4173 被占用 | 旧服务器是否仍开着 | 在对应终端 Ctrl+C；更换端口须同步说明。 |
| 画面黑屏 | 浏览器 Console 的第一条错误 | 先修资源路径、WebGL 或初始化错误。 |
| cv is not defined | Worker 加载与本地资源 | 运行 check:vendor；检查 READY 与 15 秒超时。 |
| importScripts 或 export 报错 | 是否直接加载了 TS 或 module Worker | 运行 prepare:worker，保持 classic Worker 加载生成脚本。 |
| 摄像头拒绝或为空 | 网址、浏览器和系统权限 | 使用本地地址，由本人检查权限或占用。 |
| 手套无候选 | 颜色阈值、尺寸和光照 | 先通过合成图；真实颜色按后续校准调整。 |
| 越运行越卡 | 在途帧、Mat 和图像释放 | 保持一帧在途，检查 close/delete 与重复监听。 |
| 只有构建版失败 | Worker、vendor 和 base 路径 | 在 preview 下看 Network 的 404 与 MIME 错误。 |

向 AI 提供完整命令、第一条错误、当前目录和 doctor 报告。优先定位具体原因；一次只改一个相关项，再运行相同检查确认结果。

## 14 可直接交给另一位开发者的 AI

将本节文字连同两本手册、interface-v1.1 和 stack-starter-v2 一起提供给对方 AI。下文是可复制的配置任务，不包含本机特定路径。

**请帮我在这台电脑上配置 Flock and Flick 项目。先阅读配套开发手册 v2.0、技术栈配置手册 v2.0、package.json 与 package-lock.json，使用其中的固定版本。我的任务是让技术验证工程可运行，并为两人并行开发做好准备。**

先做只读自查：识别操作系统和 CPU 架构，查询 Node、npm、Git、编辑器及浏览器是否存在，记录实际版本和路径。不要把另一位开发者的 Windows 状态当作我的状态。已有工具符合要求就复用；缺项、过旧或路径冲突分别列明。

确认项目根目录。若 Node 可运行，执行 node scripts/doctor.mjs；若没有 Node，先按本机平台配置 Node 24 LTS。Windows 命令使用 npm.cmd；其他系统使用 npm。避免修改系统执行策略或关闭 TLS 验证。

在我的授权范围内完成缺项配置与项目依赖安装。涉及替换全局 Node、卸载已有工具或管理员权限时，先说明具体影响并按本机授权规则处理。不要删除已有项目或覆盖未提交修改。安装项目依赖使用锁文件对应的 npm ci。

依次运行 check:vendor、typecheck、test、build，再检查 dev 和 preview 页面。观察八球、键盘调整、Enter 锁定、Space 发射、Esc 取消，以及合成图的两个候选中心。遇到报错先诊断并修复，保留可复现命令。

摄像头授权由我操作；需要真实手套、光照或身体动作时，给出简明检查步骤并等待我的观察。没有实际观察到的内容标为待人工确认。不要把合成图通过写成真实识别通过，也不要宣称完整游戏已实现。

最后输出一份配置记录：操作系统与架构、Node/npm/Git/浏览器版本、项目锁文件哈希、各检查的实际结果、启动命令、仍需人工验证的项目。若更改项目配置，说明文件与原因，并保持与另一位开发者的版本一致。

配置阶段不开始大规模实现游戏功能。正式开发时再根据开发手册领取 A 或 B 的模块，并遵守接口合同。

## 15 配置记录与资料入口

两位开发者分别保留一份记录。把“未运行”“失败”“通过”“待人工确认”区分开，附命令输出或本人观察；不要只写“已配置完成”。

| **检查项** | **应记录的证据** |
| --- | --- |
| 机器与工具 | 系统、架构、Node 路径和版本、npm/Git/浏览器版本。 |
| 依赖一致性 | doctor 的 match 字段、锁文件 SHA-256、OpenCV PASS。 |
| 静态检查 | typecheck 的退出结果；七个计分样例的测试结果。 |
| 页面检查 | dev 和 preview 的八球、键盘、合成图结果。 |
| 真实摄像头 | 本人授权、画面、示例颜色、停止和重启的观察。 |
| 现场交互 | 真实手套、校准、延迟与完整游戏验收，开发后另行完成。 |

### 官方资料

[\[1\] Node.js 支持中的发行分支与下载](<https://nodejs.org/en/about/previous-releases>)

[\[2\] Vite 启动要求与构建功能](<https://vite.dev/guide/>)

[\[3\] OpenCV.js 使用与内存管理](<https://docs.opencv.org/4.13.0/d0/d84/tutorial_js_usage.html>)

[\[4\] Visual Studio Code 下载](<https://code.visualstudio.com/download>)

[\[5\] Git 安装入口](<https://git-scm.com/install/>)

[\[6\] npm ci 的行为](<https://docs.npmjs.com/cli/v10/commands/npm-ci>)

[\[7\] Vitest 入门](<https://vitest.dev/guide/>)

[\[8\] Vite Worker 构建](<https://vite.dev/guide/features.html#web-workers>)

[\[9\] MDN 摄像头权限与安全上下文](<https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia>)

依赖版本以随包 package.json 和 package-lock.json 为准，OpenCV 来源见本地 manifest.json。网络文档会更新；查 API 时选择与本项目相同的大版本。
