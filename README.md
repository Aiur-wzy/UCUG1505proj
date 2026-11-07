# Flock and Flick

UCUG1505 Creative Coding 最终项目：受冰壶启发的体感小鸟球游戏。计划支持单人关卡、本地双人轮流对抗，以及共用同一游戏规则的键鼠与双色手套输入。

**A1–A4 游戏侧已实现：单人五关、本地双人、普通球与排斥球、完整键鼠操作和公共输入 host。B 体感控制器与真实手套联调仍待接入。**

本轮实现与验收见 [游戏交接说明](stack-starter-v2/GAME-HANDOFF.md) 和 [A Part 验收记录](tasks/records/A-Part-20261107.md)。开发在本地 `game-work` 分支，推送需由项目负责人确认。

## 直接试玩

Windows 双击仓库根目录的 `Start-Game.cmd`，然后打开 <http://127.0.0.1:4173/>。脚本构建当前代码并启动预览；本机已准备被 Git 忽略的 `.local/node24`。其他电脑先安装 Node 24。

数字 **1 / 2** 选球，鼠标或方向键瞄准，滚轮或上下键调力度，**Enter** 锁定，**Space** 发射，**Esc** 取消。也可点击界面按钮和滑杆。游戏关闭后不会上传数据。

## 阅读入口

- [Agent 交接说明](AGENT-交接说明-v2.0.md)：阅读顺序、当前完成范围与模块边界。
- [开发任务卡总览](tasks/README.md)：A1–A4 游戏侧、B1–B3 体感侧、J1 联调，以及文件归属和实施顺序。
- [验收记录模板](tasks/验收记录模板.md)：按真实结果记录自动检查、浏览器检查与真人测试。
- [开发手册 Markdown](Flock-and-Flick-开发手册-v2.0.md) · [Word 版](Flock-and-Flick-开发手册-v2.0.docx)。
- [技术栈配置手册 Markdown](Flock-and-Flick-技术栈配置手册-v2.0.md) · [Word 版](Flock-and-Flick-技术栈配置手册-v2.0.docx)。

另一位开发者可先把配置手册及 [AI 配置任务说明](stack-starter-v2/AI-配置任务说明.txt) 交给自己的 AI，按当前机器的实际状态自查，不复制他人的环境结论。

## 工程与接口

| 目录 | 用途 |
| --- | --- |
| `stack-starter-v2/` | 正式游戏工程；保留原目录名以便 B 侧继续开发 |
| `interface-v1.1/` | 公共输入合同、Worker 消息、参数与固定验收样例 |
| `tasks/` | 八张开发任务卡、任务总览与验收模板 |

技术基线：Node 24.x、TypeScript 7.0.2、Vite 8.3.6、Phaser 4.2.1（内置 Matter）、Vitest 5.1.0、官方 OpenCV.js 4.13.0。

公共输入协议为 **1.1**，Worker 内部协议为 **1.0**；两者独立版本化。依赖以 package.json 和 package-lock.json 为准，双方使用同一锁文件。

## 在 Windows 启动

先安装 Node 24.x，再克隆本仓库：

```powershell
git clone https://github.com/Aiur-wzy/UCUG1505proj.git
cd UCUG1505proj/stack-starter-v2
node --version
npm.cmd ci
npm.cmd run doctor
npm.cmd run check:vendor
npm.cmd run dev
```

浏览器打开 <http://127.0.0.1:5173/> 试玩游戏。游戏联调台为 `/dev/game.html`；原八球物理和 OpenCV 合成图在 `/dev/stack.html`。真实摄像头需要本人在浏览器授权。

macOS/Linux 使用 `npm` 替代 `npm.cmd`。每台电脑在本机安装依赖，不复制 node_modules。

## 验证与构建

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

构建预览地址为 <http://127.0.0.1:4173/>。开发服务器和构建版都需要验证。B 修改 Worker 时，在另一终端运行 `npm.cmd run watch:worker`，保存后刷新页面。

初始环境验证见 [技术验证记录](stack-starter-v2/验证记录-20261107.txt)，它是历史记录。本轮测试覆盖计分、host、混合输入、模式与物理规则，并在 dev 和 preview 的独立浏览器执行实际 Matter 验收，详细范围见 [A Part 记录](tasks/records/A-Part-20261107.md)。

玩家校准与真实手势属于 B 部分。真实手套、光照、目标机器性能和现场体验须单独验收。

## 两人如何开始

A 的当前接入说明见 [GAME-HANDOFF](stack-starter-v2/GAME-HANDOFF.md)，B 继续从 [B1](tasks/B1-相机与颜色Worker.md) 开始。使用游戏联调台验证接口，再进行 [J1 首次联调](tasks/J1-混合输入与现场验收.md)。

运行库和素材由本地项目提供；OpenCV 的来源、许可证与 SHA-256 保留在 `stack-starter-v2/public/vendor/opencv/`。仓库不包含依赖安装目录、构建产物、旧版交接文件或课程周资料。
