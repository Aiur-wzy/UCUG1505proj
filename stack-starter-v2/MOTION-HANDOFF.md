# B 初步开发与交接

2026-11-08。基于 A 的 `game-work` 提交 `e2deeaf`，本地开发分支 `motion-work`。本版交付 B1–B3 的混合输入基线：**双手套选球、实时方向与力度、键鼠锁定/发射/取消**。真实手套、现场光照和完整体感双人对局尚未验收。

## 1. 启动和体验

使用 Node 24。在仓库根目录双击 `Start-Game.cmd`，等构建完成后打开：

- 独立实验室：<http://127.0.0.1:4173/dev/motion.html>。
- 游戏：<http://127.0.0.1:4173/>，菜单输入方式选择手套；进入后在下方相机面板选择输入源。
- 游戏联调台：<http://127.0.0.1:4173/dev/game.html>。

开发服务器使用 `Start-Game.cmd --dev`，地址中的端口改为 `5173`。改 Worker 源码时另开终端运行 `npm.cmd run watch:worker`；生产预览需要重新 `npm.cmd run build`。页面已打开时，构建后刷新页面加载新模块。

### 不用摄像头的第一轮调试

1. 打开实验室，选择“一绿一红”或“两只绿色”，点击“启动模拟画面”。需要检查 A/B 档案时，在启动输入源前勾选“也校准玩家 B”。
2. 模拟画面就是一个带噪声背景的假摄像头窗口，可以拖动两块色块，也可用滑杆调整角度、距离、中点、噪声与亮度。遮挡和大干扰块开关用于检查失效处理。
3. 完成三步校准：先用水平连线、距离约 100 记录中立姿势；距离调到约 50 记录近距离；距离调到约 180 记录远距离。每次点对应按钮后保持约 1 秒。
4. 转动、拉开色块，检查方向读数和力度。如果方向与自己的转动习惯相反，勾选“反转转动方向”；确认方向和力度后保存。
5. 回到近距离，保持双手可见并等待就绪。中点在球槽中停留 600ms 选球。之后转动改变角度、拉开改变力度，预览随有效样本更新。
6. 实验室右侧按钮模拟键鼠锁定、发射、取消；“下一投”仅模拟结算阶段，不运行游戏物理。正式游戏里点击场地恢复焦点，再按 Enter、Space、Esc，或使用原有按钮。

模拟窗口实际生成 RGBA 像素，经过 `createImageBitmap → 同一 OpenCV Worker → 候选 → 追踪/校准/平滑 → host`。不会直接伪造坐标或跳过颜色算法。它能验证软件链路，但不能代替真实相机的曝光、运动模糊、遮挡及背景测试。

### 使用真实手套

正对摄像头，在预览内保持两只手可见。红绿模式先将绿色放在镜像预览左侧、红色放在右侧。点击“启动摄像头”后由本人处理权限，再按自然水平、舒适近距、舒适远距依次校准。双人分别采样，档案仅存当前页面内存。

若绿色/红色没有稳定识别，展开“颜色阈值与取色”，点击取色按钮后点手套中央，避免高光和背景。也可手动调整色相、容差、最低饱和度/亮度。修改颜色配置会作废现有档案并打开当前玩家校准；另一位玩家也需重新记录。面板中的“重新校准当前玩家（保留颜色）”可保留调好的颜色。游戏外层“重新校准”/实验室“重开输入会话”会完整重启输入源，回到默认红绿配置。

第一轮优先使用红绿，因为颜色能够区分两只手。双绿使用两个独立连通域和位置关联，只在镜像画面里左右可分时有效；不区分解剖学左右手。合并、交叉、近乎竖直或同色多候选无法判定时暂停输入，重新分开并回到近距离确认。不能宣称双绿能在完全遮挡后保持同一只手的身份。

## 2. 文件与职责

| 文件 | 职责 |
| --- | --- |
| `src/motion/vision.worker.ts` | 本地 OpenCV、HSV、跨 0° 红色掩码、开运算、连通域；相同绿色仅计算一次掩码 |
| `visionClient.ts`、`frameGate.ts` | 摄像头/模拟图采样、唯一在途帧、配置确认、完整帧身份与时效、看门狗和资源关闭 |
| `colors.ts` | 红绿/双绿配置、环形色相取色、双色可分性检查 |
| `tracking.ts` | 单次镜像、候选关联、双绿去重配对、歧义/缺手/跳变拒绝 |
| `calibration.ts`、`mapping.ts`、`smoothing.ts`、`types.ts` | 每位玩家档案、向量映射、时间滤波和重新就绪锁存 |
| `gestures.ts` | 600ms 中点停留选球、最多 20Hz 连续预览；不生成体感确认动作 |
| `controller.ts` | `createMotionController()`，公开四方法及 report → submit 顺序；不导入 Phaser |
| `ui/calibrationPanel.ts`、`ui/motion.css` | B 在 `host.cameraMount` 内的面板、画面叠加、校准、取色 |
| `dev/synthetic.ts`、`dev/mockHost.ts`、`dev/main.ts` | 可控像素场景、独立合同调试、状态与回执；不实现游戏物理 |
| `tests/motion/` | 帧、异步生命周期、追踪、校准、映射、平滑、就绪与手势测试 |
| `scripts/motion-browser-check.mjs` | 真 Worker / 模拟图像 / video MediaStream / 实际游戏接入验收 |

表内未写目录的 `.ts` 文件均位于 `src/motion/`。唯一构建接线是 `vite.config.ts` 新增 `dev/motion.html` 输入。公共合同、`interface-v1.1/` 镜像、依赖和锁文件未改变；A 的 `MotionBridge` 自动发现 B 工厂。

## 3. 对 A 的合同

继续使用公共协议 **1.1** 与 Worker **1.0**。

```ts
createMotionController(): MotionController
// setContext(context) 可先于 start。
// start(host) 创建输入面板，用户选择源后启动；相机/Worker 可读后完成。
// calibrate(playerId) 等待该玩家三步采样与方向确认。
// stop() 结束 pending 启动/校准、关闭媒体轨道、Worker 和监听。
```

- B 只发送 `SELECT_BALL`、`PREVIEW_SHOT`。`ARM_SHOT`、`FIRE`、`CANCEL_SHOT` 的体感手势尚未实现，即使 host 宣告可选动作也不生成它们。键鼠五种指令仍由 A 的原有逻辑处理。
- 向量是 `guide − anchor`。镜像坐标为 `u=1−x/W`、`v=y/W`，两轴共用宽度 W。先平滑质心，再计算角度与距离。
- `theta=atan2(-dy,dx)`；瞄准是校准中立角度的有符号差，按 host 限幅（当前 −90°…+90°）。`r=clamp((d-dClose)/(dFar-dClose),0,1)`，`power=clamp((r-0.30)/0.70,0,1)`。近距保留选球/就绪区间。
- 启动、失效或换 session/turn/player/source 后，连续有效 500ms，再近距离 500ms，才重新就绪。普通 phase/contextId 和 motion gate 改变只清手势候选，不清就绪锁存。
- 每个样本先报告反馈。若 report 导致 contextId 改变，该样本停止提交，等新身份帧；不刷新旧样本的时间戳。
- 方向、力度同一帧同时计算。实时预览不等待稳定，锁定后参数仍由 A 保存。收手或移动不会改写已锁定值。
- 一帧在途包含异步 bitmap 创建。旧代/旧配置/旧身份/旧时刻的结果不能更新反馈；匹配的旧语义帧仍释放自己的在途槽。停止后才完成的 bitmap/MediaStream 被关闭。

## 4. 本版参数与差异

共用 defaults 中 320×240、20Hz、90ms 平滑、250ms 输入有效期、1s 单帧看门狗、15s 初始化超时。

B 内部首版参数：手套中心最小距离 `0.055W`；双绿水平间隔至少 `0.035W`；两个历史配对总距离评分相差小于 `0.04W` 视为歧义。校准样本要求连续 1s、至少 8 帧，距离峰峰值不超过 `0.035W`、角度峰峰值不超过 12°。这些是待真实手套调参的初值，并非实测最优值。

双绿是本轮用户新增需求，因此覆盖 B2 旧卡“两个颜色必须可分”的单一前提。红绿仍检查色相间隔；双绿显式走同色双连通域分支，不能将同一色块识别两遍后充当两只手。

## 5. 验证与继续开发

```powershell
npm.cmd run check:vendor
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

浏览器脚本单独使用 `playwright-core`，不加入产品锁文件。沿用 A 浏览器脚本的 `FLOCK_PLAYWRIGHT`、`FLOCK_BROWSER`、`FLOCK_TEST_URL`、`FLOCK_TEST_OUTPUT` 环境变量后运行：

```powershell
node scripts/motion-browser-check.mjs
node scripts/browser-check.mjs
```

首次自动验收记录见 [B 初步验收](../tasks/records/B-initial-20261108.md)。模拟颜色帧实际执行 WASM，另用合成 MediaStream 检查 video 播放/采集/关闭；权限拒绝由测试替身模拟。没有访问本人的物理摄像头。

下一阶段：真实红绿/双绿手套在现场光照下调阈值、站位、移动速度与滤波；测实际延迟与稳定性；完成两场真实体感双人局；最后再分别决定是否实现体感锁定、释放、取消。不要将本版模拟通过记为 B1/B2/J1 的真人验收完成。
