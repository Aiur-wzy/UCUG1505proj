# B1：相机与颜色 Worker

负责人：B。状态：待实施；已有 OpenCV Worker 与合成图原型可复用。关联验收：W01、C02、P01。

## 1. 目标与范围

提供独立运行的颜色识别数据流：点击启动摄像头，后台 Worker 计算两种颜色的候选，主线程只接收身份、配置和时效均有效的结果；支持停止、重试与诊断。

本卡不判断玩家、校准角度、停留手势或发射。没有游戏时也应能运行。Worker 仅返回候选，不调用 host。

依据：[手册](../Flock-and-Flick-开发手册-v2.0.md)第 3、7、13 节；[Worker 合同](../interface-v1.1/vision-worker.ts)；[workerCases](../interface-v1.1/fixtures.json)。

## 2. 文件与交付物

| 路径 | 状态 | 内容 |
| --- | --- | --- |
| `src/motion/vision.worker.ts` | 已有，完善 | HSV/连通域、消息、资源生命周期 |
| `src/motion/visionClient.ts` | 新增 | 相机、Worker、在途帧与配置/上下文管理 |
| `src/motion/frameGate.ts` | 新增 | 可纯函数验证的身份、序号和时效检查 |
| `src/motion/dev/main.ts`、`dev/motion.html` | 新增 | 独立诊断入口；B2/B3 在此扩展 |
| `tests/motion/frameGate.test.ts` | 新增 | workerCases 与异步取消/旧帧边界 |
| `scripts/build-worker.mjs`、`public/vendor/opencv/**` | 已有，保留 | 预构建、官方文件、来源、许可与校验 |

只读并抽取现有 `src/main.ts` 的视觉原型，不直接修改 A 的主入口。需要调试 HTML 的构建入口时由 A 配置；`package.json`、锁文件和 vite 配置归 A 维护。

## 3. 数据流与实施

1. 保留 classic Worker 预构建方式，加载本地 OpenCV；不能直接把 TS 文件当 classic 脚本加载。沿用已验证的 Emscripten 初始化回调方式，避免对自解析 thenable 直接 await。
2. 摄像头仅在用户操作后申请，video 开、audio 关。等待视频可读及 Worker READY，再捕获新帧；启动中重复点击不生成第二套实例。
3. 主线程采样时记录 host.now 或由调用方注入的同域时钟；调试页用 performance.now。构造完整 FrameToken，createImageBitmap 的异步过程也占用唯一在途名额。
4. busy 时跳过采样，不积压队列。相机回调停止、Worker 被替换或 context 改变后，迟到 bitmap 关闭并丢弃；不得发给已失效实例。
5. Worker 使用 320×240 初始处理尺寸，RGBA→RGB→HSV；配置 H 度数除以 2，S/V 乘 255。跨红色边界取两段掩码并合并，3×3 开运算后输出连通域候选。
6. 候选坐标是**处理图的未镜像像素坐标**。面积和包围盒同样基于处理图；本卡不镜像、不转换成场地角度。保留多候选供 B2 判断，不把多个色块平均成一只手。
7. RESULT 校验 generation、session、context、turn、player、source、configVersion、frameId 与样本年龄。旧结果不能更新反馈或手势；正确完成当前在途请求时释放 busy，即使结果因 context 改变被丢弃。迟到旧 generation 不能清掉新请求的 busy。
8. CONFIG 变更时停送帧、递增 configVersion，等相应 CONFIGURED 后再送。不得把旧配置结果贴上新版本。普通 phase 变化只使旧语义帧失效，不负责清 B2 的重新就绪锁存。
9. 初始化、单帧看门狗与有效期分别采用 defaults 的 15 秒、1000ms、250ms 初值。看门狗并不放宽样本有效期。故障释放在途状态、终止 Worker 并提供显式重试，不循环自动重开相机。
10. 正常处理在 finally 关闭 ImageBitmap；Mat 重复使用，配置替换/停止时释放。stop 关闭媒体轨道、取消采样、递增 generation 并终止 Worker；pending 启动完成后也必须立即关闭迟到的媒体流。

内部故障信息保留实际原因：权限拒绝映射 CAMERA_DENIED，无设备为 CAMERA_MISSING，其余启动失败为 VISION_INIT_FAILED，Worker 崩溃为 WORKER_FAILED，看门狗为 FRAME_TIMEOUT。B3 将其转换为公共反馈；详细浏览器错误留在诊断信息中，不新增协议枚举。

## 4. 独立验收

诊断页地址为 `/dev/motion.html`，提供合成图、摄像头启动、停止、当前状态、候选与帧时间。不能导入正式 Phaser 游戏才启动。

| 编号 | 操作或输入 | 通过条件 |
| --- | --- | --- |
| B1-01 | 在 dev/preview 测已有青/品红矩形合成图 | 两色各一候选；中心约 (69.5,119.5)、(249.5,119.5)，误差不超过 1 像素；本步骤不申请摄像头 |
| B1-02 | 输入跨 0°色相、零候选和多个同色块的合成帧 | 红色边界正确；空帧返回空列表；多个候选分别保留，无平均假中心 |
| B1-03 | 执行 workerCases 全部样例 | 旧代、旧上下文、旧配置、重复/逆序和过期帧被拒绝；采样时间原样保留 |
| B1-04 | 故意延迟 bitmap 创建或 Worker 返回，持续请求采样 | 始终最多一帧在途，无排队；停止后旧异步完成不恢复输入 |
| B1-05 | 处理途中换 CONFIG/context，再收到旧结果 | 等匹配配置确认；旧语义结果不下发；释放对应在途状态后新帧可继续 |
| B1-06 | 模拟加载失败、初始化超时、单帧超时与 Worker 崩溃 | 产生可读故障，释放资源并可手动重试；不调用游戏发射、不造成无限重试 |
| B1-07 | 真人允许/拒绝摄像头；连续启动停止三次 | 权限由本人处理；允许后有真实视频；停止关闭本页面媒体轨道；无重复采样 |
| B1-08 | 相机启动尚未完成就停止或退出页面 | 迟到媒体流立即关闭；无旧 Worker 结果复活 |

```powershell
npm.cmd run check:vendor
npm.cmd run typecheck
npm.cmd test -- tests/motion/frameGate.test.ts
npm.cmd run dev
```

Worker 修改期间另开终端运行 `npm.cmd run watch:worker`，保存后刷新页面。preview 验证前执行 build。纯函数测试不能证明真实 Worker 初始化、相机读取或内存释放已经成功，浏览器部分须单独记录。

## 5. 完成交接

向 B2/B3 交付启动/停止、更新配置/身份、订阅有效结果与故障的入口，以及 processedWidth/Height。说明哪些 Worker 场景已自动验证、哪些需要浏览器或真人。旧示例的简化身份检查不能作为完成依据。
