# Flock and Flick

UCUG1505 Creative Coding 最终项目：受冰壶启发的体感小鸟球游戏。计划支持单人关卡、本地双人轮流对抗，以及共用同一游戏规则的键鼠与双色手套输入。

**当前仓库是开发规范、任务卡和可运行的技术验证工程，完整游戏仍待实现。**

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
| `stack-starter-v2/` | 当前可运行的技术验证工程，也是后续正式开发的起点 |
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

浏览器打开 <http://127.0.0.1:5173/>，先检查八球物理、键盘预览和 OpenCV 合成图。Enter 锁定、Space 发射、Esc 取消。真实摄像头需要本人在浏览器授权。

macOS/Linux 使用 `npm` 替代 `npm.cmd`。每台电脑在本机安装依赖，不复制 node_modules。

## 验证与构建

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

构建预览地址为 <http://127.0.0.1:4173/>。开发服务器和构建版都需要验证。B 修改 Worker 时，在另一终端运行 `npm.cmd run watch:worker`，保存后刷新页面。

已有验证记录见 [2026-11-07 技术验证记录](stack-starter-v2/验证记录-20261107.txt)。其中只有七个计分样例已实现为自动测试；fixtures 中的其他场景是正式开发需要满足的预期，不能据此声称已通过。

正式菜单、回合/库存、双模式、完整命令接收器、玩家校准与手势仍需按任务卡开发。真实手套、光照、目标机器性能和现场体验须单独验收。

## 两人如何开始

A 从 [A1](tasks/A1-状态与命令接收器.md) 开始，B 从 [B1](tasks/B1-相机与颜色Worker.md) 开始。优先让普通球与默认手套输入跑通，再进行 [J1 首次联调](tasks/J1-混合输入与现场验收.md)。

运行库和素材由本地项目提供；OpenCV 的来源、许可证与 SHA-256 保留在 `stack-starter-v2/public/vendor/opencv/`。仓库不包含依赖安装目录、构建产物、旧版交接文件或课程周资料。
