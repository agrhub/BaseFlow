<template>
  <div
    class="msg-bubble-wrapper"
    :class="msg.role"
  >
    <div class="bubble-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
    <div class="bubble-body">
      <div class="bubble-text-wrapper">
        <div class="bubble-text" v-html="renderMarkdown(msg.content)"></div>
        <button
          v-if="msg.role === 'assistant'"
          class="speech-tts-btn"
          :title="store.t('Speak aloud')"
          @click="$emit('speak', msg.content)"
        >🔊</button>
      </div>

      <!-- Retry on error -->
      <div v-if="msg.isError" class="retry-action-box">
        <el-button type="warning" size="small" round text bg @click="$emit('retry', idx)">
          ♻ {{ store.t('Retry') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { store } from '../../stores';
import { useChatRenderer } from '../../hooks/useChatRenderer';

interface LocalMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

defineProps<{
  msg: LocalMessage;
  idx: number;
}>();

defineEmits<{
  (e: 'speak', content: string): void;
  (e: 'retry', idx: number): void;
}>();

const { renderMarkdown } = useChatRenderer();
</script>

<style scoped>
.msg-bubble-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  width: 100%;
}

.msg-bubble-wrapper.user {
  flex-direction: row-reverse;
}

.bubble-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.bubble-body {
  max-width: 80%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.msg-bubble-wrapper.user .bubble-body {
  align-items: flex-end;
}

.bubble-text-wrapper {
  position: relative;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 10px 14px;
  color: var(--text-primary);
  font-size: 0.85rem;
  line-height: 1.5;
}

.msg-bubble-wrapper.user .bubble-text-wrapper {
  background: var(--color-primary-light, rgba(99, 102, 241, 0.15));
  border-color: var(--color-primary);
  border-bottom-right-radius: 2px;
}

.msg-bubble-wrapper.assistant .bubble-text-wrapper {
  border-bottom-left-radius: 2px;
}

.bubble-text {
  word-break: break-word;
}

.bubble-text :deep(p) {
  margin: 0 0 8px 0;
}

.bubble-text :deep(p:last-child) {
  margin: 0;
}

.speech-tts-btn {
  position: absolute;
  bottom: 4px;
  right: -24px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.5;
  transition: opacity 0.2s ease;
}

.speech-tts-btn:hover {
  opacity: 1;
}

.retry-action-box {
  margin-top: 4px;
}
</style>
