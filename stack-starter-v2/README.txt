Flock and Flick 技术栈验证工程 v2.0

用途
这是两位开发者共用的环境起点。八球、键盘预览、OpenCV 合成图和相机候选诊断用于确认技术链。
尚未实现正式菜单/关卡、库存与回合、公共命令接收器、玩家校准、手势识别或完整双模式。
完整开发要求见开发手册 v2.0，初学者配置与另一台电脑的 AI 自查流程见技术栈配置手册 v2.0。

要求
Node 24.x LTS；桌面 Chrome 或 Edge；首次安装依赖需要网络。
固定版本：Phaser 4.2.1、TypeScript 7.0.2、Vite 8.3.6、Vitest 5.1.0。
官方 OpenCV.js 4.13.0 已附在 public/vendor/opencv，来源、许可证和哈希一并保留。
Windows 使用 npm.cmd；macOS/Linux 使用 npm，按各自系统安装相同 Node 主版本并在本机 npm ci。

Windows 启动
在此目录（含 package.json）打开终端：
node --version
npm.cmd ci
npm.cmd run doctor
npm.cmd run check:vendor
npm.cmd run typecheck
npm.cmd test
npm.cmd run dev
打开 http://127.0.0.1:5173/。Ctrl+C 停止服务器。

验证构建
npm.cmd run build
npm.cmd run preview
打开 http://127.0.0.1:4173/，重复检查合成图和键盘。
构建出现 500 kB 体积提醒不等于失败；看退出状态与页面实际结果。

Worker 开发
src/motion/vision.worker.ts 由 scripts/build-worker.mjs 单独构建为 classic IIFE 脚本。
dev/build 自动预构建；B 修改 Worker 时另开终端运行 npm.cmd run watch:worker，保存后刷新页面。
不要手工修改 public/generated，不要直接把 TS Worker 当作 classic 脚本加载。
官方 OpenCV 的 Emscripten thenable 通过回调等待初始化，不能简单 await 自解析对象。

公共协议 1.1 位于 src/shared/contract.ts；内部 Worker 协议 1.0 位于 vision-worker.ts。
tests/fixtures.json 是正式项目应满足的场景，只有 scoring.test.ts 中的七个计分样例已经实现为测试。
相机授权由本人操作；真手套、现场光照与延迟必须另行验证。
本目录不会自行更新系统 Node，也不包含 node_modules 的跨电脑副本。
