<template>
  <div
    class="msg-bubble-wrapper"
    :class="msg.role"
  >
    <div class="bubble-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
    <div class="bubble-body">
      <div class="bubble-text-wrapper">
        <div class="bubble-text" v-html="renderMarkdown(msg.content)"></div>
        <el-button v-if="msg.role === 'assistant'" 
          type="primary" class="speech-tts-btn"
          :title="store.t('Speak aloud')"
          icon="Headset"
          circle plain size="small"
          @click="$emit('speak', msg.content)">
        </el-button>
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
  max-width: 85%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
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
  box-sizing: border-box;
  max-width: 100%;
  overflow: hidden;
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
  overflow-wrap: break-word;
  max-width: 100%;
}

.bubble-text :deep(p) {
  margin: 0 0 8px 0;
  word-break: break-word;
}

.bubble-text :deep(p:last-child) {
  margin: 0;
}

/* List formatting to prevent overflow and offset issues */
.bubble-text :deep(ul),
.bubble-text :deep(ol) {
  margin: 0 0 8px 0;
  padding-left: 18px;
  box-sizing: border-box;
}

.bubble-text :deep(li) {
  margin-bottom: 4px;
  word-break: break-word;
}

/* Code block handling */
.bubble-text :deep(.code-block-wrapper) {
  position: relative;
  width: 100%;
  margin: 10px 0;
}

.bubble-text :deep(.code-block-wrapper pre) {
  margin: 0 !important;
  padding: 8px 12px;
  padding-right: 70px !important; /* Prevent text overlapping with the copy button */
  background: var(--bg-primary, #1e1e2e);
  border-radius: 6px;
  overflow-x: auto;
  max-width: 100%;
  border: 1px solid var(--border-color);
  box-sizing: border-box;
}

.bubble-text :deep(pre) {
  background: var(--bg-primary, #1e1e2e);
  padding: 8px 12px;
  border-radius: 6px;
  overflow-x: auto;
  max-width: 100%;
  border: 1px solid var(--border-color);
  margin: 8px 0;
  box-sizing: border-box;
}

.bubble-text :deep(code) {
  font-family: var(--font-mono, monospace);
  font-size: 0.85em;
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 4px;
  border-radius: 4px;
  word-break: break-all;
}

.bubble-text :deep(pre code) {
  background: none;
  padding: 0;
  word-break: normal;
  white-space: pre;
}

.bubble-text :deep(.code-copy-btn) {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 4px 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s ease;
  user-select: none;
  z-index: 10;
  font-family: var(--font-family);
}

.bubble-text :deep(.code-copy-btn:hover) {
  background: rgba(255, 255, 255, 1);
  color: var(--el-color-primary);
  border-color: rgba(255, 255, 255, 0.25);
}

.bubble-text :deep(.code-copy-btn.copied) {
  background: var(--color-success);
  color: #fff;
  border-color: var(--color-success);
}

.bubble-text :deep(.code-copy-btn svg) {
  flex-shrink: 0;
}

.bubble-text :deep(.entity-link),
.bubble-text :deep(a) {
  color: var(--color-brand, #3b82f6);
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 3px;
  font-weight: 500;
  transition: color var(--transition-fast), opacity var(--transition-fast);
}

.bubble-text :deep(.entity-link:hover),
.bubble-text :deep(a:hover) {
  color: var(--color-brand-hover, #2563eb);
  text-decoration-style: solid;
}

.speech-tts-btn {
  position: absolute;
  bottom: 10px;
  right: 10px;
  /* opacity: 0.5; */
  transition: opacity 0.2s ease;
}

.speech-tts-btn:hover {
  opacity: 1;
}

.retry-action-box {
  margin-top: 4px;
}
</style>
