# 照片矫正（证件照透视矫正）

一级菜单「常用工具 → 照片矫正」对应路由 `/common-tools/photo-rectify`，页面为 `PhotoRectifyView.vue`。
原图只在浏览器内存中处理：File → ImageBitmap → canvas ImageData → Worker，原图不写盘、不上传、不进日志；离开页面时释放 Blob URL 与位图。

## 算法落点（前后端同源）

核心算法已按用户提供的 `correct_cards.py` 复刻为纯 TypeScript，放在 `@aeolus/shared` 的 `packages/shared/src/photo-rectify/`，前端 Worker 与 NestJS 后端共用同一份实现：

| 文件 | 对应 Python | 职责 |
| --- | --- | --- |
| `image.ts` | cv2.cvtColor / GaussianBlur / Canny / dilate / adaptiveThreshold / Otsu | 灰度、5×5 高斯、Canny、膨胀、积分图自适应阈值、Otsu；额外增加 5%~95% 分位拉伸兜底低对比度 |
| `contours.ts` | findContours(RETR_EXTERNAL) / approxPolyDP / contourArea / isContourConvex | Moore 外轮廓追踪、CHAIN_APPROX_SIMPLE、多边形逼近、凸四边形判定与角点排序 |
| `detect.ts` | detect_quad / _collect_contours / _is_background | 三档 Canny 候选 → 拉伸兜底 → 自适应/Otsu 兜底 → 背景过滤 → 最高分四边形；边缘直线拟合做亚像素细化 |
| `rectify.ts` | inset_quad / getPerspectiveTransform / warpPerspective | 内缩 6px、8 元方程组求单应矩阵、逆映射双线性/双三次采样 |
| `corners.ts` | — | 手动四角默认位置、拖拽约束、合法性 |

`apps/web/src/features/photo-rectify/algorithms/*.ts` 只剩薄适配层（保留旧导出签名）；`rectify.worker.ts` 把计算放进 Web Worker（原图仅 `init` transfer 一次），`engine.ts` 统一 Promise 接口，无 Worker 时回退主线程。前端传 `fast:true`（首档 Canny 命中即停）保证实时性；后端批处理走完整候选收集。`submit.ts` 是与业务原有提交通道的唯一挂载点。

## 在现有上传流程中挂载

场景 A：作为独立工具页使用——无需注册 handler，页面只显示「下载 PNG」按钮；点击后保存成品 PNG，并派发 `aeolus:rectified-png` 事件供外部监听。

场景 B：嵌入已有上传组件（例如把矫正结果作为头像/任务附件提交），在业务组件里注册一次：

```js
import { onMounted, onBeforeUnmount } from 'vue';
import { registerRectifySubmit } from '../photo-rectify/submit.ts';
import { uploadAttachment } from '@shared/api/xxx.js'; // 业务原有 API

onMounted(() => registerRectifySubmit(async (png, meta) => {
  const form = new FormData();
  form.append('file', png, `rectified-${Date.now()}.png`);
  form.append('source', meta.sourceName);
  await uploadAttachment(form); // 走原有提交通道，无需新增后端接口
}));
onBeforeUnmount(() => registerRectifySubmit(null));
```

也可直接监听事件而不注册 handler：

```js
window.addEventListener('aeolus:rectified-png', (e) => {
  e.detail.png;  // Blob, image/png, 1024×645
  e.detail.meta; // { sourceName, corners, width, height }
});
```

## 与 NestJS 后端的接口约定

### 1. 前端主流程（默认）

原图不出设备，后端不做图像处理，只接收矫正后的成品 PNG，沿用业务原有提交通道：

- 若原通道是 `multipart/form-data`：字段名 `file`，MIME `image/png`，文件名任意，固定 1024×645。
- 若原通道是 JSON（如头像 `/api/auth/avatar`）：用 `canvas.toDataURL('image/png')` 得到 data URI 后放进原有字段。

### 2. 服务端离线/批处理备选接口

`apps/api/src/modules/photo-rectify/` 新增两个端点（`@RequirePerm('view')`，登录用户可用；后端有「路由必须声明权限」的启动自检，勿删该装饰器）：

- `POST /api/photo-rectify`：单张。body `{ image: "data:image/png;base64,..." | base64, corners?, ratio?, outWidth?, height?, inset?, interpolation? }`
- `POST /api/photo-rectify/batch`：批量。body `{ images: [同上, ...] }`，最多 50 张。

响应 `{ status: 'ok'|'warn'|'manual'|'failed', message, corners, areaFrac, maxDeviation, width, height, png }`，`png` 为 1024×645 的 data URL。

PNG 编解码用 Node 内置 `node:zlib`，**不新增任何依赖**；算法与前端共用 `@aeolus/shared`。仅支持 8bit RGB/RGBA 非隔行 PNG（前端 canvas 产物即此格式），≤25MB。显式传 `ratio`（如 `85.6/54`）时高度按 `round(width/ratio)` 计算，与 Python 脚本一致；不传则用原验收标准的 645。

## 验收与自测

```bash
pnpm --filter @aeolus/shared build           # 先产出共享包 dist，前后端都依赖它
cd apps/web
pnpm test                                   # vitest：角点 <3px、映射 ±2px、噪声/纯色失败、拖拽刷新、性能
node scripts/generate-photo-rectify-fixtures.mjs  # 重新生成 3 张合成测试图
pnpm build                                  # 产物中应包含 rectify.worker-*.js
cd ../api && pnpm test -- photo-rectify      # 后端接口单测
```

单测见 `tests/unit/photo-rectify/`：

- `detect.test.js`：合成梯形 + `fixtures/trapezoid-clean.png` 角点误差 <3px；低对比度证件（灰度差 11）仍可识别；纹理背景不得误选整图边界；`noise.png` / `solid.png` 必须检测失败；角度偏差 >15° 标记 warn。
- `rectify.test.js`：单应矩阵/求逆、内缩 6px、四角映射到期望位置 ±2px、输出像素取被摄证件颜色。
- `corners-editor.test.js`：拖拽按显示比例换算原图坐标、方向键微调。
- `performance.test.js`：1920×1080 检测+矫正护栏 1200ms；单次矫正（bicubic 采样）护栏 300ms（隔离实测约 230ms / 178ms，vitest 并行 worker 会抖动）。
- 后端 `apps/api/src/modules/photo-rectify/photo-rectify.service.spec.ts`：自动检测 / 纯色失败 / 指定四角 / 缺参 4 个用例。
