<template>
  <div class="dv">
    <div class="dv-bar">
      <h2 class="v-title">排班出勤</h2>
      <el-select v-model="teamSel" multiple clearable collapse-tags collapse-tags-tooltip :max-collapse-tags="2"
                 class="dv-sel dv-team-sel" placeholder="全部站点" @change="store.markTeamTouched()">
        <template #header>
          <div class="dv-sel-all">
            <div class="el-select-dropdown__item" @click.stop="toggleTeamAll">
              {{ isAllTeamSelected ? '反选' : '全选' }}
            </div>
          </div>
        </template>
        <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
      </el-select>
      <el-date-picker
        v-model="date" type="date" value-format="YYYY-MM-DD"
        placeholder="选择日期（默认当天）" class="dv-date" :clearable="false" @change="onDateChange"
      />
      <span v-if="fetchedAt" class="dv-time" title="数据刷新时间">
        数据刷新时间：{{ fmtBJ(fetchedAt) }}
      </span>
      <span class="sp" />
      <el-button type="primary" :disabled="loading" @click="store.refresh()">
        <el-icon v-if="loading" class="is-loading"><Loading /></el-icon>
        <el-icon v-else><Refresh /></el-icon>
        <span v-if="loading" class="dv-refresh-text">刷新中</span>
        <span v-else class="dv-refresh-text">刷<span class="dv-refresh-gap"></span>新</span>
      </el-button>
    </div>

    <!-- dataset 三个 tab 共用的状态提示；预排班独立取数，有自己的提示 -->
    <el-alert v-if="!isPreSchedule && dataError" type="error" :closable="false" show-icon class="dv-hint">
      {{ dataError }}
    </el-alert>
    <el-alert v-else-if="!isPreSchedule && dataNote" type="warning" :closable="false" show-icon class="dv-hint">{{ dataNote }}</el-alert>

    <!-- tab name 即子路由路径：切换由 v-model setter 推送路由，回显由 route.path 驱动；
         内容交给嵌套 router-view，各 tab 是独立组件。 -->
    <el-tabs v-model="activePath" class="dv-tabs">
      <el-tab-pane label="实时看板" name="/attend-period/realtime" />
      <el-tab-pane label="站点看板" name="/attend-period/station" />
      <el-tab-pane label="骑手看板" name="/attend-period/rider" />
      <el-tab-pane label="时段看板" name="/attend-period/period" />
      <el-tab-pane label="预排班" name="/attend-period/pre-schedule" />
    </el-tabs>
    <div class="dv-content"><router-view /></div>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAttendPeriodStore, fmtBJ } from './store.js';

const route = useRoute();
const router = useRouter();
const store = useAttendPeriodStore();
const {
  teamOptions, teamSel, isAllTeamSelected, date, fetchedAt, loading,
  dataError, dataNote,
} = storeToRefs(store);

const TAB_PATHS = {
  realtime: '/attend-period/realtime',
  station: '/attend-period/station',
  rider: '/attend-period/rider',
  period: '/attend-period/period',
  preSchedule: '/attend-period/pre-schedule',
};
const PRE_SCHEDULE_PATH = TAB_PATHS.preSchedule;

const activePath = computed({
  get() {
    const p = route.path;
    if (p.startsWith(PRE_SCHEDULE_PATH)) return PRE_SCHEDULE_PATH;
    if (p.startsWith(TAB_PATHS.station)) return TAB_PATHS.station;
    if (p.startsWith(TAB_PATHS.rider)) return TAB_PATHS.rider;
    if (p.startsWith(TAB_PATHS.period)) return TAB_PATHS.period;
    return TAB_PATHS.realtime;
  },
  set(v) { router.push(String(v)); },
});
const isPreSchedule = computed(() => activePath.value === PRE_SCHEDULE_PATH);

function onDateChange() { store.loadCached(); }
function toggleTeamAll() {
  const all = store.allTeamIds;
  const sel = teamSel.value.map(String);
  teamSel.value = isAllTeamSelected.value ? all.filter((id) => !sel.includes(id)) : [...all];
  store.markTeamTouched();
}

// 切换站点会让预排班缓存失效；预排班组件挂载时再按需重新拉取
watch(teamSel, () => store.invalidatePre(), { deep: true });
onMounted(() => store.ensureInit());
</script>

<style src="./attend-period.css" scoped></style>
