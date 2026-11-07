Flock & Flick — 正式游戏工程（A1–A4）

本目录保留 stack-starter-v2 名称，已从技术原型扩展为正式游戏。
先阅读 GAME-HANDOFF.md 和仓库 tasks/records/A-Part-20261107.md。

Windows 快速启动：在仓库根目录双击 Start-Game.cmd。
开发版：Start-Game.cmd --dev。
本机已准备 .local/node24；其他机器使用 Node 24.x。

标准命令（在本目录执行）：
  npm.cmd ci
  npm.cmd run doctor
  npm.cmd run check:vendor
  npm.cmd run typecheck
  npm.cmd test
  npm.cmd run build
  npm.cmd run preview

正式游戏：http://127.0.0.1:4173/
游戏联调台：http://127.0.0.1:4173/dev/game.html
原八球与视觉原型：http://127.0.0.1:4173/dev/stack.html
开发服务器 npm.cmd run dev 使用相同路径，端口 5173。

按 1/2 选球，鼠标或左右键瞄准，滚轮或上下键调力度。
Enter 锁定，Space 发射，Esc 取消；点击画布恢复键盘焦点。
五关、双人八投、排斥球与完整键鼠已实现。
B 的真实手套控制器、校准与现场性能仍待接入和验收。

不提交 node_modules、dist、public/generated、.local 或 test-results。
不要直接双击 index.html；游戏必须通过本地服务运行。
