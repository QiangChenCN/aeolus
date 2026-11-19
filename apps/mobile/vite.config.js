import { defineConfig } from 'vite';
import uniPlugin from '@dcloudio/vite-plugin-uni';
import ComponentsPlugin from '@uni-helper/vite-plugin-uni-components';
import { WotResolver } from '@uni-helper/vite-plugin-uni-components/resolvers';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/mobile
const SHARED = resolve(HERE, '..', 'shared');
const ROOT = resolve(HERE, '..', '..');

// 插件为 CJS 导出，ESM 下 default 可能包一层，做兼容
const uni = typeof uniPlugin === 'function' ? uniPlugin : uniPlugin.default;
const Components = typeof ComponentsPlugin === 'function' ? ComponentsPlugin : ComponentsPlugin.default;

export default defineConfig({
  plugins: [
    uni(),
    Components({ resolvers: [WotResolver()] }),
  ],
  resolve: {
    alias: {
      // 设计令牌 / 主题样式与公共代码模块为跨应用共享资产
      '@shared-ui': SHARED,
      '@shared': resolve(SHARED, 'src'),
    },
  },
  // uni-app 的 src 目录约定
  root: HERE,
  server: {
    fs: { allow: [ROOT] },
  },
});
