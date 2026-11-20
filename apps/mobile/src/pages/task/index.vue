<template>
  <view class="m-screen task-page">
    <AuthGate>
      <scroll-view class="m-scroll" scroll-y :scroll-top="scrollTop" @scroll="onScroll">
        <view class="hero">
          <view class="eyebrow">AEOLUS · TASK CENTER</view>
          <view class="hero-title">任务中心</view>
          <view class="hero-btn" @click="openHistory">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
              <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" stroke-linecap="round" />
              <path d="M3.5 4.5V9H8" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M12 7.5V12l3 2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </view>
        </view>

        <view class="search-wrap">
          <view class="search">
            <svg class="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="10.8" cy="10.8" r="6.3" />
              <path d="m15.5 15.5 4 4" stroke-linecap="round" />
            </svg>
            <input v-model="q" class="search-input" placeholder="搜索任务名称 / 分类" />
            <view v-if="q" class="clear-btn" @click="q = ''">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6">
                <path d="M6 6l12 12M18 6 6 18" stroke-linecap="round" />
              </svg>
            </view>
          </view>
        </view>

        <view class="chips-wrap">
          <view class="chips">
            <view
              v-for="g in visibleGroupTabs"
              :key="g.id"
              class="chip"
              :class="{ active: activeGroup === g.id }"
              @click="setGroup(g.id)"
            >
              <text v-if="activeGroup === g.id" class="chip-dot"></text>
              {{ g.name }}<text class="chip-n">{{ g.count }}</text>
            </view>
            <view class="more-chip" :class="{ expanded: chipsExpanded }" @click="chipsExpanded = !chipsExpanded">
              <text>{{ chipsExpanded ? '收起' : '更多 ' + hiddenChipCount }}</text>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                <path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </view>
          </view>
        </view>

        <view class="list-head">
          <text class="list-title">任务列表</text>
          <text class="count">{{ visibleTasks.length }}</text>
          <view class="sort-btn" @click="toggleSort">
            <text>{{ sortBy === 'recent' ? '最近运行' : '名称' }}</text>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M12 5v14M7 14l5 5 5-5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </view>
        </view>

        <view v-if="store.loading && !store.tasks.length" class="empty-state">
          <view class="e-t">任务加载中…</view>
        </view>
        <view v-else-if="store.error && !store.tasks.length" class="empty-state">
          <view class="e-t">{{ store.error }}</view>
          <button class="reset-btn" @click="reload">重新加载</button>
        </view>
        <view v-else-if="!visibleTasks.length" class="empty-state">
          <view class="e-t">没有匹配的任务</view>
          <view class="e-s">换个关键词，或清除当前筛选条件</view>
          <button class="reset-btn" @click="clearFilters">清除筛选</button>
        </view>

        <view v-else class="cards">
          <view
            v-for="t in visibleTasks"
            :key="t.id"
            class="task-card"
            :class="{ attention: isAttention(t) }"
          >
            <view class="tc-icon"><ListIcon :name="t.group || 'task'" /></view>
            <view class="tc-open" @click="openDetail(t)">
              <view class="tc-line1">
                <text class="tc-name">{{ t.name }}</text>
                <text class="tc-cat">{{ groupName(t) }}</text>
              </view>
              <view class="tc-meta">
                上次运行 <text class="tc-time">{{ timeText(t) }}</text>{{ durationText(t) }}
              </view>
            </view>
            <view class="tc-right">
              <view v-if="isAttention(t)" class="tc-status warn">{{ stateOf(t).txt }}</view>
              <view
                v-if="auth.hasPerm('task:run')"
                class="tc-run"
                :class="{ disabled: t.disabled || t.hidden || isRunning(t) }"
                @click.stop="onRun(t)"
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z" /></svg>
              </view>
            </view>
          </view>
        </view>

        <view class="list-foot">
          {{ visibleTasks.length === store.tasks.length
            ? '已显示全部 ' + store.tasks.length + ' 个任务'
            : '显示 ' + visibleTasks.length + ' / ' + store.tasks.length + ' 个任务' }}
        </view>
        <view class="bottom-space" />
      </scroll-view>
    </AuthGate>

    <AppTabBar current="task" />

    <TaskDetailSheet
      ref="detailSheet"
      @run="onRun"
      @config="openConfig"
      @artifacts="openArtifacts"
    />
    <TaskHistorySheet ref="historySheet" @open-log="openLog" />
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
import TaskDetailSheet from '../../components/task/TaskDetailSheet.vue';
import TaskHistorySheet from '../../components/task/TaskHistorySheet.vue';
import TaskConfigSheet from '../../components/task/TaskConfigSheet.vue';
import TaskLogSheet from '../../components/task/TaskLogSheet.vue';
import TaskArtifactSheet from '../../components/task/TaskArtifactSheet.vue';

const store = useTaskCenterStore();
const auth = useAuthStore();
const tabState = useTabStateStore();
const toast = useToast();

const detailSheet = ref(null);
const historySheet = ref(null);
const configSheet = ref(null);
const logSheet = ref(null);
const artifactSheet = ref(null);

const savedGroup = tabState.getFilter('task', 'all');
const activeGroup = ref(typeof savedGroup === 'string' ? savedGroup : 'all');
const sortBy = ref('recent');
const q = ref('');
const chipsExpanded = ref(false);
const scrollTop = ref(tabState.getScroll('task'));

const VISIBLE_CHIPS = 4;

function onScroll(e) { tabState.setScroll('task', e.detail.scrollTop); }
function setGroup(id) {
  activeGroup.value = id;
  tabState.setFilter('task', id);
}
function toggleSort() {
  sortBy.value = sortBy.value === 'recent' ? 'name' : 'recent';
  toast.show(sortBy.value === 'recent' ? '按最近运行排序' : '按名称排序');
}
function clearFilters() {
  q.value = '';
  activeGroup.value = 'all';
  tabState.setFilter('task', 'all');
}
async function reload() {
  await store.load();
  if (store.error) toast.show(store.error);
}

const groupTabs = computed(() => [
  { id: 'all', name: '全部', count: store.countInGroup('all') },
  ...store.groups.map((g) => ({ id: g.id, name: g.name, count: store.countInGroup(g.id) })),
]);
const hiddenChipCount = computed(() => Math.max(0, groupTabs.value.length - VISIBLE_CHIPS));
const visibleGroupTabs = computed(() => {
  const all = groupTabs.value;
  if (chipsExpanded.value) return all;
  const keep = new Set([0, 1, 2, 3]);
  const sel = all.findIndex((g) => g.id === activeGroup.value);
  if (sel >= VISIBLE_CHIPS) { keep.delete(VISIBLE_CHIPS - 1); keep.add(sel); }
  return all.filter((_, i) => keep.has(i));
});

const visibleTasks = computed(() => {
  let list = store.tasks.slice();
  if (activeGroup.value !== 'all') list = list.filter((t) => t.group === activeGroup.value);
  const key = String(q.value || '').trim().toLowerCase();
  if (key) {
    list = list.filter((t) =>
      ((t.name || '') + ' ' + (t.id || '') + ' ' + groupName(t) + ' ' + ((t.tags || []).join(' ')))
        .toLowerCase().includes(key));
  }
  if (sortBy.value === 'name') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'));
  } else {
    const st = (t) => lastRecord(t)?.start || '';
    list.sort((a, b) => st(b).localeCompare(st(a)));
  }
  return list;
});

function isRunning(t) { return store.runningTaskId === t.id; }
function lastRecord(t) { return (store.history || []).find((x) => x.task_id === t.id); }
function lastStatus(t) {
  const h = lastRecord(t);
  return h ? (h.error_kind || h.status || '') : 'none';
}
function isAttention(t) {
  return lastStatus(t) === 'failed' || lastStatus(t) === 'queued' || !!(t.missing && t.missing.length);
}
function stateOf(t) {
  if (isRunning(t)) return { txt: '执行中' };
  const s = lastStatus(t);
  if (s === 'success') return { txt: '已启用' };
  if (s === 'failed') return { txt: '上次失败' };
  if (s === 'stopped') return { txt: '已暂停' };
  if (s === 'queued') return { txt: '排队中' };
  return { txt: '待运行' };
}
function groupName(t) {
  const g = store.groupById(t.group);
  return (g && g.name) || t.group || '未分组';
}
function fmtStart(s) {
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  return String(s).replace('T', ' ').slice(5, 19);
}
function timeText(t) {
  const h = lastRecord(t);
  return h ? fmtStart(h.start) : '—';
}
function durationText(t) {
  const h = lastRecord(t);
  return h && h.duration ? ' · ' + h.duration + 's' : '';
}

function openDetail(t) { detailSheet.value?.open(t); }
function openHistory() { historySheet.value?.open(); }
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
</script>

<style scoped>
.task-page {
  --brand-100: #ffe4d4;
  --brand-700: #c93e00;
  --ok: #17753e;
  --warn: #8a5200;
  --warn-bg: #fff4e0;
  --radius-s: 12px;
}

.hero {
  position: relative; padding: calc(50px + env(safe-area-inset-top, 0px)) 24px 30px;
  background:
    radial-gradient(340px 200px at 108% -40%, rgba(255,255,255,.20), transparent 60%),
    linear-gradient(145deg, var(--brand-500), var(--brand-600));
  overflow: hidden;
}
.hero::after {
  content: 'A'; position: absolute; right: 68px; top: -38px;
  font-size: 128px; font-weight: 800; font-style: italic;
  color: rgba(255,255,255,.09); line-height: 1; pointer-events: none;
}
.eyebrow { font-size: 11px; font-weight: 800; letter-spacing: .22em; color: var(--ink-900); }
.hero-title { margin-top: 8px; font-size: 29px; font-weight: 800; letter-spacing: .02em; color: #fff; }
.hero-btn {
  position: absolute; right: 22px; top: calc(48px + env(safe-area-inset-top, 0px));
  width: 42px; height: 42px; border-radius: 14px;
  background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.5);
  display: grid; place-items: center; color: #fff;
}
.hero-btn svg { width: 19px; height: 19px; }

.search-wrap { margin: 18px 20px 0; }
.search {
  display: flex; align-items: center; gap: 9px; height: 48px; padding: 0 14px;
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-s);
}
.search-ico { width: 18px; height: 18px; color: var(--ink-300); flex-shrink: 0; }
.search-input { flex: 1; min-width: 0; height: 100%; font-size: 16px; color: var(--ink-900); }
.clear-btn {
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  background: var(--line); color: var(--ink-700); display: grid; place-items: center;
}
.clear-btn svg { width: 13px; height: 13px; }

.chips-wrap { margin-top: 14px; }
.chips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 2px 20px 6px; }
.chip {
  min-height: 40px; width: 100%; padding: 0 8px; box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 999px; border: 1px solid var(--line); background: var(--card);
  color: var(--ink-700); font-size: 13px; font-weight: 600;
}
.chip.active { background: var(--brand-50); border: 1.5px solid var(--brand-500); color: var(--brand-700); font-weight: 800; }
.chip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--brand-500); flex-shrink: 0; }
.chip-n { font-size: 10.5px; opacity: .7; }
.more-chip {
  min-height: 40px; width: 100%; padding: 0 8px; box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  border-radius: 999px; border: 1px dashed var(--ink-300); background: none;
  color: var(--ink-700); font-size: 13px; font-weight: 700;
}
.more-chip:not(.expanded) { grid-column: span 2; }
.more-chip svg { width: 13px; height: 13px; transition: transform 200ms var(--ease-out-quart); }
.more-chip.expanded svg { transform: rotate(180deg); }

.list-head { display: flex; align-items: center; gap: 9px; margin: 20px 20px 12px; }
.list-title { font-size: 16px; font-weight: 800; letter-spacing: .01em; }
.count {
  min-width: 22px; height: 22px; padding: 0 6px; box-sizing: border-box;
  border-radius: 8px; background: var(--brand-50); color: var(--brand-700);
  font-size: 12px; font-weight: 800; line-height: 22px; text-align: center;
}
.sort-btn { margin-left: auto; display: flex; align-items: center; gap: 4px; padding: 8px 2px 8px 8px; color: var(--ink-500); font-size: 12px; font-weight: 600; }
.sort-btn svg { width: 13px; height: 13px; }

.empty-state {
  margin: 8px 20px 20px; padding: 44px 20px; text-align: center;
  background: var(--card); border: 1px dashed var(--line); border-radius: var(--radius-m);
}
.e-t { font-size: 14px; font-weight: 700; color: var(--ink-700); }
.e-s { margin-top: 6px; font-size: 12px; color: var(--ink-500); }
.reset-btn {
  margin-top: 16px; padding: 9px 18px; border: 1px solid var(--brand-500);
  border-radius: 999px; background: var(--brand-50); color: var(--brand-700);
  font-size: 13px; font-weight: 700;
}

.cards { padding: 0 20px; }
.task-card {
  position: relative; display: flex; align-items: center; gap: 12px;
  min-height: 88px; margin-bottom: 10px; padding: 14px 13px; box-sizing: border-box;
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-m);
}
.task-card.attention { background: #fffcF8; border-color: #f6ddc4; }
.task-card.attention::before {
  content: ''; position: absolute; left: 0; top: 16px; bottom: 16px;
  width: 3px; border-radius: 0 3px 3px 0; background: var(--warn);
}
.tc-icon {
  width: 42px; height: 42px; border-radius: 13px; flex-shrink: 0;
  display: grid; place-items: center; background: var(--brand-50); color: var(--brand-600);
}
.task-card.attention .tc-icon { background: var(--warn-bg); color: var(--warn); }
.tc-icon :deep(svg) { width: 20px; height: 20px; }
.tc-open { flex: 1; min-width: 0; padding: 2px 0; }
.tc-line1 { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.tc-name { font-size: 14.5px; font-weight: 700; color: var(--ink-900); }
.tc-cat {
  font-size: 10.5px; font-weight: 600; color: var(--ink-500);
  background: var(--paper); border: 1px solid var(--line);
  padding: 2px 7px; border-radius: 6px; white-space: nowrap;
}
.tc-meta { margin-top: 7px; font-size: 11.5px; color: var(--ink-500); line-height: 1.4; }
.tc-time { color: var(--ink-700); font-weight: 600; font-variant-numeric: tabular-nums; }
.tc-right {
  flex-shrink: 0; width: 44px; align-self: stretch;
  display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 10px;
}
.tc-status { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
.tc-status.warn { color: var(--warn); }
.tc-run {
  position: relative; width: 36px; height: 36px; border-radius: 11px;
  border: 1px solid var(--brand-100); background: var(--brand-50); color: var(--brand-600);
  display: grid; place-items: center;
}
.tc-run::after { content: ''; position: absolute; inset: -5px; }
.tc-run.disabled { background: var(--line); border-color: var(--line); color: var(--ink-300); }
.tc-run svg { width: 16px; height: 16px; }

.list-foot { text-align: center; padding: 6px 0 24px; font-size: 11.5px; color: var(--ink-500); letter-spacing: .02em; }
.bottom-space { height: 12px; }
</style>
