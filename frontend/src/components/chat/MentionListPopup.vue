<template>
  <div class="mention-list-popup">
    <div
      v-for="(opt, idx) in options"
      :key="idx"
      class="mention-item"
      :class="{ 'is-active': idx === activeIndex }"
      @mousedown.prevent="$emit('select', opt)"
    >
      <span class="mention-icon">
        {{ opt.type === 'class' ? '🧩' : (opt.type === 'folder' ? '📁' : '📄') }}
      </span>
      <span class="mention-label">{{ opt.label }}</span>
      <span class="mention-detail">{{ opt.detail }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface MentionOption {
  type: string;
  label: string;
  value: string;
  detail: string;
}

defineProps<{
  options: MentionOption[];
  activeIndex: number;
}>();

defineEmits<{
  (e: 'select', opt: MentionOption): void;
}>();
</script>

<style scoped>
.mention-list-popup {
  position: absolute;
  bottom: 80px;
  left: 16px;
  right: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
}

.mention-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  transition: background 0.2s ease;
}

.mention-item:hover, .mention-item.is-active {
  background: rgba(99, 102, 241, 0.15);
  color: var(--text-primary);
}

.mention-icon {
  font-size: 14px;
}

.mention-label {
  font-weight: 600;
}

.mention-detail {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-left: auto;
}
</style>
