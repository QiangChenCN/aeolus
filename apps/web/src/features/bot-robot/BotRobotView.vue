<template>
  <div class="bc">
    <h2 class="v-title">凭证管理</h2>

    <!-- 凭据分组（机器人 AppKey / AppSecret） -->
    <el-card class="bc-card" shadow="never">
      <h3 class="bc-h">
        机器人凭据分组
        <el-button size="small" type="primary" style="margin-left:12px" @click="openCredAdd">新增机器人</el-button>
      </h3>
      <el-table :data="creds" stripe border class="bc-table" v-loading="credsLoading">
        <el-table-column prop="label" label="名称" min-width="140" />
        <el-table-column prop="id" label="凭证ID" min-width="160" />
        <el-table-column label="渠道" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'wecom' ? 'warning' : 'success'">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="clientId" label="应用ID" min-width="200" />
        <el-table-column label="AppSecret" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.hasSecret" size="small" type="success">已配置</el-tag>
            <el-tag v-else size="small" type="danger">未配置</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="被引用" min-width="150">
          <template #default="{ row }">
            <el-tag v-if="referencedBy(row.id).length" size="small" type="success">{{ referencedBy(row.id).join('、') }}</el-tag>
            <span v-else class="muted">未使用</span>
          </template>
        </el-table-column>
        <el-table-column label="凭据启用" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="openCredEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteCred(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p class="muted bc-tip">
        每个分组对应一个机器人应用的凭据定义；连接状态请在「实例管理」查看，实例通过「凭据分组」绑定后按分组各自建立独立连接（渠道类型不限于钉钉）。
      </p>
    </el-card>

    <!-- 凭据编辑弹窗 -->
    <el-dialog v-model="credDialog" :title="credEditing ? '编辑机器人：' + credForm.id : '新增机器人'" width="520px">
      <el-form label-width="150px">
        <el-form-item label="凭证ID">
          <el-input v-model="credForm.id" :disabled="credEditing" placeholder="如 dingtalk:achievement" />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="credForm.label" placeholder="展示名，留空则用凭证ID" />
        </el-form-item>
        <el-form-item label="渠道类型">
          <el-select v-model="credForm.type" placeholder="选择渠道">
            <el-option v-for="(m, key) in CHANNEL_META" :key="key" :label="m.label" :value="key" />
          </el-select>
          <span class="muted" style="margin-left:8px">机器人所属平台；决定下方凭据字段与建连方式</span>
        </el-form-item>
        <el-form-item :label="activeMeta.clientIdLabel">
          <el-input v-model="credForm.clientId" :placeholder="activeMeta.secretHint" />
        </el-form-item>
        <el-form-item :label="activeMeta.secretLabel">
          <el-input
            v-model="credForm.secret" type="password" show-password
            :placeholder="credEditing && credForm.hasSecret ? '已配置（留空表示不修改）' : '应用密钥'" />
        </el-form-item>
        <el-form-item
          v-for="f in activeMeta.extra"
          :key="f.key"
          :label="f.label">
          <el-input v-model="credForm.extra[f.key]" :placeholder="f.placeholder" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="credForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="credDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingCred" @click="saveCred">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { CHANNEL_META, useBotConfig } from '@shared/composables/useBotConfig.js';

const {
  status, creds, credsLoading, credDialog, credEditing, savingCred, credForm,
  loadAll, openCredAdd, openCredEdit, saveCred, deleteCred, typeLabel, activate, deactivate,
} = useBotConfig();

const activeMeta = computed(() => CHANNEL_META[credForm.type] || CHANNEL_META.dingtalk);

/** 只读：哪些实例引用了此凭据分组。连接状态统一在「实例管理」页呈现。 */
function referencedBy(id) {
  return (status.bots || []).filter((b) => b.credentialsRef === id).map((b) => b.displayName);
}

onMounted(async () => { activate(); await loadAll(); });
onUnmounted(deactivate);
</script>

<style scoped>
.bc { padding: var(--sp-20); }
.v-title { margin: 0 0 var(--sp-16); font-size: var(--el-font-size-extra-large); }
.bc-card :deep(.el-card__body) { padding: var(--sp-16) var(--sp-20); }
.bc-h { margin: 0 0 var(--sp-12); font-size: var(--el-font-size-medium); }
.bc-table { margin-top: var(--sp-8); }
.bc-tip { margin-top: var(--sp-8); }
.muted { color: var(--el-text-color-secondary); }
</style>
