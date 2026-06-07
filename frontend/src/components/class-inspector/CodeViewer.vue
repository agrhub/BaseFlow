<template>
  <div class="code-details-panel-inner">
    <div class="code-header">
      <span>{{ store.t('Source Code') }}</span>
      <el-button type="primary" :icon="CopyDocument" text bg round size="small" @click="copyCode" v-if="!isBinary">
        {{ store.t('Copy') }}
      </el-button>
    </div>
    <div v-if="loading" class="code-editor-placeholder" :style="{ maxHeight: maxHeight }">
      <span>{{ store.t('Loading...') }}</span>
    </div>
    <div v-else-if="isBinary" class="media-viewer-container" :style="{ maxHeight: maxHeight }">
      <!-- Image Preview -->
      <div v-if="isImage" class="media-preview-box">
        <el-image :src="rawFileUrl" fit="contain" class="media-preview-image" :preview-src-list="[rawFileUrl]" />
      </div>

      <!-- Video Preview -->
      <div v-else-if="isVideo" class="media-preview-box">
        <video :src="rawFileUrl" controls class="media-preview-video"></video>
      </div>

      <!-- Audio Preview -->
      <div v-else-if="isAudio" class="media-preview-box">
        <audio :src="rawFileUrl" controls class="media-preview-audio"></audio>
      </div>

      <!-- PDF Preview -->
      <div v-else-if="isPdf" class="media-preview-box pdf-box">
        <iframe :src="rawFileUrl" class="media-preview-pdf"></iframe>
      </div>

      <!-- Document Preview / Launch Card -->
      <div v-else-if="isDocument" class="binary-file-placeholder document-file-card" :class="documentClass">
        <div class="binary-icon document-icon">{{ documentIcon }}</div>
        <h3>{{ store.t(documentTypeName) }}</h3>
        <p class="file-name-label">{{ getFileName(filePath) }}</p>
        <p class="file-warning-msg">
          {{ store.t('Preview not available in browser. You can download this file or open it directly in your local default application.') }}
        </p>
        <div class="action-buttons">
          <el-button type="primary" round :icon="Download" class="download-btn" @click="downloadFile">
            {{ store.t('Download File') }}
          </el-button>
          <el-button type="success" round :icon="Document" class="open-btn" :loading="openingFile" @click="openLocalFile">
            {{ store.t('Open in Local App') }}
          </el-button>
        </div>
      </div>

      <!-- Download Card (Fallback) -->
      <div v-else class="binary-file-placeholder">
        <div class="binary-icon">💾</div>
        <h3>{{ store.t('Binary File') }}</h3>
        <p class="file-name-label">{{ getFileName(filePath) }}</p>
        <p class="file-warning-msg">{{ store.t('Preview not available') }}</p>
        <div class="action-buttons">
          <el-button type="primary" :icon="Download" class="download-btn" @click="downloadFile">
            {{ store.t('Download File') }}
          </el-button>
          <el-button type="success" :icon="Document" class="open-btn" :loading="openingFile" @click="openLocalFile">
            {{ store.t('Open in Local App') }}
          </el-button>
        </div>
      </div>
    </div>
    <pre 
      v-else 
      class="code-editor-container" 
      :style="{ maxHeight: maxHeight }"
      @mouseup="onCodeAreaMouseUp" 
      @keyup="onCodeAreaMouseUp"
    ><div v-for="(line, idx) in codeLines" :key="idx" :id="idPrefix + (idx + 1)" class="code-line" :class="{ 'highlighted-line': activeLine === idx + 1 }"><span class="code-line-number">{{ idx + 1 }}</span><span v-if="shouldHighlight" class="code-line-content" v-html="highlightLine(line)"></span><span v-else class="code-line-content">{{ line }}</span></div><div v-if="!codeLines.length" class="empty-code">N/A</div></pre>

    <!-- Floating Selection Bubble -->
    <Teleport to="body">
      <div 
        v-if="showSelectionBubble" 
        class="selection-chat-bubble" 
        :style="{ left: bubbleLeft + 'px', top: bubbleTop + 'px' }" 
        @mousedown.prevent="askAiAboutSelection"
      >
        <el-icon><ChatDotRound /></el-icon>
        <span>{{ store.t('Ask AI') }}</span>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { CopyDocument, ChatDotRound, Download, Document } from '@element-plus/icons-vue';
import { store } from '../../stores';
import { ElMessage } from 'element-plus';
import axios from 'axios';

const props = withDefaults(defineProps<{
  sourceCode: string;
  activeLine: number | null;
  idPrefix?: string;
  loading?: boolean;
  isBinary?: boolean;
  filePath?: string;
  mimeType?: string;
  maxHeight?: string;
}>(), {
  idPrefix: 'line-',
  loading: false,
  isBinary: false,
  filePath: '',
  mimeType: '',
  maxHeight: '600px'
});

const rawFileUrl = computed(() => {
  return `/api/${store.activeConnection}/file-raw?path=${encodeURIComponent(props.filePath || '')}`;
});

const isImage = computed(() => props.mimeType?.startsWith('image/'));
const isVideo = computed(() => {
  const mime = props.mimeType?.toLowerCase() || '';
  return mime === 'video/mp4' || 
         mime === 'video/webm' || 
         mime === 'video/ogg' || 
         mime === 'video/quicktime';
});
const isAudio = computed(() => props.mimeType?.startsWith('audio/'));
const isPdf = computed(() => props.mimeType === 'application/pdf');

const isWord = computed(() => {
  const ext = props.filePath?.split('.').pop()?.toLowerCase();
  return ext === 'doc' || ext === 'docx' || 
         props.mimeType === 'application/msword' || 
         props.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
});

const isExcel = computed(() => {
  const ext = props.filePath?.split('.').pop()?.toLowerCase();
  return ext === 'xls' || ext === 'xlsx' || 
         props.mimeType === 'application/vnd.ms-excel' || 
         props.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
});

const isPowerPoint = computed(() => {
  const ext = props.filePath?.split('.').pop()?.toLowerCase();
  return ext === 'ppt' || ext === 'pptx' || 
         props.mimeType === 'application/vnd.ms-powerpoint' || 
         props.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
});

const isDocument = computed(() => {
  return isWord.value || isExcel.value || isPowerPoint.value;
});

const documentClass = computed(() => {
  if (isWord.value) return 'word-doc';
  if (isExcel.value) return 'excel-doc';
  if (isPowerPoint.value) return 'ppt-doc';
  return '';
});

const documentIcon = computed(() => {
  if (isWord.value) return '📝';
  if (isExcel.value) return '📊';
  if (isPowerPoint.value) return '📉';
  return '📄';
});

const documentTypeName = computed(() => {
  if (isWord.value) return 'Word Document';
  if (isExcel.value) return 'Excel Spreadsheet';
  if (isPowerPoint.value) return 'PowerPoint Presentation';
  return 'Document File';
});

const openingFile = ref(false);

const openLocalFile = async () => {
  if (!props.filePath || !store.activeConnection) return;
  openingFile.value = true;
  try {
    await axios.post(`/api/${store.activeConnection}/open-file`, {
      path: props.filePath
    });
    ElMessage.success(store.t('File opened successfully.'));
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message;
    ElMessage.error(store.t('Could not open file: {error}').replace('{error}', errorMsg));
  } finally {
    openingFile.value = false;
  }
};

const getFileName = (pathStr?: string): string => {
  if (!pathStr) return 'file';
  const parts = pathStr.split(/[/\\]/);
  return parts[parts.length - 1];
};

const downloadFile = () => {
  const link = document.createElement('a');
  link.href = rawFileUrl.value;
  link.download = getFileName(props.filePath);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const showSelectionBubble = ref(false);
const bubbleLeft = ref(0);
const bubbleTop = ref(0);
const currentSelection = ref('');

const codeLines = computed(() => {
  return props.sourceCode ? props.sourceCode.split(/\r?\n/) : [];
});

const shouldHighlight = computed(() => {
  return props.sourceCode ? props.sourceCode.length < 150000 : true;
});

const onCodeAreaMouseUp = (e: MouseEvent | KeyboardEvent) => {
  const preElement = e.currentTarget as HTMLElement;
  setTimeout(() => {
    const selection = window.getSelection();
    if (!selection) return;
    const selectedText = selection.toString().trim();
    if (selectedText) {
      const range = selection.getRangeAt(0);
      if (preElement && (preElement.contains(range.startContainer) || preElement.contains(range.endContainer))) {
        const preRect = preElement.getBoundingClientRect();
        const rects = Array.from(range.getClientRects());
        // Filter rects to only include visible ones overlapping the container viewport
        const visibleRects = rects.filter(r => 
          r.bottom >= preRect.top && 
          r.top <= preRect.bottom && 
          r.width > 0 && 
          r.height > 0
        );

        let targetRect = null;
        if (visibleRects.length > 0) {
          let minTop = Infinity;
          let maxBottom = -Infinity;
          let minLeft = Infinity;
          let maxRight = -Infinity;
          for (const r of visibleRects) {
            if (r.top < minTop) minTop = r.top;
            if (r.bottom > maxBottom) maxBottom = r.bottom;
            if (r.left < minLeft) minLeft = r.left;
            if (r.right > maxRight) maxRight = r.right;
          }
          targetRect = {
            left: minLeft,
            top: minTop,
            width: maxRight - minLeft,
            height: maxBottom - minTop
          };
        } else {
          // Fallback to default bounding rect
          const defaultRect = range.getBoundingClientRect();
          if (defaultRect.width > 0 && defaultRect.height > 0) {
            targetRect = defaultRect;
          }
        }

        if (targetRect) {
          bubbleLeft.value = targetRect.left + targetRect.width / 2;
          bubbleTop.value = Math.max(0, targetRect.top - 40);
          currentSelection.value = selectedText;
          showSelectionBubble.value = true;
          return;
        }
      }
    }
    showSelectionBubble.value = false;
  }, 10);
};

const askAiAboutSelection = () => {
  if (!currentSelection.value) return;
  const selectedCode = currentSelection.value;
  const prompt = `${store.t('Explain this code snippet')}:\n\n\`\`\`\n${selectedCode}\n\`\`\``;
  store.chatInput = prompt;
  store.autoSendNextCommand = true;
  store.chatSidebarOpen = true;
  showSelectionBubble.value = false;
  window.getSelection()?.removeAllRanges();
};

const globalMouseDown = (e: MouseEvent) => {
  const bubbleEl = document.querySelector('.selection-chat-bubble');
  if (bubbleEl && !bubbleEl.contains(e.target as Node)) {
    showSelectionBubble.value = false;
  }
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const highlightLine = (lineText: string): string => {
  if (!lineText) return ' ';
  let html = escapeHtml(lineText);
  let commentPart = '';
  const inlineCommentIdx = html.indexOf('//');
  if (inlineCommentIdx !== -1) {
    commentPart = `<span class="token-comment">${html.substring(inlineCommentIdx)}</span>`;
    html = html.substring(0, inlineCommentIdx);
  }
  const strings: string[] = [];
  html = html.replace(/(["'])(.*?)\1/g, (match) => {
    const placeholder = `___STR_PLACEHOLDER_${strings.length}___`;
    strings.push(`<span class="token-string">${match}</span>`);
    return placeholder;
  });
  const keywords = [
    'public', 'private', 'protected', 'internal', 'abstract', 'static', 'final', 'volatile', 'transient', 
    'synchronized', 'class', 'interface', 'enum', 'extends', 'implements', 'void', 'int', 'boolean', 
    'char', 'double', 'float', 'long', 'short', 'byte', 'return', 'import', 'package', 'using', 'namespace',
    'def', 'fn', 'struct', 'trait', 'let', 'const', 'var', 'function', 'new', 'if', 'else', 'for', 'while', 
    'switch', 'case', 'default', 'try', 'catch', 'finally', 'throw', 'throws', 'override'
  ];
  const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  html = html.replace(keywordRegex, '<span class="token-keyword">$1</span>');
  html = html.replace(/(@\w+)/g, '<span class="token-annotation">$1</span>');
  html = html.replace(/\b(\d+)\b/g, '<span class="token-number">$1</span>');
  for (let i = 0; i < strings.length; i++) {
    html = html.replace(`___STR_PLACEHOLDER_${i}___`, strings[i]);
  }
  return html + commentPart;
};

const copyCode = () => {
  if (props.sourceCode) {
    navigator.clipboard.writeText(props.sourceCode);
    ElMessage.success(store.t('Source code copied to clipboard.'));
  }
};

watch(() => props.activeLine, (lineNum) => {
  if (lineNum !== null) {
    setTimeout(() => {
      const el = document.getElementById(`${props.idPrefix}${lineNum}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }
});

onMounted(() => {
  window.addEventListener('mousedown', globalMouseDown);
});

onUnmounted(() => {
  window.removeEventListener('mousedown', globalMouseDown);
});
</script>

<style scoped>
.code-details-panel-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.code-header {
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.82rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-secondary);
}

.code-editor-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: #1e293b;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 20px;
  flex: 1;
}

.code-editor-container {
  margin: 0;
  padding: 20px;
  background: #1e293b;
  color: #f8fafc;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  overflow: auto;
  flex: 1;
  line-height: 1.5;
}

.code-line {
  display: flex;
  min-width: max-content;
  line-height: 1.6;
}

.code-line-number {
  display: inline-block;
  width: 40px;
  min-width: 40px;
  text-align: right;
  padding-right: 12px;
  margin-right: 12px;
  color: #64748b;
  border-right: 1px solid #334155;
  user-select: none;
}

.code-line-content {
  white-space: pre;
  color: #f8fafc;
}

.code-line.highlighted-line {
  background-color: rgba(99, 102, 241, 0.2) !important;
  border-left: 2px solid #6366f1;
  margin-left: -2px;
}

.empty-code {
  color: var(--text-muted);
  font-style: italic;
}

.selection-chat-bubble {
  position: fixed;
  transform: translate(-50%, -100%);
  background: rgba(30, 41, 59, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(99, 102, 241, 0.4);
  color: #f8fafc;
  padding: 8px 14px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px rgba(99, 102, 241, 0.2);
  transition: all 0.2s ease;
  user-select: none;
}

.selection-chat-bubble:hover {
  background: rgba(99, 102, 241, 0.95);
  border-color: #6366f1;
  transform: translate(-50%, -100%) scale(1.05);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(99, 102, 241, 0.4);
}

.selection-chat-bubble .el-icon {
  font-size: 0.9rem;
}

.binary-file-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: #1e293b;
  padding: 40px 20px;
  flex: 1;
  text-align: center;
}

.binary-icon {
  font-size: 3rem;
  margin-bottom: 16px;
}

.binary-file-placeholder h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 1.1rem;
  font-weight: 600;
}

.binary-file-placeholder p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  max-width: 300px;
  line-height: 1.5;
}

.media-viewer-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1e293b;
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.media-preview-box {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.media-preview-image {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.media-preview-video {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.media-preview-audio {
  width: 80%;
}

.pdf-box {
  width: 100%;
  height: 500px;
}

.media-preview-pdf {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 8px;
  background: white;
}

.file-name-label {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  padding: 4px 10px;
  border-radius: 4px;
  margin: 8px 0;
  word-break: break-all;
}

.file-warning-msg {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0 0 16px 0;
}

.download-btn {
  margin-top: 8px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.open-btn {
  margin-top: 8px;
}

.document-file-card {
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  transition: all 0.3s ease;
  min-width: 280px;
}

/* Word theme: Blue tint */
.document-file-card.word-doc {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(30, 58, 138, 0.3) 100%);
  border-color: rgba(59, 130, 246, 0.2);
}
.document-file-card.word-doc .document-icon {
  filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.4));
  animation: pulseBlue 3s infinite ease-in-out;
}

/* Excel theme: Green tint */
.document-file-card.excel-doc {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(6, 78, 59, 0.3) 100%);
  border-color: rgba(16, 185, 129, 0.2);
}
.document-file-card.excel-doc .document-icon {
  filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.4));
  animation: pulseGreen 3s infinite ease-in-out;
}

/* PowerPoint theme: Orange/Red tint */
.document-file-card.ppt-doc {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(120, 53, 4, 0.3) 100%);
  border-color: rgba(245, 158, 11, 0.2);
}
.document-file-card.ppt-doc .document-icon {
  filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.4));
  animation: pulseOrange 3s infinite ease-in-out;
}

@keyframes pulseBlue {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.4)); }
  50% { transform: scale(1.08); filter: drop-shadow(0 0 16px rgba(59, 130, 246, 0.7)); }
}
@keyframes pulseGreen {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.4)); }
  50% { transform: scale(1.08); filter: drop-shadow(0 0 16px rgba(16, 185, 129, 0.7)); }
}
@keyframes pulseOrange {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.4)); }
  50% { transform: scale(1.08); filter: drop-shadow(0 0 16px rgba(245, 158, 11, 0.7)); }
}
</style>

<style>
/* Global tokens for v-html highlighting */
.token-keyword {
  color: #ff7b72 !important;
  font-weight: bold;
}
.token-string {
  color: #a5d6ff !important;
}
.token-comment {
  color: #8b949e !important;
  font-style: italic;
}
.token-annotation {
  color: #d7c1f9 !important;
}
.token-number {
  color: #ffb86c !important;
}
</style>
