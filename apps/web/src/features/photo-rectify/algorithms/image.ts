/** 前端适配层：图像算子实现在 @aeolus/shared。 */
export {
  prToGray as toGray,
  prGaussianBlur5 as gaussianBlur3,
  prNormalizeContrast as normalizeContrast,
  prCanny as canny,
  prDilate3 as dilate3,
} from '@aeolus/shared';
