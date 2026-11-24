/** 前端适配层：四角工具实现在 @aeolus/shared。 */
import { prDefaultCorners, prMoveCorner, prIsValidQuad } from '@aeolus/shared';
import type { Point, Size } from './types';

export function defaultCorners(size: Size): Point[] {
  return prDefaultCorners(size);
}

export function moveCorner(corners: Point[], index: number, next: Point, size: Size): Point[] {
  return prMoveCorner(corners, index, next, size);
}

export function isValidQuad(corners: Point[]): boolean {
  return prIsValidQuad(corners);
}
