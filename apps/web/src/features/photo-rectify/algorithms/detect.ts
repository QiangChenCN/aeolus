/**
 * 前端适配层：实际检测算法在 @aeolus/shared（与 NestJS 后端同一份实现）。
 * 保留旧文件名与导出签名，避免 Worker / 测试调用点大规模改动。
 */
import { prDetectQuad, prOrderCorners, prQuadMetrics } from '@aeolus/shared';
import type { DetectionResult, Point, RgbaImage } from './types';

export function detectCorners(img: RgbaImage, fast = false): DetectionResult {
  const r = prDetectQuad(img, { fast });
  return {
    ok: r.ok,
    corners: r.corners,
    warn: r.warn,
    maxDeviation: r.maxDeviation,
    score: r.areaFrac,
    reason: r.reason,
  };
}

export function orderQuad(points: Point[]): Point[] {
  return prOrderCorners(points);
}

export function maxAngleDeviation(quad: Point[]): number {
  return prQuadMetrics(quad).dev;
}
