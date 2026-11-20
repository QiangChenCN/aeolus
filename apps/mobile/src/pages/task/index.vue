<template>
  <view class="m-screen">
    <AuthGate>
      <scroll-view class="m-scroll" scroll-y :scroll-top="scrollTop" @scroll="onScroll">
        <view class="task-head">
          <view class="head-top">
            <view class="head-main">
              <view class="eyebrow">TASK CENTER</view>
              <view class="head-title">任务中心</view>
              <view class="head-sub">{{ taskCount }} 个自动化任务 · {{ connText }}</view>
            </view>
            <view class="head-actions">
              <view class="icon-btn" @click="reload">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                  <path d="M20 11a8 8 0 1 0-2.3 5.7" stroke-linecap="round" />
                  <path d="M20 4.5V11h-6.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </view>
            </view>
          </view>

          <view class="search-box">
            <svg class="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m15.5 15.5 5 5" stroke-linecap="round" />
            </svg>
            <input v-model="q" class="search-input" placeholder="搜索任务名称 / ID / 标签" />
            <view v-if="q" class="search-clear" @click="q = ''">×</view>
          </view>

          <scroll-view class="group-scroll" scroll-x>
            <view class="group-row">
              <view
                v-for="g in groupTabs"
                :key="g.id"
                class="group-chip"
                :class="{ active: activeGroup === g.id }"
                @click="setGroup(g.id)"
              >{{ g.name }}<text class="chip-n">{{ g.count }}</text></view>
            </view>
          </scroll-view>

          <view class="sort-row">
            <text class="sort-label">排序</text>
            <view
              v-for="s in sorts"
              :key="s.id"
              class="sort-btn"
              :class="{ active: sortBy === s.id }"
              @click="sortBy = s.id"
            >{{ s.name }}</view>
          </view>
        </view>

        <view v-if="store.loading && !store.tasks.length" class="state-block">任务加载中…</view>
        <view v-else-if="store.error && !store.tasks.length" class="state-block error">
          {{ store.error }}<text class="retry" @click="reload">重新加载</text>
        </view>
        <view v-else-if="!visibleTasks.length" class="state-block">没有匹配的任务</view>

        <view v-else class="task-list">
          <view v-for="t in visibleTasks" :key="t.id" class="task-card">
            <view class="card-main">
              <view class="task-ico" :style="iconStyle(t)"><ListIcon :name="t.group || 'task'" /></view>
              <view class="card-text">
                <view class="title-row">
                  <text class="task-title">{{ t.name }}</text>
                  <view class="status-pill" :class="stateOf(t).cls">{{ stateOf(t).txt }}</view>
                </view>
                <view class="task-desc">{{ t.desc || '暂无任务描述' }}</view>
                <view class="task-meta">
                  <text class="meta-chip">{{ groupName(t) }}</text>
                  <text class="meta-time">{{ lastTextOf(t) || '尚无运行记录' }}</text>
                </view>
              </view>
            </view>

            <view v-if="t.missing && t.missing.length" class="missing-line">
              缺少前置产物：{{ t.missing.join('、') }}
            </view>

            <view class="card-actions">
              <view
                v-if="auth.hasPerm('task:run')"
                class="run-btn"
                :class="{ running: isRunning(t), disabled: t.disabled || t.hidden }"
                @click="onRun(t)"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
                {{ isRunning(t) ? '执行中' : '运行' }}
              </view>
              <view class="ghost-btn" @click="openConfig(t)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3.5V2M12 22v-1.5M3.5 12H2M22 12h-1.5M6 6 5 5M19 19l-1-1M6 18l-1 1M19 5l-1 1" stroke-linecap="round" />
                </svg>
                配置
              </view>
              <view class="ghost-btn" @click="openArtifacts(t)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M3.5 7.5h6l2 2.5h9v10h-17z" stroke-linejoin="round" />
                </svg>
                产物
              </view>
            </view>
          </view>
        </view>

        <view class="sec-title recent-title">
          最近运行<text class="recent-count">{{ recentRuns.length }}</text>
          <text v-if="store.history.length > 8" class="recent-more" @click="showAllRuns = !showAllRuns">
            {{ showAllRuns ? '收起' : '全部记录' }}
          </text>
        </view>
        <view class="run-list">
          <view v-for="r in recentRuns" :key="r.run_id" class="run-row" @click="openLog(r.run_id)">
            <view class="run-dot" :class="r.cls"></view>
            <view class="run-main">
              <view class="run-name">{{ r.name }}</view>
              <view class="run-sub">{{ r.start }} · {{ r.trigger }}</view>
            </view>
            <view class="run-result" :class="r.cls">{{ r.result }}</view>
            <view
              v-if="auth.hasPerm('task:run')"
              class="run-delete"
              @click.stop="confirmDelete(r)"
            >×</view>
          </view>
          <view v-if="!recentRuns.length" class="run-empty">暂无运行记录</view>
        </view>

        <view class="bottom-space" />
      </scroll-view>
    </AuthGate>

    <AppTabBar current="task" />

    <TaskConfigSheet ref="configSheet" />
    <TaskLogSheet ref="logSheet" />
    <TaskArtifactSheet ref="artifactSheet" />
    <wd-toast />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useToast } from 'wot-design-uni';
import { useAuthStore } from '@shared/stores/auth.js';
import { useTaskCenterStore } from '../../stores/task-center.js';
import { useTabStateStore } from '../../stores/tab-state.js';
import AppTabBar from '../../components/AppTabBar.vue';
import AuthGate from '../../components/AuthGate.vue';
import ListIcon from '../../components/ListIcon.vue';
import TaskConfigSheet from '../../components/task/TaskConfigSheet.vue';
import TaskLogSheet from '../../components/task/TaskLogSheet.vue';
import TaskArtifactSheet from '../../components/task/TaskArtifactSheet.vue';

const store = useTaskCenterStore();
const auth = useAuthStore();
const tabState = useTabStateStore();
const toast = useToast();

const configSheet = ref(null);
const logSheet = ref(null);
const artifactSheet = ref(null);

const savedGroup = tabState.getFilter('task', 'all');
const activeGroup = ref(typeof savedGroup === 'string' ? savedGroup : 'all');
const sortBy = ref('recent');
const q = ref('');
const showAllRuns = ref(false);
const scrollTop = ref(tabState.getScroll('task'));

const sorts = [
  { id: 'recent', name: '最近运行' },
  { id: 'name', name: '名称' },
  { id: 'status', name: '状态优先' },
];

function onScroll(e) { tabState.setScroll('task', e.detail.scrollTop); }
function setGroup(id) {
  activeGroup.value = id;
  tabState.setFilter('task', id);
}
async function reload() {
  await store.load();
  if (store.error) toast.show(store.error);
}

const taskCount = computed(() => store.tasks.length);
const connText = computed(() => {
  if (store.loading && !store.tasks.length) return '同步中';
  if (store.error) return '连接异常';
  return store.sseConnected ? '实时同步' : '已连接';
});

const groupTabs = computed(() => [
  { id: 'all', name: '全部', count: store.countInGroup('all') },
  ...store.groups.map((g) => ({ id: g.id, name: g.name, count: store.countInGroup(g.id) })),
]);

const visibleTasks = computed(() => {
  let list = store.tasks.slice();
  if (activeGroup.value !== 'all') list = list.filter((t) => t.group === activeGroup.value);
  const key = String(q.value || '').trim().toLowerCase();
  if (key) {
    list = list.filter((t) =>
      ((t.name || '') + ' ' + (t.id || '') + ' ' + ((t.tags || []).join(' '))).toLowerCase().includes(key));
  }
  if (sortBy.value === 'name') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'));
  } else if (sortBy.value === 'recent') {
    const st = (t) => lastRecord(t)?.start || '';
    list.sort((a, b) => st(b).localeCompare(st(a)));
  } else {
    const order = { running: 0, queued: 1, stopped: 1, failed: 2, success: 3 };
    const st = (t) => t.status || lastStatus(t);
    list.sort((a, b) => (order[st(a)] ?? 9) - (order[st(b)] ?? 9));
  }
  return list;
});

function isRunning(t) { return store.runningTaskId === t.id; }
function lastRecord(t) { return (store.history || []).find((x) => x.task_id === t.id); }
function lastTextOf(t) {
  const h = lastRecord(t);
  if (!h) return '';
  return (h.start || '') + (h.duration ? ' · ' + h.duration + 's' : '');
}
function lastStatus(t) {
  const h = lastRecord(t);
  return h ? (h.error_kind || h.status || '') : 'none';
}
function stateOf(t) {
  if (isRunning(t)) return { txt: '执行中', cls: 'run' };
  const s = lastStatus(t);
  if (s === 'success') return { txt: '已启用', cls: 'ok' };
  if (s === 'failed') return { txt: '上次失败', cls: 'fail' };
  if (s === 'stopped') return { txt: '已暂停', cls: 'muted' };
  if (s === 'queued') return { txt: '排队中', cls: 'run' };
  return { txt: '未运行', cls: 'muted' };
}
function groupName(t) {
  const g = store.groupById(t.group);
  return (g && g.name) || t.group || '未分组';
}
function hexA(hex, a) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return `rgba(255, 80, 0, ${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function iconStyle(t) {
  const g = store.groupById(t.group);
  const c = (g && g.color) || '#ff5000';
  return { color: c, background: hexA(c, 0.11) };
}

const recentRuns = computed(() =>
  (showAllRuns.value ? (store.history || []) : (store.history || []).slice(0, 8)).map((h) => {
    const t = store.taskById(h.task_id);
    const st = h.error_kind || h.status || '';
    let result = '—', cls = 'muted';
    if (st === 'success') { result = '成功'; cls = 'ok'; }
    else if (st === 'failed') { result = '失败'; cls = 'fail'; }
    else if (st === 'running') { result = '执行中'; cls = 'run'; }
    else if (st === 'queued') { result = '排队中'; cls = 'run'; }
    else if (st === 'stopped') { result = '已停止'; cls = 'muted'; }
    return {
      run_id: h.run_id,
      name: (t && t.name) || h.name || h.task_id,
      trigger: h.trigger || '—',
      start: h.start ? String(h.start).slice(5, 16) : '—',
      result,
      cls,
    };
  }));

function openConfig(t) { configSheet.value?.open(t.id); }
function openArtifacts(t) { artifactSheet.value?.open(t.id); }
function openLog(id) { logSheet.value?.open(id); }

async function onRun(t) {
  if (!auth.hasPerm('task:run') || isRunning(t) || t.disabled || t.hidden) return;
  try {
    const rid = await store.runTask(t.id);
    toast.show('已提交运行：' + t.name + '（配置已恢复默认）');
    if (rid) openLog(rid);
  } catch (e) {
    toast.show(e.message || '运行失败');
  }
}

function confirmDelete(r) {
  if (!r.run_id) return;
  uni.showModal({
    title: '删除运行记录',
    content: `确定删除「${r.name}」这条记录吗？日志文件将一并删除。`,
    confirmText: '删除',
    cancelText: '取消',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await store.deleteRun(r.run_id);
        toast.show('已删除');
      } catch (e) {
        toast.show(e.message || '删除失败');
      }
    },
  });
}
</script>

<style scoped>
.task-head { padding: calc(48px + env(safe-area-inset-top, 0px)) 20px 14px; }
.head-top { display: flex; align-items: flex-start; gap: 12px; }
.head-main { flex: 1; min-width: 0; }
.eyebrow { font-size: 10px; font-weight: 800; letter-spacing: .18em; color: var(--brand-600); }
.head-title { margin-top: 4px; font-size: 25px; font-weight: 800; color: var(--ink-900); }
.head-sub { margin-top: 5px; font-size: 12px; color: var(--ink-500); }
.head-actions { display: flex; gap: 8px; padding-top: 4px; }
.icon-btn {
  width: 36px; height: 36px; border-radius: 12px; flex-shrink: 0;
  display: grid; place-items: center; background: var(--card);
  border: 1px solid var(--line); color: var(--brand-600);
}
.icon-btn svg { width: 18px; height: 18px; }

.search-box {
  display: flex; align-items: center; gap: 9px; margin-top: 16px;
  height: 42px; padding: 0 13px; box-sizing: border-box;
  border-radius: 14px; background: var(--card); border: 1px solid var(--line);
}
.search-ico { width: 18px; height: 18px; color: var(--ink-300); flex-shrink: 0; }
.search-input { flex: 1; min-width: 0; font-size: 13.5px; color: var(--ink-900); }
.search-clear { width: 20px; height: 20px; border-radius: 50%; background: var(--line); color: var(--ink-500); display: grid; place-items: center; font-size: 15px; }

.group-scroll { margin-top: 14px; white-space: nowrap; }
.group-row { display: inline-flex; gap: 8px; padding-right: 20px; }
.group-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 13px; border-radius: 999px; box-sizing: border-box;
  background: var(--card); border: 1px solid var(--line);
  color: var(--ink-500); font-size: 12.5px; font-weight: 600;
}
.group-chip.active { background: var(--brand-50); border-color: var(--brand-500); color: var(--brand-600); }
.chip-n { font-size: 11px; opacity: .65; font-variant-numeric: tabular-nums; }

.sort-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.sort-label { font-size: 11.5px; color: var(--ink-300); margin-right: 2px; }
.sort-btn { padding: 4px 10px; border-radius: 999px; font-size: 11.5px; color: var(--ink-500); background: transparent; }
.sort-btn.active { background: var(--ink-900); color: #fff; font-weight: 600; }

.state-block {
  margin: 12px 20px; padding: 46px 20px; border-radius: var(--radius-m);
  background: var(--card); border: 1px solid var(--line);
  text-align: center; color: var(--ink-300); font-size: 14px;
}
.state-block.error { color: var(--danger); }
.retry { display: block; margin-top: 10px; color: var(--brand-600); font-weight: 600; }

.task-list { margin: 4px 20px 0; display: flex; flex-direction: column; gap: 12px; }
.task-card {
  padding: 15px; box-sizing: border-box; border-radius: var(--radius-m);
  background: var(--card); border: 1px solid var(--line);
  box-shadow: 0 8px 22px -18px rgba(140, 60, 15, .45);
}
.card-main { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.task-ico {
  width: 40px; height: 40px; border-radius: 13px; flex-shrink: 0;
  display: grid; place-items: center;
}
.task-ico :deep(svg) { width: 20px; height: 20px; }
.card-text { flex: 1; min-width: 0; }
.title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.task-title {
  flex: 1; min-width: 0; font-size: 14.5px; font-weight: 700; color: var(--ink-900);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.status-pill {
  flex-shrink: 0; padding: 3px 8px; border-radius: 999px;
  font-size: 10.5px; font-weight: 700;
}
.status-pill.ok { background: #eaf7ee; color: #1e8e4b; }
.status-pill.fail { background: #fbedec; color: var(--danger); }
.status-pill.run { background: #fff4e0; color: #b87400; }
.status-pill.muted { background: var(--brand-50); color: var(--ink-500); }
.task-desc {
  margin-top: 6px; font-size: 12px; line-height: 1.55; color: var(--ink-500);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.task-meta { display: flex; align-items: center; gap: 8px; margin-top: 9px; min-width: 0; }
.meta-chip {
  flex-shrink: 0; padding: 2px 7px; border-radius: 6px;
  background: var(--brand-50); color: var(--brand-600); font-size: 10.5px; font-weight: 600;
}
.meta-time { font-size: 10.5px; color: var(--ink-300); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.missing-line {
  margin-top: 10px; padding: 7px 9px; border-radius: 9px;
  background: #fff4e0; color: #b87400; font-size: 11px; line-height: 1.5;
}
.card-actions {
  display: flex; align-items: center; gap: 8px;
  margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--line);
}
.run-btn {
  height: 34px; min-width: 78px; padding: 0 13px; border-radius: 11px;
  display: flex; align-items: center; justify-content: center; gap: 5px; box-sizing: border-box;
  background: linear-gradient(180deg, var(--brand-500), var(--brand-600));
  color: #fff; font-size: 12.5px; font-weight: 700;
}
.run-btn svg { width: 13px; height: 13px; }
.run-btn.running { background: #fff4e0; color: #b87400; }
.run-btn.disabled { background: var(--line); color: var(--ink-300); }
.ghost-btn {
  height: 34px; padding: 0 11px; border-radius: 11px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; gap: 5px;
  background: var(--paper); border: 1px solid var(--line); color: var(--ink-700); font-size: 12px;
}
.ghost-btn svg { width: 14px; height: 14px; }

.recent-title { display: flex; align-items: center; gap: 7px; }
.recent-count {
  padding: 1px 7px; border-radius: 999px; background: var(--line);
  color: var(--ink-500); font-size: 10px; font-weight: 600; letter-spacing: 0;
}
.recent-more { margin-left: auto; color: var(--brand-600); font-size: 11.5px; font-weight: 600; letter-spacing: 0; }
.run-list { margin: 0 20px; display: flex; flex-direction: column; gap: 8px; }
.run-row {
  display: flex; align-items: center; gap: 10px; padding: 12px 13px; box-sizing: border-box;
  background: var(--card); border: 1px solid var(--line); border-radius: 13px;
}
.run-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--ink-300); }
.run-dot.ok { background: #1e8e4b; }
.run-dot.fail { background: var(--danger); }
.run-dot.run { background: #b87400; }
.run-main { flex: 1; min-width: 0; }
.run-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-sub { margin-top: 3px; font-size: 10.5px; color: var(--ink-300); }
.run-result { font-size: 11px; font-weight: 700; color: var(--ink-500); flex-shrink: 0; }
.run-result.ok { color: #1e8e4b; }
.run-result.fail { color: var(--danger); }
.run-result.run { color: #b87400; }
.run-delete { width: 20px; height: 20px; display: grid; place-items: center; color: var(--ink-300); font-size: 17px; flex-shrink: 0; }
.run-empty { padding: 28px 0; text-align: center; color: var(--ink-300); font-size: 12.5px; }
.bottom-space { height: 24px; }
</style>
