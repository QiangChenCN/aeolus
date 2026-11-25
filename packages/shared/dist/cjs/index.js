"use strict";
/**
 * @aeolus/shared —— 跨应用共享代码包。
 *
 * apps/api（NestJS 后端）与 apps/web（Vue 前端）的公共常量 / 工具在此定义，
 * 以 workspace 依赖（"@aeolus/shared": "workspace:*"）方式被两者引用，避免重复定义与漂移。
 *
 * 接入方式（在 apps/api 或 apps/web 的 package.json 中）：
 *   "dependencies": { "@aeolus/shared": "workspace:*" }
 * 然后：
 *   import { AEOLUS_MONOREPO_NAME, sleep } from '@aeolus/shared';
 *
 * 本包以 CommonJS 产物（dist/index.js + .d.ts）对外，NestJS（CJS）与 Vite（CJS 互操作）均可直接消费。
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AEOLUS_MONOREPO_NAME = void 0;
exports.sleep = sleep;
exports.greet = greet;
/** 仓库 / 产品统一名（跨端保持一致，避免各处硬编码）。 */
exports.AEOLUS_MONOREPO_NAME = 'aeolus';
/** Promise 化的 setTimeout，跨端通用的「等待」工具。 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** 简单问候（示例导出，便于验证跨包引用）。 */
function greet(scope) {
    return `[${exports.AEOLUS_MONOREPO_NAME}] hello from ${scope}`;
}
/** 全项目唯一取数字段映射字典（运单 + 违规处罚），前后端共用。 */
__exportStar(require("./field-map.js"), exports);
/** 证件照透视矫正公共算法（前端 Worker 与 NestJS 后端共用同一份实现）。 */
__exportStar(require("./photo-rectify/index.js"), exports);
//# sourceMappingURL=index.js.map