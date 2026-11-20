<template>
  <!-- 列表项图标：按 name 输出内联 SVG（保留 currentColor），各页数据化后共享，避免内联 path 重复。 -->
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <template v-if="name === 'task'">
      <rect x="4" y="3.5" width="16" height="17" rx="2.5"/>
      <path d="m8.5 12 2.3 2.3 4.7-4.8" stroke-linecap="round" stroke-linejoin="round"/>
    </template>
    <template v-else-if="name === 'appeal'">
      <path d="M21 11.5a8.5 8.5 0 1 1-4.6-7.6" stroke-linecap="round"/>
      <path d="M9 12.5 12 15.5 20 7" stroke-linecap="round"/>
    </template>
    <template v-else-if="name === 'calendar'">
      <rect x="3.5" y="5" width="17" height="16" rx="2.5"/>
      <path d="M8 3v4M16 3v4M3.5 10h17" stroke-linecap="round"/>
    </template>
    <template v-else-if="name === 'health'">
      <rect x="3.5" y="6" width="17" height="13" rx="2.5"/>
      <path d="M9 3.5h6M9 12h6M9 15.5h4" stroke-linecap="round"/>
    </template>
    <template v-else-if="name === 'notice'">
      <path d="M4 5.5h16A1.5 1.5 0 0 1 21.5 7v9a1.5 1.5 0 0 1-1.5 1.5h-9L6.5 21v-3.5H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5z" stroke-linejoin="round"/>
    </template>
    <template v-else-if="name === 'bell'">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
      <path d="M10.3 21a2 2 0 0 0 3.4 0"/>
    </template>
  </svg>
</template>

<script setup>
defineProps({ name: { type: String, required: true } });
</script>
