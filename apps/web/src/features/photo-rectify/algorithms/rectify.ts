/** 前端适配层：透视矫正算法实现在 @aeolus/shared（前后端同源）。 */
import {
  prRectify, prInsetCorners, prPerspectiveMatrix, prInvert3, prProjectPoints,
  prOutputCorners, PR_OUTPUT_WIDTH, PR_OUTPUT_HEIGHT,
} from '@aeolus/shared';
import type { Point, RectifyOutput, RgbaImage } from './types';

export const OUTPUT_WIDTH = PR_OUTPUT_WIDTH;
export const OUTPUT_HEIGHT = PR_OUTPUT_HEIGHT;

export function outputCorners(width = OUTPUT_WIDTH, height = OUTPUT_HEIGHT): Point[] {
  return prOutputCorners(width, height);
}

export function insetCorners(corners: Point[], pixels = 6): Point[] {
  return prInsetCorners(corners, pixels);
}

export function getPerspectiveTransform(src: Point[], dst: Point[]): number[] {
  return prPerspectiveMatrix(src, dst);
}

export function invert3(matrix: number[]): number[] {
  return prInvert3(matrix);
}

export function projectPoints(matrix: number[], points: Point[]): Point[] {
  return prProjectPoints(matrix, points);
}

export function rectifyImage(img: RgbaImage, corners: Point[]): RectifyOutput {
  // 与 Python 参考脚本的 cv2.INTER_CUBIC 对齐：双三次采样让文字/边缘更锐利，
  // 避免双线性在透视放大后发虚。代价约 50ms→170ms，仍远低于一次自动检测。
  const out = prRectify(img, corners, { interpolation: 'bicubic' });
  return { width: out.width, height: out.height, data: out.data };
}
