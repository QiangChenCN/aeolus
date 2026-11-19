<template>
  <div class="org">
    <div class="org-bar">
      <h2 class="v-title">站点配置</h2>
      <span class="org-src" v-if="teamsSource">站点目录来源：{{ teamsSource === 'xtop' ? '风神实时' : '本地兜底缓存' }}</span>
      <el-tag v-if="dirty" type="warning" effect="light" size="small">未保存更改</el-tag>
      <el-tooltip v-if="canWrite" content="保存城市/业务线/站点归属（org_tree），同时生效于数据权限可见范围" placement="top">
        <el-button type="primary" size="small" :loading="saving" :disabled="!orgDirty" @click="onSave">保存组织配置</el-button>
      </el-tooltip>
      <span class="sp" />
    </div>

    <el-alert v-if="error" type="error" :closable="false" show-icon class="org-hint">{{ error }}</el-alert>

    <div class="org-main">
      <!-- 常驻左树：组织总览 + 拖拽绑定操作入口（站点↔业务线/城市、城市↔业务线的绑定都在树上完成） -->
      <el-card class="org-side" shadow="never">
        <template #header>
          <div class="org-card-head"><span>组织总览</span></div>
        </template>
        <div class="org-legend">
          <span class="ui-dot ui-dot--ok" /> 已归属
          <span class="ui-dot ui-dot--muted" /> 目录外失效
          <span class="ui-dot ui-dot--warn" /> 未归属 / 未分配
        </div>
        <div v-if="canWrite && treeData.length" class="org-drag-hint">
          绑定操作：拖拽站点 → 业务线节点直挂该业务线；→ 城市节点归入城市并直挂所在业务线（拖回「未归属站点」撤销）；拖拽城市 → 业务线节点完成城市挂载。增删改名在右侧对应页签。
        </div>
        <el-tree
          v-if="treeData.length"
          :data="treeData" default-expand-all :expand-on-click-node="false"
          :indent="12"
          node-key="key" class="org-tree"
          :draggable="canWrite"
          :allow-drag="allowDrag" :allow-drop="allowDrop"
          @node-drop="onNodeDrop" @node-click="onNodeClick"
        >
          <template #default="{ data }">
            <span class="org-tree-node" :class="{ 'is-root': data.kind === 'bl' || data.kind === 'group', 'is-selected': selectedKey === data.key }">
              <el-icon v-if="data.kind === 'bl'" class="tn-icon"><OfficeBuilding /></el-icon>
              <el-icon v-else-if="data.kind === 'city'" class="tn-icon"><Location /></el-icon>
              <el-icon v-else-if="data.kind === 'station'" class="tn-icon"><Shop /></el-icon>
              <span v-if="data.kind === 'station'" class="ui-dot" :class="data.dead ? 'ui-dot--muted' : 'ui-dot--ok'" />
              <span v-if="data.kind === 'group'" class="ui-dot" :class="data.warn ? 'ui-dot--warn' : 'ui-dot--info'" />
              <span class="org-tree-label" :title="data.label">{{ data.label }}</span>
              <el-tag v-if="data.dead" size="small" type="info" effect="plain">已失效</el-tag>
              <el-tag v-if="data.countText" size="small" type="info" effect="plain">{{ data.countText }}</el-tag>
            </span>
          </template>
        </el-tree>
        <el-empty v-else description="暂无可展示的组织数据（请先在「城市设置」「业务线设置」中登记，再回此树绑定归属）" :image-size="72" />
      </el-card>

      <!-- 右侧编辑区：四个页签——站点绑定 + 三个字典/独立数据域 -->
      <div class="org-content">
        <el-tabs v-model="tab" type="card" class="org-tabs">
          <!-- Tab：站点配置（站点级绑定：城市、业务线归属；保存后生效） -->
          <el-tab-pane name="station">
            <template #label>站点配置<el-tag v-if="dirty" size="small" type="warning" effect="light" class="tab-dot">*</el-tag></template>
            <el-card class="org-card" shadow="never">
              <template #header>
                <div class="org-card-head">
                  <template v-if="canMgrWrite">
                    <el-button class="org-head-right" size="small" type="primary" plain @click="addMgrStation">添加站点映射</el-button>
                  </template>
                </div>
              </template>
              <el-alert v-if="mgrIssues.length" type="warning" :closable="false" show-icon class="org-hint">
                <template #title>负责人路由与人事花名册存在不一致（{{ mgrIssues.length }} 项）</template>
                <div v-for="(it, i) in mgrIssues" :key="i" class="org-hint-inline">· {{ it }}</div>
              </el-alert>
              <el-table :data="mainStationRows" size="default" table-layout="auto" :row-class-name="hlRow('station')"
                :empty-text="stationRows.length ? '未配置业务线归属的站点已移至下方汇总区' : '站点目录为空（来源见页头）'">
              <el-table-column label="站点ID" min-width="110">
                  <template #default="{ row }"><span class="org-hint-inline">{{ row.id || '—' }}</span></template>
                </el-table-column>
                <el-table-column label="站点" min-width="160">
                  <template #default="{ row }">
                    <el-select v-if="row.blank" :model-value="row.id" filterable allow-create default-first-option
                      size="small" placeholder="选择无业务归属的站点" class="org-cell-sel"
                      @update:model-value="(v) => onPickStation(row, v)">
                      <el-option v-for="t in addableStationOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
                    </el-select>
                    <template v-else>
                      <span class="u-strong">{{ row.name }}</span>
                      <el-tag v-if="row.dead" size="small" type="info" effect="plain" class="tab-dot">已失效</el-tag>
                    </template>
                  </template>
                </el-table-column>
                <el-table-column label="站点简称" min-width="120">
                  <template #default="{ row }">
                    <el-input :model-value="shortNameOf(row)" size="small" :disabled="!canMgrWrite || row.blank"
                      placeholder="选填" class="org-short-input" @update:model-value="(v) => setShortName(row, v)" />
                  </template>
                </el-table-column>
                <el-table-column label="站点地址" min-width="160">
                  <template #default="{ row }">
                    <el-input :model-value="addressOf(row)" size="small" :disabled="!canMgrWrite || row.blank"
                      placeholder="选填" @update:model-value="(v) => setAddress(row, v)" />
                  </template>
                </el-table-column>
                <el-table-column label="负责人" min-width="180">
                  <template #default="{ row }">
                    <el-select :model-value="managersOf(row.id)" multiple filterable allow-create default-first-option
                      size="small" class="mgr-sel" :disabled="!canMgrWrite" placeholder="按岗位分组选择，或手输姓名"
                      @update:model-value="(v) => setManagers(row, v)">
                      <el-option-group v-for="g in nameGroups" :key="g.label" :label="g.label">
                        <el-option v-for="m in g.names" :key="m" :label="m" :value="m" />
                      </el-option-group>
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="业务归属" min-width="150">
                  <template #default="{ row }">
                    <el-select
                      :model-value="directBlOf(row.id)" :disabled="!canWrite" size="small"
                      class="org-cell-sel" placeholder="按城市"
                      @update:model-value="(v) => setDirectBl(row.id, v)"
                    >
                      <el-option label="按城市" value="" />
                      <el-option v-for="b in blNames" :key="b" :label="b" :value="b" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="城市" min-width="120">
                  <template #default="{ row }">
                    <el-select
                      :model-value="cityOf(row.id)" :disabled="!canWrite" size="small" clearable
                      placeholder="未归属" class="org-cell-sel"
                      @update:model-value="(v) => setStationCity(row.id, v)"
                    >
                      <el-option v-for="c in cityNames" :key="c" :label="c" :value="c" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="操作" align="center" min-width="90">
                  <template #default="{ row }">
                    <el-button v-if="mgrAdding && canMgrWrite" link type="primary" size="small"
                      :loading="mgrSaving" @click="onSaveManagers">保存</el-button>
                    <el-tooltip content="解除站点映射：清空负责人/简称/地址（目录站点行保留，目录外条目整行移除）" placement="top">
                      <el-button link type="danger" size="small"
                        :disabled="!canMgrWrite || row.blank || !mgrRowOf(row.id)"
                        @click="unbindMgrRow(row)">解除</el-button>
                    </el-tooltip>
                  </template>
                </el-table-column>
              </el-table>
              <!-- 暂无业务线归属的站点：汇总配置区（未直挂且城市未挂业务线 → 数据权限里不可见） -->
              <template v-if="noBlRows.length">
                <el-divider />
                <div class="org-city-head">
                  <span class="org-city-name">暂无业务线归属的站点</span>
                </div>
                <div v-for="r in noBlRows" :key="r.id" class="org-nobl-row">
                  <span class="org-hint-inline org-nobl-id">{{ r.id }}</span>
                  <span class="org-st-name">
                    {{ r.name }}
                    <el-tag v-if="r.dead" size="small" type="info" effect="plain">已失效</el-tag>
                  </span>
                </div>
              </template>
            </el-card>
          </el-tab-pane>

          <!-- Tab：业务线设置（纯字典：增删改名，不涉及绑定；绑定在左树拖拽城市 → 业务线节点） -->
          <el-tab-pane name="bl">
            <template #label>业务线设置<el-tag v-if="orgDirty" size="small" type="warning" effect="light" class="tab-dot">*</el-tag></template>
            <el-card class="org-card" shadow="never">
              <template #header>
                <div class="org-card-head">
                  <span>业务线字典</span>
                  <template v-if="canWrite">
                    <el-input v-model="newBl" placeholder="新增业务线名" size="small" class="org-inline-input" @keyup.enter="addBl" />
                    <el-button size="small" type="primary" plain @click="addBl">新增业务线</el-button>
                  </template>
                  <el-tag v-else type="info" effect="plain">只读（无 admin:data-perm 权限）</el-tag>
                </div>
              </template>
              <el-alert type="info" :closable="false" show-icon class="org-hint"
                title="业务线只做登记（增删改名），此处不维护绑定关系：城市挂载在左树拖拽「城市 → 业务线节点」完成；站点直挂/继承在「站点配置」页签或左树拖拽完成。" />
              <el-table :data="blRows" size="default" table-layout="auto" :row-class-name="hlRow('bl')"
                empty-text="尚无业务线，请先新增（业务线用于按业务维度控制数据权限可见范围）">
                <el-table-column label="业务线名" min-width="140">
                  <template #default="{ row }"><span class="u-strong">{{ row.name }}</span></template>
                </el-table-column>
                <el-table-column label="直挂站点数" min-width="100" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.direct ? 'primary' : 'info'" effect="plain" size="small">{{ row.direct }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="继承站点数（经城市）" min-width="140" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.inherited ? 'primary' : 'info'" effect="plain" size="small">{{ row.inherited }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="挂载城市" min-width="180">
                  <template #default="{ row }">
                    <template v-if="row.cities.length">
                      <el-tag v-for="c in row.cities" :key="c" size="small" type="info" effect="plain" class="org-tag-gap">{{ c }}</el-tag>
                    </template>
                    <span v-else class="org-hint-inline">未挂载城市（左树拖拽城市到该业务线）</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" align="center" min-width="120">
                  <template #default="{ row }">
                    <el-tooltip content="重命名（数据权限规则中按名称引用该业务线的规则需同步调整）" placement="top">
                      <el-button link type="primary" size="small" :disabled="!canWrite" @click="renameBl(row.name)">改名</el-button>
                    </el-tooltip>
                    <el-tooltip content="删除业务线（直挂到该业务线的站点将失去业务线归属）" placement="top">
                      <el-button link type="danger" size="small" :disabled="!canWrite" @click="removeBl(row.name)">删除</el-button>
                    </el-tooltip>
                  </template>
                </el-table-column>
              </el-table>
              <template v-if="canWrite">
                <el-divider />
                <div class="org-city-head">
                  <span class="org-city-name">新站点默认策略</span>
                  <el-radio-group v-model="draft.default_new_site" :disabled="!canWrite">
                    <el-radio value="exclude">默认不纳入数据权限（推荐）</el-radio>
                    <el-radio value="include">默认纳入数据权限</el-radio>
                  </el-radio-group>
                </div>
                <div class="org-hint-inline">新出现在站点目录中的站点，按此策略决定是否自动进入数据权限可见范围。</div>
              </template>
            </el-card>
          </el-tab-pane>

          <!-- Tab：城市设置（纯字典：增删改名，不涉及绑定；绑定在左树拖拽或站点配置页签） -->
          <el-tab-pane name="city">
            <template #label>城市设置<el-tag v-if="orgDirty" size="small" type="warning" effect="light" class="tab-dot">*</el-tag></template>
            <el-card class="org-card" shadow="never">
              <template #header>
                <div class="org-card-head">
                  <span>城市字典</span>
                  <template v-if="canWrite">
                    <el-input v-model="newCity" placeholder="新增城市名" size="small" class="org-inline-input" @keyup.enter="addCity" />
                    <el-button size="small" type="primary" plain @click="addCity">新增城市</el-button>
                  </template>
                  <el-tag v-else type="info" effect="plain">只读（无 admin:data-perm 权限）</el-tag>
                </div>
              </template>
              <el-alert type="info" :closable="false" show-icon class="org-hint"
                title="城市只做登记（增删改名），此处不维护绑定关系：站点归入城市在「站点配置」页签或左树拖拽完成；城市挂载业务线在左树拖拽「城市 → 业务线节点」完成。城市是站点业务线「继承」的分组默认值。" />
              <el-table :data="cityRows" size="default" table-layout="auto" :row-class-name="hlRow('city')"
                empty-text="尚未配置城市，请先新增城市并将站点归入">
                <el-table-column label="城市名" min-width="140">
                  <template #default="{ row }"><span class="u-strong">{{ row.name }}</span></template>
                </el-table-column>
                <el-table-column label="归属站点数" min-width="100" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.stations ? 'primary' : 'info'" effect="plain" size="small">{{ row.stations }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="挂载业务线" min-width="220">
                  <template #default="{ row }">
                    <template v-if="row.bls.length">
                      <el-tag v-for="b in row.bls" :key="b" size="small" type="info" effect="plain" class="org-tag-gap">{{ b }}</el-tag>
                    </template>
                    <span v-else class="org-hint-inline">未挂载业务线（其下未直挂的站点无业务线归属）</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" align="center" min-width="120">
                  <template #default="{ row }">
                    <el-tooltip content="重命名（其下站点归属与业务线挂载随之更名；数据权限规则中按名称引用该城市的规则需同步调整）" placement="top">
                      <el-button link type="primary" size="small" :disabled="!canWrite" @click="renameCity(row.name)">改名</el-button>
                    </el-tooltip>
                    <el-tooltip content="删除城市（其下站点变为未归属；已直挂业务线的站点保留直挂）" placement="top">
                      <el-button link type="danger" size="small" :disabled="!canWrite" @click="removeCity(row.name)">删除</el-button>
                    </el-tooltip>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-tab-pane>

        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { onBeforeRouteLeave } from 'vue-router';
import { OfficeBuilding, Location, Shop } from '@element-plus/icons-vue';
import { fetchOrgStructure, saveOrgStructure, fetchStaff, fetchPositions } from '@shared/api/staff.js';
import { fetchStationManagers, saveStationManagers } from '@shared/api/dashboards.js';
import { useAuthStore } from '@shared/stores/auth.js';

const auth = useAuthStore();
const canWrite = computed(() => auth.hasPerm('admin:data-perm'));
/* 站点负责人（通知路由）写入权限与组织树写入权限独立：运营持有 config:write 即可维护映射。 */
const canMgrWrite = computed(() => auth.hasPerm('config:write'));

const tab = ref('station');
const error = ref('');
const saving = ref(false);
const teams = ref([]);
const teamsSource = ref('');
const newCity = ref('');
const newBl = ref('');

/* 草稿结构 = 后端保存结构：cities {城市:[站点id]}, business_lines {业务线:[城市]}, bl_stations {业务线:[站点id]}
   站点业务线归属：bl_stations 显式直挂优先；未直挂时继承城市（城市可属多条业务线）。 */
const draft = reactive({ cities: {}, business_lines: {}, bl_stations: {}, default_new_site: 'exclude' });
const ridersByTeam = ref({});
const staffByTeam = ref({});
const cityNames = computed(() => Object.keys(draft.cities));
const blNames = computed(() => Object.keys(draft.business_lines));
const ungrouped = computed(() => {
  const inOrg = new Set(Object.values(draft.cities).flat().map(String));
  return teams.value.filter((t) => !inOrg.has(String(t.id)));
});

/* ── 脏状态跟踪：草稿 vs 已保存基线，页头徽标 + 页签角标 + 离开守卫共用 ── */
const orgBaseline = ref('');
const orgSnapshot = () => JSON.stringify({ c: draft.cities, b: draft.business_lines, st: draft.bl_stations, d: draft.default_new_site });
const orgDirty = computed(() => orgBaseline.value !== '' && orgSnapshot() !== orgBaseline.value);
const dirty = orgDirty;

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm(
      '当前页有未保存的修改，离开将丢失。确定离开吗？',
      '未保存的更改', { type: 'warning', confirmButtonText: '离开', cancelButtonText: '留在本页' },
    );
    return true;
  } catch {
    return false;
  }
});

/* ── 常驻左树：业务线 → 城市 → 站点；节点带层级图标与语义状态点 ──
   状态语义：目录外失效 = 灰（muted），未归属/未分配 = 橙（warn），正常归属 = 绿（ok）。
   站点/城市节点携带 id/label，供拖拽绑定直接写入 draft。 */
const treeData = computed(() => {
  if (!cityNames.value.length && !blNames.value.length) return [];
  const catalogIds = new Set(teams.value.map((t) => String(t.id)));
  const teamNode = (t) => {
    const id = String(typeof t === 'object' ? t.id : t);
    // 展示站点名称：优先站点目录，其次负责人映射里登记的站点名，目录外且无登记才回退 ID
    const cat = teams.value.find((x) => String(x.id) === id);
    const mgrReg = mgrForm.stations.find((s) => s.id === id && s.stationName);
    const name = typeof t === 'object' ? t.name : (cat?.name || mgrReg?.stationName || id);
    const r = ridersByTeam.value[id] || 0;
    const s = staffByTeam.value[id] || 0;
    return {
      kind: 'station', key: 'station:' + id, id,
      label: name,
      dead: !catalogIds.has(id),
      countText: `骑手 ${r} · 人员 ${s}`,
    };
  };
  // 站点业务线归属：bl_stations 显式直挂优先，未直挂时继承城市
  const explicitBls = (tid) => blNames.value.filter((b) => (draft.bl_stations[b] || []).includes(tid));
  const cityNode = (c, bl) => ({
    kind: 'city', key: bl ? `city:${bl}:${c}` : 'city:' + c, id: c, label: c, ...(bl ? { bl } : {}),
    children: (draft.cities[c] || [])
      .map(teamNode)
      // 直挂到其他业务线的站点不在本业务线的城市子树重复出现；直挂本业务线或未直挂（继承）的显示
      .filter((n) => !bl || !explicitBls(n.id).length || explicitBls(n.id).includes(bl)),
  });
  const nodes = [];
  for (const b of blNames.value) {
    const owned = draft.business_lines[b] || [];
    const cities = cityNames.value.filter((c) => owned.includes(c));
    // 直挂站点：城市不在本业务线（或无城市）时直接挂业务线节点；城市在本业务线下时已由城市子树展示
    const direct = teams.value
      .map((t) => String(t.id))
      .filter((tid) => {
        if (!explicitBls(tid).includes(b)) return false;
        const city = cityNames.value.find((c) => (draft.cities[c] || []).includes(tid));
        return !city || !owned.includes(city);
      });
    nodes.push({
      kind: 'bl', key: 'bl:' + b, id: b, label: b,
      countText: `${cities.length} 城${direct.length ? ` · 直挂 ${direct.length} 站` : ''}`,
      children: [...cities.map((c) => cityNode(c, b)), ...direct.map((tid) => teamNode(tid))],
    });
  }
  const orphanCities = cityNames.value.filter((c) => !blNames.value.some((b) => (draft.business_lines[b] || []).includes(c)));
  if (orphanCities.length) {
    nodes.push({ kind: 'group', key: 'group:nobl', label: '未分配业务线', warn: false, children: orphanCities.map((c) => cityNode(c)) });
  }
  // 未归属站点 = 无城市且未直挂任何业务线（直挂的已出现在业务线节点下）
  const unassigned = ungrouped.value.filter((t) => !explicitBls(String(t.id)).length).map(teamNode);
  if (unassigned.length) {
    nodes.push({ kind: 'group', key: 'group:unassigned', label: '未归属站点', warn: true, countType: 'warning', countText: `${unassigned.length} 站`, children: unassigned });
  }
  return nodes;
});

/* ── 左树联动：点击节点切换页签并高亮对应行 ── */
const selected = ref(null);
const selectedKey = computed(() => selected.value?.key || '');

function onNodeClick(data) {
  selected.value = data;
  if (data?.kind === 'station') tab.value = 'station';
  else if (data?.kind === 'city') tab.value = 'city';
  else if (data?.kind === 'bl') tab.value = 'bl';
}

/* ── 站点配置主表：站点目录 + 负责人映射（同表绑定负责人；映射域独立于归属域，两个保存入口） ── */
const stationRows = computed(() => {
  const rows = teams.value.map((t) => ({ id: String(t.id), name: t.name, dead: false, fromMgr: false, mgrRef: null }));
  const have = new Set(rows.map((r) => r.id));
  for (const m of mgrForm.stations) {
    if (!m.id) rows.push({ id: '', name: '', dead: false, fromMgr: true, mgrRef: m, blank: true });
    else if (!have.has(m.id)) rows.push({ id: m.id, name: m.stationName || m.id, dead: true, fromMgr: true, mgrRef: m });
  }
  return rows;
});
function mgrRowOf(id) {
  return mgrForm.stations.find((s) => s.id === id) || null;
}
function managersOf(id) {
  return mgrRowOf(id)?.managers || [];
}
/* 目录站点尚无映射条目时惰性创建（编辑负责人/简称/地址时触发） */
function ensureMgrEntry(row) {
  let m = mgrRowOf(row.id);
  if (!m) {
    const t = teams.value.find((x) => String(x.id) === row.id);
    m = { id: row.id, stationName: t?.name || row.name || '', name: '', address: '', managers: [] };
    mgrForm.stations.push(m);
  }
  return m;
}
function setManagers(row, v) {
  if (!canMgrWrite.value) return;
  if (row.blank && !row.id) { ElMessage.warning('请先在「站点」列选择站点条目'); return; }
  ensureMgrEntry(row).managers = [...v];
}
function shortNameOf(row) { return mgrRowOf(row.id)?.name || ''; }
function addressOf(row) { return mgrRowOf(row.id)?.address || ''; }
function setShortName(row, v) {
  if (!canMgrWrite.value || row.blank) return;
  ensureMgrEntry(row).name = v;
}
function setAddress(row, v) {
  if (!canMgrWrite.value || row.blank) return;
  ensureMgrEntry(row).address = v;
}
/* 新增空白映射行：从站点目录选条目（自动回填目录权威名），或手输站点 ID */
function addMgrStation() {
  mgrForm.stations.push({ id: '', stationName: '', name: '', address: '', managers: [] });
  mgrAdding.value = true;
}
function onPickStation(row, v) {
  const m = row.mgrRef;
  if (!m) return;
  m.id = String(v || '').trim();
  const t = teams.value.find((x) => String(x.id) === m.id);
  if (t) m.stationName = t.name;
}
/* 整份覆盖写回 station_managers.json；成功返回 true（含刷新），失败提示并返回 false。 */
async function persistManagers() {
  const payload = {
    stations: mgrForm.stations
      .map((s) => ({
        station_id: s.id.trim(),
        station_name: s.stationName.trim(),
        name: s.name.trim(),
        address: s.address.trim(),
        managers: (s.managers || []).map((m) => m.trim()).filter(Boolean),
      }))
      .filter((s) => s.name || s.station_name || s.station_id || s.managers.length),
  };
  const r = await saveStationManagers(payload);
  const d = (r && r.data) || r || {};
  if (!(d && d.ok)) {
    ElMessage.error((d && d.error) || '保存失败');
    return false;
  }
  if (d.warning) ElMessage.warning({ message: d.warning, duration: 8000, showClose: true });
  await loadManagers();
  return true;
}
/* 解除站点映射：确认后直接落盘（无二次保存），目录外条目整行移除。 */
async function unbindMgrRow(row) {
  const m = mgrRowOf(row.id);
  if (!m) return;
  const label = row.name || m.stationName || row.id;
  const managers = m.managers.join('、') || '无';
  const rowStyle = 'display:flex;gap:8px;margin-top:8px;line-height:1.6;';
  const labelStyle = 'flex:none;color:var(--el-text-color-secondary);min-width:52px;';
  const confirmMsg = h('div', null, [
    h('div', { style: 'font-weight:600;margin-bottom:12px;' }, '确认解除该站点的配置？'),
    h('div', { style: rowStyle }, [h('span', { style: labelStyle }, '站点：'), h('span', null, label)]),
    h('div', { style: rowStyle }, [h('span', { style: labelStyle }, '负责人：'), h('span', null, managers)]),
    h('div', { style: 'margin-top:12px;color:var(--el-color-danger);line-height:1.6;' }, '解除后将清空负责人、简称与地址，并移除该站点的城市与业务归属（移入「暂无业务线归属」清单）；通知任务不再对该站 @ 负责人。'),
  ]);
  try {
    await ElMessageBox.confirm(confirmMsg, '解除站点配置', {
      type: 'warning', confirmButtonText: '解除', cancelButtonText: '取消',
    });
  } catch { return; }
  const i = mgrForm.stations.indexOf(m);
  if (i >= 0) mgrForm.stations.splice(i, 1);
  mgrSaving.value = true;
  saving.value = true;
  try {
    // 两个数据域都立即落盘：先清归属（org_tree），再清负责人映射（station_managers）
    const cities = Object.fromEntries(
      Object.entries(draft.cities).map(([c, arr]) => [c, arr.filter((x) => x !== row.id)]),
    );
    const blStations = Object.fromEntries(
      Object.entries(draft.bl_stations).map(([b, arr]) => [b, arr.filter((x) => x !== row.id)]),
    );
    const orgRes = await saveOrgStructure({
      cities,
      business_lines: draft.business_lines,
      bl_stations: blStations,
      default_new_site: draft.default_new_site,
    });
    if (!orgRes || !orgRes.ok) {
      ElMessage.error((orgRes && orgRes.error) || '组织归属清理失败');
      return;
    }
    if (!(await persistManagers())) return;
    await load(); // 统一从后端刷新草稿与基线
    ElMessage.success(`已解除「${label}」的配置`);
    mgrAdding.value = false;
  } catch (e) {
    ElMessage.error(e.message || '解除失败');
  } finally {
    mgrSaving.value = false;
    saving.value = false;
  }
}
/* 按需保存：点「添加站点映射」后操作列出现此入口，整份覆盖写回后复位。 */
async function onSaveManagers() {
  mgrSaving.value = true;
  try {
    if (await persistManagers()) {
      ElMessage.success('负责人映射已保存');
      mgrAdding.value = false;
    }
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    mgrSaving.value = false;
  }
}
/* 左树选中 → 表格行高亮（station 按行 id，bl/city 按行名） */
function hlRow(kind) {
  return ({ row }) => {
    const s = selected.value;
    if (!s || s.kind !== kind) return '';
    return (kind === 'station' ? s.id === row.id : s.label === row.name) ? 'is-hl-row' : '';
  };
}

/* ── 业务线/城市字典行（含只读统计，编辑在「站点配置」页签与左树） ── */
const explicitTids = computed(() => new Set(Object.values(draft.bl_stations).flat()));
const blRows = computed(() => blNames.value.map((b) => {
  const owned = draft.business_lines[b] || [];
  let inherited = 0;
  for (const c of owned) {
    for (const tid of draft.cities[c] || []) if (!explicitTids.value.has(tid)) inherited++;
  }
  return { name: b, direct: (draft.bl_stations[b] || []).length, inherited, cities: [...owned] };
}));
const cityRows = computed(() => cityNames.value.map((c) => ({
  name: c,
  stations: (draft.cities[c] || []).length,
  bls: blNames.value.filter((b) => (draft.business_lines[b] || []).includes(c)),
})));

/* ── 拖拽绑定：仅站点/城市节点可拖，仅「放入节点内部」生效 ──
   站点 → 业务线节点：直挂该业务线（显式归属，不再继承城市）；
   站点 → 城市节点：归入城市并直挂所在业务线（未分配业务线分组内的城市仅城市归属）；
   站点 → 未归属分组：移出城市与直挂；城市 → 业务线节点：城市挂载；
   城市 → 未分配分组：移出业务线。 */
function allowDrag(node) {
  return canWrite.value && (node.data.kind === 'station' || node.data.kind === 'city');
}

function allowDrop(draggingNode, dropNode, type) {
  if (type !== 'inner') return false; // 只允许放入节点内部（作为子节点绑定）
  const d = draggingNode.data, t = dropNode.data;
  if (d.kind === 'station') return t.kind === 'city' || t.kind === 'bl' || (t.kind === 'group' && t.warn === true);
  if (d.kind === 'city') return t.kind === 'bl' || (t.kind === 'group' && t.warn === false);
  return false;
}

function removeStationEverywhere(tid) {
  for (const c of Object.keys(draft.cities)) {
    const arr = draft.cities[c];
    const i = arr.indexOf(tid);
    if (i >= 0) arr.splice(i, 1);
  }
  for (const b of Object.keys(draft.bl_stations)) {
    const arr = draft.bl_stations[b];
    const i = arr.indexOf(tid);
    if (i >= 0) arr.splice(i, 1);
  }
}

function assignStationToBl(tid, bl) {
  for (const b of Object.keys(draft.bl_stations)) {
    const arr = draft.bl_stations[b];
    const i = arr.indexOf(tid);
    if (i >= 0) arr.splice(i, 1);
  }
  const arr = draft.bl_stations[bl] || (draft.bl_stations[bl] = []);
  if (!arr.includes(tid)) arr.push(tid);
}

function removeCityEverywhere(city) {
  for (const b of Object.keys(draft.business_lines)) {
    const arr = draft.business_lines[b];
    const i = arr.indexOf(city);
    if (i >= 0) arr.splice(i, 1);
  }
}

function onNodeDrop(draggingNode, dropNode) {
  const d = draggingNode.data, t = dropNode.data;
  if (d.kind === 'station' && t.kind === 'city') {
    removeStationEverywhere(d.id);
    const arr = draft.cities[t.label] || (draft.cities[t.label] = []);
    if (!arr.includes(d.id)) arr.push(d.id);
    if (t.bl) {
      // 树里挂在哪条业务线下，站点就直挂到哪条（所见即所得，不再被城市带去其他业务线）
      assignStationToBl(d.id, t.bl);
      ElMessage.success(`站点「${d.label}」已归入「${t.label}」并直挂业务线「${t.bl}」，保存组织配置后生效`);
    } else {
      ElMessage.success(`站点「${d.label}」已归入「${t.label}」（未挂业务线的城市，仅城市归属），保存组织配置后生效`);
    }
  } else if (d.kind === 'station' && t.kind === 'bl') {
    assignStationToBl(d.id, t.label);
    ElMessage.success(`站点「${d.label}」已直挂业务线「${t.label}」（显式归属，不再继承城市业务线），保存组织配置后生效`);
  } else if (d.kind === 'station' && t.kind === 'group') {
    removeStationEverywhere(d.id);
    ElMessage.success(`站点「${d.label}」已移出城市与业务线直挂，保存组织配置后生效`);
  } else if (d.kind === 'city' && t.kind === 'bl') {
    removeCityEverywhere(d.label);
    const arr = draft.business_lines[t.label] || (draft.business_lines[t.label] = []);
    if (!arr.includes(d.label)) arr.push(d.label);
    ElMessage.success(`城市「${d.label}」已挂载到业务线「${t.label}」（其下未直挂的站点随之继承），保存组织配置后生效`);
  } else if (d.kind === 'city' && t.kind === 'group') {
    removeCityEverywhere(d.label);
    ElMessage.success(`城市「${d.label}」已移出业务线，保存组织配置后生效`);
  }
}

async function load() {
  error.value = '';
  try {
    const r = await fetchOrgStructure();
    if (r && r.ok) {
      teams.value = r.teams || [];
      teamsSource.value = r.teams_source || '';
      const cities = {};
      for (const [c, arr] of Object.entries(r.cities || {})) {
        cities[c] = (arr || []).map((x) => String(typeof x === 'object' ? x.id : x));
      }
      draft.cities = cities;
      // 业务线归属直接用权威存储 bl_cities（{业务线: [城市]}）：一个城市可挂多条业务线，
      // 旧字段 bl_of_city 是 city→bl 单值投影，反推会静默丢掉第二条业务线的归属
      let blMap;
      if (r.bl_cities && typeof r.bl_cities === 'object') {
        blMap = Object.fromEntries(Object.entries(r.bl_cities).map(([b, cs]) => [b, [...(cs || [])]]));
      } else {
        // 兼容旧响应：bl_of_city 反推 + r.business_lines（全量名数组）补齐空业务线
        blMap = {};
        for (const [c, b] of Object.entries(r.bl_of_city || {})) {
          (blMap[b] = blMap[b] || []).push(c);
        }
        for (const b of r.business_lines || []) {
          if (b && !blMap[b]) blMap[b] = [];
        }
      }
      draft.business_lines = blMap;
      draft.bl_stations = Object.fromEntries(
        Object.entries(r.bl_stations || {}).map(([b, arr]) => [b, (arr || []).map(String)]),
      );
      draft.default_new_site = r.default_new_site || 'exclude';
      ridersByTeam.value = r.riders_by_team || {};
      staffByTeam.value = r.staff_by_team || {};
      orgBaseline.value = orgSnapshot();
    } else {
      error.value = (r && r.error) || '加载失败';
    }
  } catch (e) {
    error.value = e.message || '加载失败';
  }
}

/* ── 站点行：城市 / 业务线归属设置（直挂优先 / 继承城市）与生效展示 ── */
function cityOf(tid) {
  const t = String(tid);
  return cityNames.value.find((c) => (draft.cities[c] || []).includes(t)) || '';
}
function setStationCity(tid, city) {
  const t = String(tid);
  for (const c of Object.keys(draft.cities)) {
    const arr = draft.cities[c];
    const i = arr.indexOf(t);
    if (i >= 0) arr.splice(i, 1);
  }
  if (city) {
    const arr = draft.cities[city] || (draft.cities[city] = []);
    if (!arr.includes(t)) arr.push(t);
  } // 清空城市 = 移出归属；已直挂的业务线保留，站点仍在业务线节点下显示
}
function directBlOf(tid) {
  const t = String(tid);
  return blNames.value.find((b) => (draft.bl_stations[b] || []).includes(t)) || '';
}
function setDirectBl(tid, bl) {
  const t = String(tid);
  if (bl) assignStationToBl(t, bl);
  else for (const b of Object.keys(draft.bl_stations)) {
    const arr = draft.bl_stations[b];
    const i = arr.indexOf(t);
    if (i >= 0) arr.splice(i, 1);
  }
}
function effectiveBls(tid) {
  const t = String(tid);
  const direct = blNames.value.filter((b) => (draft.bl_stations[b] || []).includes(t));
  if (direct.length) return direct; // 显式直挂优先
  const city = cityNames.value.find((c) => (draft.cities[c] || []).includes(t));
  return city ? blNames.value.filter((b) => (draft.business_lines[b] || []).includes(city)) : [];
}
/* 暂无业务线归属的站点（未直挂且城市未挂业务线，含目录外失效站点）：汇总在主表下方快速配置 */
const noBlRows = computed(() => {
  const out = [];
  for (const t of teams.value) {
    const tid = String(t.id);
    if (!effectiveBls(tid).length) out.push({ id: tid, name: t.name, dead: false });
  }
  for (const m of mgrForm.stations) {
    if (!m.id || teams.value.some((x) => String(x.id) === m.id)) continue;
    if (!effectiveBls(m.id).length) out.push({ id: m.id, name: m.stationName || m.id, dead: true });
  }
  return out;
});
/* 新增站点映射的可选站点：仅目录内、且当前无业务归属的站点（有归属的已能正常维护，无需重复映射） */
const addableStationOptions = computed(() => teams.value.filter((t) => !effectiveBls(String(t.id)).length));
/* 主表去重：未配置业务归属的站点只在下方汇总区显示（目录外失效行保留在主表，便于解除映射） */
const noBlIds = computed(() => new Set(noBlRows.value.filter((r) => !r.dead).map((r) => r.id)));
const mainStationRows = computed(() => stationRows.value.filter((r) => !noBlIds.value.has(r.id)));

async function onSave() {
  // 业务归属必选：未直挂且未从城市继承到任何业务线的目录站点，禁止保存组织配置
  const missing = teams.value.filter((t) => !effectiveBls(String(t.id)).length);
  if (missing.length) {
    tab.value = 'station';
    ElMessage.error(
      `业务归属为必选，以下 ${missing.length} 个站点尚未配置：${missing.slice(0, 5).map((t) => t.name).join('、')}${missing.length > 5 ? ' 等' : ''}（已在下方汇总区列出）`,
    );
    return;
  }
  saving.value = true;
  try {
    const r = await saveOrgStructure({
      cities: draft.cities,
      business_lines: draft.business_lines,
      bl_stations: draft.bl_stations,
      default_new_site: draft.default_new_site,
    });
    if (r && r.ok) {
      ElMessage.success('组织架构已保存（同时生效于数据权限可见范围）');
      await load(); // load 内部会刷新 orgBaseline
    } else {
      ElMessage.error((r && r.error) || '保存失败');
    }
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

/* ── 业务线字典：增删改名（保留键序；改名同步 bl_stations 直挂引用） ── */
async function renameBl(b) {
  let value;
  try {
    ({ value } = await ElMessageBox.prompt(`将业务线「${b}」重命名为：`, '业务线改名', {
      confirmButtonText: '重命名', cancelButtonText: '取消',
      inputPattern: /\S/, inputErrorMessage: '业务线名不能为空', inputValue: b,
    }));
  } catch { return; }
  const to = String(value || '').trim();
  if (!to || to === b) return;
  if (draft.business_lines[to]) { ElMessage.warning('业务线名已存在'); return; }
  try {
    await ElMessageBox.confirm(
      '数据权限规则中按名称引用该业务线的规则（业务线维度）不会自动更名，需到「系统设置 → 权限管理」同步调整。确定继续？',
      '确认重命名', { type: 'warning', confirmButtonText: '继续', cancelButtonText: '取消' },
    );
  } catch { return; }
  draft.business_lines = Object.fromEntries(Object.entries(draft.business_lines).map(([k, v]) => [k === b ? to : k, v]));
  draft.bl_stations = Object.fromEntries(Object.entries(draft.bl_stations).map(([k, v]) => [k === b ? to : k, v])); // 直挂引用随改名迁移
  ElMessage.success(`业务线已更名为「${to}」，保存组织配置后生效`);
}

function addBl() {
  const b = newBl.value.trim();
  if (!b) return;
  if (draft.business_lines[b]) { ElMessage.warning('业务线已存在'); return; }
  draft.business_lines[b] = [];
  newBl.value = '';
}

async function removeBl(b) {
  try {
    await ElMessageBox.confirm(`删除业务线「${b}」？直挂到该业务线的站点将失去业务线归属。`, '删除业务线', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
  } catch { return; }
  const { [b]: _omit, ...rest } = draft.business_lines;
  draft.business_lines = rest;
  const { [b]: _omitSt, ...restSt } = draft.bl_stations; // 同步清理直挂引用，避免挂空
  draft.bl_stations = restSt;
}

/* ── 城市字典：增删改名（改名同步站点归属键与业务线挂载引用） ── */
async function renameCity(c) {
  let value;
  try {
    ({ value } = await ElMessageBox.prompt(`将城市「${c}」重命名为（其下站点归属与业务线挂载随之更名）：`, '城市改名', {
      confirmButtonText: '重命名', cancelButtonText: '取消',
      inputPattern: /\S/, inputErrorMessage: '城市名不能为空', inputValue: c,
    }));
  } catch { return; }
  const to = String(value || '').trim();
  if (!to || to === c) return;
  if (draft.cities[to]) { ElMessage.warning('城市名已存在'); return; }
  try {
    await ElMessageBox.confirm(
      '数据权限规则中按名称引用该城市的规则（城市维度）不会自动更名，需到「系统设置 → 权限管理」同步调整。确定继续？',
      '确认重命名', { type: 'warning', confirmButtonText: '继续', cancelButtonText: '取消' },
    );
  } catch { return; }
  draft.cities = Object.fromEntries(Object.entries(draft.cities).map(([k, v]) => [k === c ? to : k, v]));
  draft.business_lines = Object.fromEntries(
    Object.entries(draft.business_lines).map(([b, cs]) => [b, cs.map((x) => (x === c ? to : x))]),
  ); // 业务线挂载引用随改名迁移
  ElMessage.success(`城市已更名为「${to}」，保存组织配置后生效`);
}

function addCity() {
  const c = newCity.value.trim();
  if (!c) return;
  if (draft.cities[c]) { ElMessage.warning('城市已存在'); return; }
  draft.cities[c] = [];
  newCity.value = '';
}

async function removeCity(c) {
  const n = (draft.cities[c] || []).length;
  try {
    await ElMessageBox.confirm(
      `删除城市「${c}」？${n ? `其下 ${n} 个站点将变为未归属（不影响数据权限中已配置的用户规则）。` : ''}`,
      '删除城市', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch { return; }
  const { [c]: _omit, ...rest } = draft.cities;
  draft.cities = rest;
  removeCityEverywhere(c); // 同步清理业务线里对该城市的引用，避免保存后业务线挂空城市
}

/* ── 站点负责人（通知路由）：读写 station_managers.json（/notify/station-managers）──
   负责人基础信息（姓名/手机号/职位）在「人事管理 → 人员管理」维护。
   mgrAdding：点「添加站点映射」后操作列才出现「保存」按钮，保存成功复位；「解除」确认后直接落盘。 */
const mgrAdding = ref(false);
const mgrSaving = ref(false);
const mgrForm = reactive({ stations: [] });

/* 负责人候选：在职人员按岗位分组（岗位字典顺序：已登记按 sort，未登记靠后，未填岗位最后）。 */
const positions = ref([]);
const staffRows = ref([]);
const nameGroups = computed(() => {
  const dict = new Map(positions.value.map((p) => [p.name, p.registered ? p.sort : 1_000_000]));
  const groups = new Map();
  for (const s of staffRows.value) {
    const label = s.position || '未填岗位';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(s.name);
  }
  return [...groups.entries()]
    .map(([label, names]) => ({ label, names: names.sort((a, b) => a.localeCompare(b, 'zh')) }))
    .sort((a, b) => {
      const ka = a.label === '未填岗位' ? 1_100_000 : (dict.get(a.label) ?? 1_000_000);
      const kb = b.label === '未填岗位' ? 1_100_000 : (dict.get(b.label) ?? 1_000_000);
      return ka !== kb ? ka - kb : a.label.localeCompare(b.label, 'zh');
    });
});

function normalizeMgr(d) {
  mgrForm.stations = ((d && d.stations) || []).map((st) => ({
    id: st.station_id || '',
    stationName: st.station_name || (st.teams || [])[0] || '',
    name: st.name || '',
    address: st.address || '',
    managers: [...(st.managers || [])],
  }));
}

/* 一致性巡检告警：后端对配置姓名与花名册做客观比对（查无此人/已离职/站点无负责人）。 */
const mgrConsistency = ref(null);
const mgrIssues = computed(() => {
  const c = mgrConsistency.value;
  if (!c) return [];
  const out = [];
  if (c.no_manager?.length) out.push(`未配置负责人的站点：${c.no_manager.join('、')}`);
  if (c.unknown?.length) out.push(`花名册查无此人的姓名（任务将无法 @ 到）：${c.unknown.join('、')}`);
  if (c.inactive?.length) out.push(`已离职/停用仍被引用的姓名：${c.inactive.map((x) => x.name).join('、')}`);
  return out;
});

async function loadManagers() {
  try {
    const r = await fetchStationManagers();
    const d = (r && r.data) || r || {};
    normalizeMgr(d);
    mgrConsistency.value = (r && r.consistency) || d.consistency || null;
  } catch (e) {
    ElMessage.error(e.message || '加载站点负责人配置失败');
  }
}

async function loadStaffNames() {
  try {
    const r = await fetchStaff({ status: 'active', pageSize: 500 });
    const rows = (r && (r.rows || (r.data && r.data.rows))) || [];
    staffRows.value = rows.map((x) => ({ name: x.name, position: (x.position || '').trim() })).filter((x) => x.name);
  } catch {
    /* 花名册不可用时不阻塞页面，下拉仍支持手输 */
  }
}

/* 岗位字典仅用于负责人下拉的分组排序（轻量加载，编辑在「岗位设置」页） */
async function loadPositionDict() {
  try {
    const r = await fetchPositions();
    if (r && r.ok) positions.value = r.rows || [];
  } catch {
    /* 字典不可用时下拉按岗位名分组即可 */
  }
}

onMounted(() => {
  load();
  loadManagers();
  loadStaffNames();
  loadPositionDict();
});
</script>

<style scoped>
.org { padding: var(--sp-20); height: 100%; display: flex; flex-direction: column; }
.org-bar { display: flex; align-items: center; gap: var(--sp-12); margin-bottom: var(--sp-16); flex: none; }
.v-title { margin: 0; font-size: var(--el-font-size-extra-large); }
.org-src { color: var(--el-text-color-secondary); font-size: var(--el-font-size-small); }
.org-bar .sp { flex: 1; }
.org-hint { margin-bottom: var(--sp-12); flex: none; }

/* 左右联动布局：常驻左树（自适应宽，大屏更宽裕）+ 右侧页签编辑区 */
.org-main { flex: 1; min-height: 0; display: flex; gap: var(--sp-16); }
/* 卡片宽度随视口伸缩：320px 下限保证中屏可用，440px 上限避免大屏过宽挤压编辑区 */
.org-side { width: clamp(320px, 26vw, 440px); flex: none; display: flex; flex-direction: column; }
.org-side :deep(.el-card__body) { flex: 1; min-height: 0; overflow: auto; padding-top: var(--sp-8); }
.org-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
@media (max-width: 992px) {
  .org-main { flex-direction: column; }
  .org-side { width: 100%; max-height: 320px; }
}

.org-card-head { display: flex; align-items: center; gap: var(--sp-12); justify-content: space-between; flex-wrap: wrap; }
.org-head-right { margin-left: auto; }
.org-legend { display: flex; align-items: center; gap: var(--sp-8); color: var(--el-text-color-secondary); font-size: var(--el-font-size-small); margin-bottom: var(--sp-8); flex-wrap: wrap; }
.org-drag-hint { color: var(--el-text-color-secondary); font-size: var(--el-font-size-small); background: var(--el-fill-color-light); border-radius: var(--el-border-radius-small); padding: var(--sp-8); margin-bottom: var(--sp-8); }
.org-inline-input { width: 160px; }

/* 页签容器：沿用 StandardView 的 card 模式，内容区独立滚动 */
.org-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.org-tabs :deep(.el-tabs__header) { margin-bottom: var(--sp-12); flex: none; }
.org-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; overflow: auto; }
.org-tabs :deep(.el-tab-pane) { min-height: 100%; }
.tab-dot { padding: 0 var(--sp-4); margin-left: var(--sp-4); line-height: 1; }

.org-city-head { display: flex; align-items: center; gap: var(--sp-8); margin-bottom: var(--sp-8); flex-wrap: wrap; }
.org-city-name { font-weight: var(--fw-semibold); font-size: var(--el-font-size-base); }

/* 字典表标签间距 + 左树选中 → 表格行高亮 */
.org-tag-gap { margin-right: var(--sp-4); }
.org-card :deep(.is-hl-row) { --el-table-tr-bg-color: var(--el-color-primary-light-9); }

/* 站点主表行内控件 */
.org-cell-sel { width: 100%; }
.org-short-input { max-width: 130px; }
.org-st-tags { display: inline-flex; align-items: center; gap: var(--sp-4); margin-left: var(--sp-8); flex-wrap: wrap; }

/* 暂无业务线归属站点汇总区：站点名 + 城市归属 + 直挂设置 */
.org-nobl-row { display: flex; align-items: center; gap: var(--sp-8); margin-bottom: var(--sp-6); }
.org-nobl-id { min-width: 120px; font-variant-numeric: tabular-nums; }
.org-missing-hint { color: var(--el-color-danger); font-size: var(--el-font-size-small); }

.org-hint-inline { color: var(--el-text-color-secondary); font-size: var(--el-font-size-small); font-weight: var(--fw-regular, 400); }
.u-strong { font-weight: var(--fw-semibold); }

/* 树节点：层级图标 + 语义状态点（复用 base.css 的 ui-dot 全局类） */
.org-tree { --el-tree-node-content-height: 32px; }
/* 拖拽悬停高亮：EP 内置高亮只作用于其自带 label 元素，本页用自定义插槽，需自行补反馈样式 */
.org-tree :deep(.el-tree-node.is-drop-inner > .el-tree-node__content) {
  background-color: var(--el-color-primary-light-8);
  border-radius: var(--el-border-radius-base);
  outline: 1px dashed var(--el-color-primary);
}
.org-tree :deep(.el-tree-node .el-tree-node__content) { cursor: grab; }
.org-tree :deep(.el-tree-node .el-tree-node__content:active) { cursor: grabbing; }
/* 节点行单行排版：站点名过长时省略号（悬停 title 看全名），计数标签完整显示，绝不折行遮挡下一行 */
.org-tree-node { display: inline-flex; align-items: center; gap: var(--sp-8); font-size: var(--el-font-size-small); white-space: nowrap; max-width: 100%; min-width: 0; }
.org-tree-label { overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; }
.org-tree-node :deep(.el-tag) { flex: none; }
.org-tree :deep(.el-tree-node__content) { overflow: hidden; }
.org-tree-node.is-root { font-weight: var(--fw-semibold); }
.org-tree-node.is-selected { color: var(--el-color-primary); }
.tn-icon { color: var(--el-text-color-secondary); flex: none; }

.mgr-sel { width: 100%; }
</style>
