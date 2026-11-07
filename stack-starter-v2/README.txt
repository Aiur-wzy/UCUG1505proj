Flock & Flick — 正式游戏工程（A1–A4）

本目录保留 stack-starter-v2 名称，已从技术原型扩展为正式游戏。
先阅读 GAME-HANDOFF.md、仓库 游戏规则变更-v2.4.md 和 tasks/records/Rules-v2.4-20261107.md。

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

按 1/2/3/4 选球，鼠标或左右键瞄准，滚轮或上下键调力度。
Enter 锁定，Space 发射，Esc 取消；点击画布恢复键盘焦点。
五关、双人八投、普通/排斥/吸引/粘黏四种球与完整键鼠已实现；每人每种各 1 只。
场地上/左/右三面反弹墙，底边开放；方形计分；角度 −90°～+90°；最大初速度 35，默认力度 11%，滑行和碰墙损耗降低。
特殊效果只在自己的发射轮次内有效，轮次结束即失效；排斥力度与吸引一致；两者释放效果期间固定原位，结束后恢复普通碰撞。
四种球低速碰墙均反弹；粘黏组合按单球总质量与滑行衰减处理，粘上时不再减半速度。
正式游戏隐藏落点预测。联调页右侧顶部可勾选“调试：显示预计轨迹与落点”，默认关闭。
B 的真实手套控制器、校准与现场性能仍待接入和验收。

不提交 node_modules、dist、public/generated、.local 或 test-results。
不要直接双击 index.html；游戏必须通过本地服务运行。
