<template>
  <div class="dv">
    <div class="dv-bar">
      <h2 class="v-title">排班出勤</h2>
      <el-select v-model="teamSel" class="dv-sel" placeholder="站点">
        <el-option label="全部站点" value="__all__" />
        <el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>
      <el-date-picker
        v-model="date" type="date" value-format="YYYY-MM-DD"
        placeholder="选择日期（默认当天）" class="dv-date" :clearable="false" @change="onDateChange"
      />
      <span v-if="fetchedAt" class="dv-time" title="数据取数/落盘时间">
        取数：{{ fetchedAt }} <em v-if="isCache" class="dv-cache">（缓存）</em>
      </span>
      <span class="sp" />
      <el-button @click="store.openCfg()"><el-icon><Setting /></el-icon> 站点配置</el-button>
      <el-button type="primary" :loading="loading" @click="store.refresh()">
        <el-icon><Refresh /></el-icon> {{ loading ? '刷新中…' : '刷新数据' }}
      </el-button>
    </div>

    <!-- dataset 三个 tab 共用的状态提示；预排班独立取数，有自己的提示 -->
    <el-alert v-if="!isPreSchedule && dataError" type="error" :closable="false" show-icon class="dv-hint">
      {{ dataError }}
    </el-alert>
    <el-alert v-else-if="!isPreSchedule && needRefresh" type="info" :closable="false" show-icon class="dv-hint">
      当前日期（{{ date }}）暂无缓存数据，请点「刷新数据」拉取实时数据并生成看板。
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

    <el-dialog v-model="cfgVisible" title="站点配置（选择需要在看板展示的站点）" width="440px">
      <el-checkbox-group v-model="cfgSel" class="dv-cfg-group">
        <el-checkbox v-for="t in teamsAll" :key="t.id" :value="t.id">{{ t.name }}</el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="cfgVisible = false">取消</el-button>
        <el-button type="primary" :loading="cfgSaving" v-perm="'config:write'" @click="store.saveCfg()">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAttendPeriodStore } from './store.js';

const route = useRoute();
const router = useRouter();
const store = useAttendPeriodStore();
const {
  teamsAll, teamOptions, teamSel, date, fetchedAt, isCache, loading,
  dataError, needRefresh, dataNote, cfgVisible, cfgSel, cfgSaving,
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

// 切换站点会让预排班缓存失效；预排班组件挂载时再按需重新拉取
watch(teamSel, () => store.invalidatePre());
onMounted(() => store.ensureInit());
</script>

<style src="./attend-period.css" scoped></style>
