import { useAuthStore } from '../stores/auth.js';

/**
 * v-perm：按钮/片段级权限收敛（体验层；后端 AccessGuard 才是真正的安全边界）。
 *
 * 用法：
 *   <el-button v-perm="'data:refresh'">刷新</el-button>
 *   <el-button v-perm="['task:run', 'admin:users']">任一权限即可见</el-button>
 *
 * 无权限时直接从 DOM 移除元素（而非 display:none），避免开发者工具里残留可点控件。
 * 路由守卫会 await auth.bootstrap()，因此指令执行时权限集已就绪。
 */
function apply(el, binding) {
  const auth = useAuthStore();
  const required = Array.isArray(binding.value) ? binding.value : [binding.value];
  const allowed = required.some((p) => auth.hasPerm(p));
  if (!allowed) el.parentNode?.removeChild(el);
}

export const permission = {
  mounted: apply,
};
