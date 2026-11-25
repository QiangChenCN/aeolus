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

/** 仓库 / 产品统一名（跨端保持一致，避免各处硬编码）。 */
export const AEOLUS_MONOREPO_NAME = 'aeolus' as const;

/** Promise 化的 setTimeout，跨端通用的「等待」工具。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 简单问候（示例导出，便于验证跨包引用）。 */
export function greet(scope: string): string {
  return `[${AEOLUS_MONOREPO_NAME}] hello from ${scope}`;
}

/** 全项目唯一取数字段映射字典（运单 + 违规处罚），前后端共用。 */
export * from './field-map.js';

/** 证件照透视矫正公共算法（前端 Worker 与 NestJS 后端共用同一份实现）。 */
export * from './photo-rectify/index.js';
