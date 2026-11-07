# 游戏侧 A1–A4 交接

2026-11-07，规则 v2.1。A 部分已实现；真实手套、B 控制器和现场验收仍需 B / J1 完成。协议保持 **1.1**，Worker 保持 **1.0**，依赖和锁文件未改。按用户要求更新 defaults 和 fixtures，并同步到 `interface-v1.1`；详见 [规则变更与调参说明](../游戏规则变更-v2.1.md)。

## 启动与目录

- 仓库根目录双击 `Start-Game.cmd`：检查 Node 24、必要时安装依赖、构建并提供 `http://127.0.0.1:4173/`。本机已准备 `.local/node24`（被 Git 忽略，不修改全局 Node）。其他机器安装 Node 24 即可。`Start-Game.cmd --dev` 启动 5173 开发版。
- 或进入本目录，依次 `npm.cmd ci`、`npm.cmd run build`、`npm.cmd run preview`。这里是正式工程，目录名为兼容原仓库保留 `stack-starter-v2`。
- 正式游戏 `/`；游戏联调台 `/dev/game.html`；原八球 / OpenCV 原型 `/dev/stack.html`。三个入口均打包，可在 5173 和 4173 使用。
- `src/game/core` 是纯规则；`src/input/inputHost.ts` 拥有唯一状态；`src/game/physics` 是单个 Phaser Matter 世界；`src/game/app.ts` 组装产品界面。
- `src/motion/**`、Worker 源文件、公共合同未由 A 改写。原 `src/main.ts` 的视觉原型完整保留到 `src/dev/stackCheck.ts`，只改变了相对导入。

## 游玩

选择单人或双人。数字 1 / 2 / 3 / 4 或点击库存选球；鼠标移动 / 左右键调整方向；滚轮 / 上下键调整力度；也可以使用滑杆。Enter 锁定，Space 发射，Esc 取消。点击画布恢复游戏键盘焦点。锁定 5 秒后自动解锁；切后台自动暂停，返回后点击继续。

单人四投后按球心所在的最高方形区域计分，五关目标分别为 3、4、5、6、7。双人 A/B 交替八投，球体触及方形得分区后按距中心远近进行冰壶计分；结果页重赛交换先手。局中重新开始保持当前先手；返回首页再开双人局从 A 开始。每人普通、排斥、吸引、粘黏各 1 只，所有球用 A/B 字母和底座描边区分玩家。

上、左、右三面墙可反弹；底边开放，整只球越过底边后离场。最大初速度 26（旧版 13），最小 3，默认力度 25%。正式游戏只保留短瞄准箭头；`/dev/game.html` 右侧顶部的「调试：显示预计轨迹与落点」默认关闭，可随时切换，不修改库存、回合或投掷参数。预测包含墙壁反弹，到首次碰球截止，不预测特殊效果。

排斥球停稳后推开邻球；吸引球停稳后拉近邻球；粘黏球与首次接触的可连接球共同运动，两球停稳后解除连接。每只特殊球只触发一次；未碰球的粘黏球可正常结束回合并在之后被撞时触发。改库存统一编辑 `src/shared/defaults.json` 的 `inventory`，回合总数与标记池自动跟随；将同一修改镜像到 `interface-v1.1/defaults.json`。

声音在用户点击后解锁，可静音；声音失败不影响规则。图片、声音、字体、运行库都不依赖外部 CDN。

## B 接入点

B 创建 `src/motion/controller.ts` 并导出：

```ts
import type { MotionController } from '../shared/contract';
export function createMotionController(): MotionController {
  // B 实现 start / setContext / calibrate / stop。
}
```

`src/input/motionBridge.ts` 会在模块存在时自动启用手套选项。新增文件后重启 Vite / 重新构建。当前未接入时，正式菜单明确显示暂不可用；联调页的模拟输入不代表真实手套功能。

实际生命周期：用户点击 → host 进入 calibration → `host.onContext(c => controller.setContext(c))`（立即发布一次）→ `controller.start(host)` → `calibrate('A')`，双人再 `calibrate('B')` → 校准成功后 select。离开游戏、校准取消、页面关闭与热更新调用 stop。新会话/下一关仍使用同一控制器，通过新 context 清理旧候选并重新就绪。普通阶段变化不能误清重新就绪锁存。

host 是 `MotionHost` 的直接实现，提供 `now/getContext/submit/report/cameraMount`，另有：

| 方法 | 用途 |
| --- | --- |
| `getSnapshot()` | 深拷贝的游戏视图；修改它不会改变游戏 |
| `subscribe(fn)` | 游戏视图变化，返回取消订阅函数 |
| `onContext(fn)` | contextId 变化的同步通知，返回取消订阅函数 |
| `tick()` | 游戏每帧检查反馈与锁定超时 |
| `setPreviewSource(source)` | 显式接管；resolving 返回 false |
| `setMotionActions(actions)` | 默认仅 SELECT_BALL / PREVIEW_SHOT；完整动作供 B 以后验收 |
| `start / retry / nextLevel / menu` | 会话与模式生命周期 |

每个采样先 `report`，再读取最新 context，再 `submit`。门控恢复会发布新 context；旧反馈不能授权新 context 的命令，下一次采样要重新 report。setContext 回调内禁止递归 submit。游戏只在体感可用→不可用的边沿撤销一次锁定，持续失联不撤销键鼠主动锁定。

`submit` 返回标准回执。相同离散 commandId 与内容重试返回原回执，修改内容则 ID_REUSE。建球内部异常会回滚并抛错，不能伪造 accepted=true；调用方捕获后报告诊断，不要自动换 commandId 重发。该异常路径不扩展公共 ResultReason。

## A1 / A2 接线

`PhysicsPort.spawn(ShotRequest)` 同步成功后才扣库存。ShotRequest 含唯一 shotId、sessionId、ownerId、typeId、origin、aimDeg、power01。PhysicsWorld 只读该冻结参数，不读手套。

物理按 60 Hz、每帧最多五步推进。全部球低速保持 500ms、无 pending/active 气场且无粘黏连接后，回调 `host.completeShot(sessionId, shotId, snapshot)`；相同或旧回调不会推进新回合。离场球仍在快照中，以 `inPlay=false` 排除计分。粘黏连接在双方连续低速 200ms 后解除；离场、回滚和重开同样清理连接。20 秒仅给诊断，不强制结束。

## 可复现检查

```powershell
npm.cmd run doctor
npm.cmd run check:vendor
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

可选的浏览器测试工具独立于游戏锁文件安装，不更改产品依赖：

```powershell
npm.cmd install --prefix "$env:TEMP\flock-browser-tests" playwright-core@1.56.1 --save-exact
$env:FLOCK_PLAYWRIGHT = "$env:TEMP\flock-browser-tests\node_modules\playwright-core"
# Windows 默认使用已安装的 Edge；其他浏览器可设置 FLOCK_BROWSER 为其可执行文件。
# 先在另一终端启动 dev 或 preview。
$env:FLOCK_TEST_URL = 'http://127.0.0.1:5173'
node scripts/browser-check.mjs
$env:FLOCK_TEST_URL = 'http://127.0.0.1:4173'
$env:FLOCK_TEST_OUTPUT = 'test-results/preview'
node scripts/browser-check.mjs
```

测试启动独立、临时的无界面浏览器，不读取个人浏览器配置。正式页面验证真实按键与一次实时投掷；联调页通过真实 host 加速推进真实 Matter 世界，检验模式与效果。整局、墙壁和特殊球测试不注入位置、库存或分数。另有明确标注的底边离场物理夹具，直接生成朝下运动的球以验证开放边界，不当作合法玩家投掷。结果与截图在 `test-results`，被 Git 忽略；当前报告另存到仓库 `tasks/records/Rules-v2.1-browser-*.json`。

当前仍需真人确认：声音听感、连续现场操作与背景切换、真实相机/手套/双人校准、平均 FPS / 延迟及十分钟运行。浏览器自动化不能代替这些结论。当前验收见 [v2.1 记录](../tasks/records/Rules-v2.1-20261107.md)，初版记录保留为历史证据。
