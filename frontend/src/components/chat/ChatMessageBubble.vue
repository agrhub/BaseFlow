<template>
  <div
    class="msg-bubble-wrapper"
    :class="msg.role"
  >
    <div class="bubble-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
    <div class="bubble-body">

      <!-- Collapsible thinking block (playbook stream logs) -->
      <div
        v-if="msg.thinkingLogs && msg.thinkingLogs.length > 0"
        class="thinking-block"
        :class="{ open: msg.thinkingOpen }"
      >
        <button class="thinking-toggle" @click.prevent="msg.thinkingOpen = !msg.thinkingOpen">
          <span class="thinking-icon">🧠</span>
          <span class="thinking-label">
            {{ store.t('Gemini CLI') }}
            <em>({{ msg.thinkingLogs.length }} {{ store.t('steps') }})</em>
          </span>
          <span class="thinking-chevron">{{ msg.thinkingOpen ? '▲' : '▼' }}</span>
        </button>
        <div v-if="msg.thinkingOpen" ref="logsContainer" class="thinking-logs">
          <div v-for="(log, i) in msg.thinkingLogs" :key="i" class="thinking-log-line">{{ log }}</div>
          <!-- BaseFlow processing... animation line -->
          <div v-if="processing" class="thinking-log-line processing-line">
            <div class="typing-indicator small">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="processing-text">{{ store.t('BaseFlow processing...') }}</span>
          </div>
        </div>
      </div>

      <div v-if="msg.content && msg.content.trim() !== ''" class="bubble-text-wrapper">
        <div class="bubble-text" v-html="renderMarkdown(msg.content)"></div>
        <el-button v-if="msg.role === 'assistant'" 
          type="primary" class="speech-tts-btn"
          :title="store.t('Speak aloud')"
          icon="Headset"
          circle plain size="small"
          @click="$emit('speak', msg.content)">
        </el-button>
      </div>

      <!-- Modified files links block -->
      <div
        v-if="msg.modifiedFiles && msg.modifiedFiles.length > 0"
        class="modified-files-block"
      >
        <div class="modified-files-header">
          <span class="header-icon">🛠️</span>
          <span class="header-label">{{ store.t('Modified Files') }}</span>
          <span class="badge">{{ msg.modifiedFiles.length }}</span>
        </div>
        <div class="modified-files-list">
          <a
            v-for="(filePath, i) in msg.modifiedFiles"
            :key="i"
            :href="'file:///' + filePath"
            class="modified-file-item-link"
            :title="store.t('Click to inspect: ') + filePath"
          >
            <span class="file-icon">📄</span>
            <div class="file-details">
              <span class="file-path">{{ getFileName(filePath) }}</span>
              <span class="file-dir">{{ getFileDir(filePath) }}</span>
            </div>
            <span class="inspect-arrow">➔</span>
          </a>
        </div>
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
import { ref, watch, nextTick } from 'vue';
import { store } from '../../stores';
import { useChatRenderer } from '../../hooks/useChatRenderer';

interface LocalMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  thinkingLogs?: string[];
  thinkingOpen?: boolean;
  modifiedFiles?: string[];
}

const props = defineProps<{
  msg: LocalMessage;
  idx: number;
  processing?: boolean;
}>();

defineEmits<{
  (e: 'speak', content: string): void;
  (e: 'retry', idx: number): void;
}>();

const { renderMarkdown } = useChatRenderer();

const logsContainer = ref<HTMLElement | null>(null);

watch(
  [() => props.msg.thinkingLogs?.length, () => props.msg.thinkingOpen],
  () => {
    if (props.msg.thinkingOpen) {
      nextTick(() => {
        if (logsContainer.value) {
          logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
        }
      });
    }
  },
  { immediate: true }
);

const getFileName = (pathStr: string) => {
  const parts = pathStr.split('/');
  return parts[parts.length - 1];
};

const getFileDir = (pathStr: string) => {
  const parts = pathStr.split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, parts.length - 1).join('/') + '/';
};
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

/* ── Thinking / internal logs collapsible block ── */
.thinking-block {
  margin-bottom: 6px;
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.05);
  overflow: hidden;
  font-size: 0.78rem;
  max-width: 100%;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 7px 12px;
  color: var(--text-secondary);
  font-size: 0.78rem;
  text-align: left;
  transition: background 0.15s;
}

.thinking-toggle:hover {
  background: rgba(139, 92, 246, 0.1);
}

.thinking-icon { font-size: 0.9rem; }

.thinking-label {
  flex: 1;
  color: var(--text-secondary);
}

.thinking-label em {
  font-style: normal;
  opacity: 0.6;
  margin-left: 4px;
}

.thinking-chevron {
  font-size: 0.65rem;
  opacity: 0.6;
}

.thinking-logs {
  border-top: 1px solid rgba(139, 92, 246, 0.15);
  padding: 8px 12px;
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.thinking-log-line {
  font-family: var(--font-mono, monospace);
  font-size: 0.72rem;
  color: var(--text-muted);
  word-break: break-all;
  white-space: pre-wrap;
  line-height: 1.4;
  padding: 1px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

.thinking-log-line:last-child { border-bottom: none; }

/* Processing line animation in logs */
.processing-line {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-primary, #8b5cf6) !important;
  font-weight: 500;
  margin-top: 4px;
}

.typing-indicator.small {
  display: flex;
  gap: 3px;
  align-items: center;
}

.typing-indicator.small span {
  width: 4px;
  height: 4px;
  background-color: var(--color-primary, #8b5cf6);
  border-radius: 50%;
  animation: bounce-logs 1.4s infinite ease-in-out both;
}

.typing-indicator.small span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator.small span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce-logs {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* ── Modified Files Block ── */
.modified-files-block {
  margin-top: 8px;
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(99, 102, 241, 0.08));
  overflow: hidden;
  font-size: 0.8rem;
  max-width: 100%;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);
}

.modified-files-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(139, 92, 246, 0.1);
  border-bottom: 1px solid rgba(139, 92, 246, 0.15);
  font-weight: 600;
  color: var(--color-primary, #8b5cf6);
}

.modified-files-header .badge {
  background: var(--color-primary, #8b5cf6);
  color: #fff;
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
  margin-left: auto;
}

.modified-files-list {
  padding: 6px 0;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.modified-file-item-link {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  gap: 10px;
  text-decoration: none !important;
  color: inherit !important;
  transition: all 0.2s ease;
  border-left: 2px solid transparent;
}

.modified-file-item-link:hover {
  background: rgba(139, 92, 246, 0.08);
  border-left-color: var(--color-primary, #8b5cf6);
}

.modified-file-item-link:hover .file-path {
  color: var(--color-primary, #8b5cf6);
}

.modified-file-item-link:hover .inspect-arrow {
  transform: translateX(4px);
  opacity: 1;
}

.file-icon {
  font-size: 0.95rem;
  flex-shrink: 0;
}

.file-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.file-path {
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.82rem;
  transition: color 0.15s ease;
}

.file-dir {
  font-size: 0.7rem;
  color: var(--text-muted, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.8;
}

.inspect-arrow {
  font-size: 0.85rem;
  color: var(--color-primary, #8b5cf6);
  opacity: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
}
</style>
