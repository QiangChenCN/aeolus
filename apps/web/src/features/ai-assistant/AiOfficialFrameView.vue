<template>
  <div class="frame-page">
    <iframe
      ref="frameEl"
      class="frame"
      :src="src"
      title="DeepSeek Harness 官方 WebUI"
      allow="clipboard-read; clipboard-write"
    ></iframe>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const frameEl = ref(null);
const src = '/ai-official/';
</script>

<style scoped>
/* 官方 WebUI 以 iframe 嵌入 Aeolus 主内容区，保留顶栏/侧栏，功能与原生完全一致。 */
.frame-page { height: 100%; width: 100%; background: #fff; }
.frame { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
</style>
