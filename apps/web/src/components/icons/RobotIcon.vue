<template>
  <svg
    viewBox="0 0 1024 1024"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="64"
    stroke-linecap="round"
    stroke-linejoin="round">
    <!-- 天线 -->
    <path d="M512 224V128" />
    <circle cx="512" cy="88" r="40" fill="currentColor" stroke="none" />
    <!-- 头部 -->
    <rect x="176" y="224" width="672" height="512" rx="96" />
    <!-- 眼睛 -->
    <circle cx="384" cy="464" r="40" fill="currentColor" stroke="none" />
    <circle cx="640" cy="464" r="40" fill="currentColor" stroke="none" />
    <!-- 嘴 -->
    <path d="M400 608h224" />
    <!-- 耳侧 -->
    <path d="M176 400h-56v160h56" />
    <path d="M848 400h56v160h-56" />
    <!-- 底座 -->
    <path d="M400 736v64h224v-64" />
    <path d="M288 864h448" />
  </svg>
</template>

<script setup>
defineOptions({ name: 'RobotIcon' });
</script>
