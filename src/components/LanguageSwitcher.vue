<template>
  <el-dropdown @command="handleCommand">
    <span class="el-dropdown-link">
      {{ currentLanguage }}
      <el-icon class="el-icon--right">
        <arrow-down />
      </el-icon>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="en-US">English</el-dropdown-item>
        <el-dropdown-item command="zh-CN">中文</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown } from '@element-plus/icons-vue'

const { locale } = useI18n()

const currentLanguage = computed(() => {
  return locale.value === 'zh-CN' ? '中文' : 'English'
})

const handleCommand = (command) => {
  locale.value = command
  localStorage.setItem('locale', command)
}
</script>