<template>
  <div class="agent-chat-wrapper" :class="{ 'is-open': store.chatSidebarOpen }">
    <!-- Floating Neon Trigger Button (visible when closed) -->
    <div
      v-if="!store.chatSidebarOpen"
      class="floating-chat-trigger"
      @click="store.chatSidebarOpen = true"
      :title="store.t('Ask AI Architect')"
    >
      <div class="pulse-ring"></div>
      <el-icon><ChatDotRound /></el-icon>
    </div>

    <!-- Sliding Sidebar Panel -->
    <aside v-else class="agent-chat-sidebar">
      <div class="sidebar-layout">

        <!-- Header -->
        <div class="sidebar-header">
          <div class="avatar">🤖</div>
          <div class="header-meta">
            <h3>{{ store.t('BaseFlow Assistant') }}</h3>
            <span class="status-tag">
              <span class="pulse-dot"></span>
              {{ store.t('Gemini Active') }}
            </span>
          </div>
          <div class="header-actions">
            <el-button
              type="danger" circle text bg size="small"
              :title="store.t('Clear Chat History')"
              @click="handleClearChat"
            >
              <span style="font-size: 14px;">♻</span>
            </el-button>
            <el-button
              type="primary" circle text bg size="small"
              :title="store.t('Close')"
              @click="store.chatSidebarOpen = false"
            >
              <span style="font-size: 14px;">✕</span>
            </el-button>
          </div>
        </div>

        <!-- Message list -->
        <div class="chat-logs-container" ref="msgContainer" @click="handleChatClick">
          <!-- Empty welcome state -->
          <WelcomeState 
            v-if="messages.length === 0" 
            :active-item="store.activeItem" 
            :welcome-suggestions="welcomeSuggestions" 
            @select-suggestion="sendSuggestion" 
          />

          <!-- Message bubbles -->
          <ChatMessageBubble 
            v-for="(msg, idx) in messages" 
            :key="idx" 
            v-show="msg.content !== '' || msg.role === 'user' || msg.isError || (msg.thinkingLogs && msg.thinkingLogs.length > 0)" 
            :msg="msg" 
            :idx="idx" 
            :processing="thinking && idx === messages.length - 1"
            @retry="handleRetry" 
            @speak="speakText" 
          />

          <!-- Thinking indicator -->
          <div v-if="showThinkingRow" class="thinking-row">
            <div class="bubble-avatar">🤖</div>
            <div class="thinking-indicator">
              <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span class="thinking-text">{{ store.t('BaseFlow is thinking...') }}</span>
            </div>
          </div>
        </div>

        <!-- Autocomplete mention popup -->
        <MentionListPopup 
          v-if="showMentionList && mentionOptions.length > 0" 
          :options="mentionOptions" 
          :active-index="mentionActiveIndex" 
          @select="selectMention" 
        />

        <!-- Input bar and context suggestions tray -->
        <ChatInputPanel 
          v-model="inputMsg" 
          :current-suggestions="currentSuggestions" 
          :thinking="thinking" 
          :listening="listening" 
          @send="handleSend" 
          @voice-click="toggleVoiceListening" 
          @select-suggestion="sendSuggestion" 
          @input="handleInput" 
          @keydown="handleInputKeydown" 
          @blur="handleBlur" 
        />

      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted, computed } from 'vue';
import { store } from '../../stores';
import { ElMessage } from 'element-plus';
import { ChatDotRound } from '@element-plus/icons-vue';
import axios from 'axios';
import { useVoiceChat } from '../../hooks/useVoiceChat';
import { useChatRenderer } from '../../hooks/useChatRenderer';

// Import refactored components
import WelcomeState from './WelcomeState.vue';
import ChatMessageBubble from './ChatMessageBubble.vue';
import MentionListPopup from './MentionListPopup.vue';
import ChatInputPanel from './ChatInputPanel.vue';

// --- State ---
const inputMsg = ref('');
const thinking = ref(false);
const msgContainer = ref<HTMLElement | null>(null);
const sessionId = ref('');

// @mention state
const showMentionList = ref(false);
const mentionQuery = ref('');
const mentionStartIndex = ref(-1);
const mentionActiveIndex = ref(0);

// --- Messages & Suggestions ---
interface LocalMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
  visualBlocks?: string[];
  isError?: boolean;
  thinkingLogs?: string[];
  thinkingOpen?: boolean;
  modifiedFiles?: string[];
}

interface SuggestionItem {
  value: string;
  label: string;
}

const messages = ref<LocalMessage[]>([]);
const currentSuggestions = ref<SuggestionItem[]>([]);

// Hooks
const { handleChatClick, renderVisualBlocks } = useChatRenderer();
const { listening, toggleVoiceListening, speakText } = useVoiceChat((transcript) => {
  inputMsg.value = transcript;
});

// Helper to translate dynamic suggestion text based on regex patterns
const translateDynamicSuggestion = (sugg: string): string => {
  if (!sugg) return '';
  
  let icon = '';
  let text = sugg.trim();
  
  // Extract leading emoji icon if present
  const emojiRegex = /^([\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{2600}-\u{26FF}]|[\u{1F600}-\u{1F64F}])\s*/u;
  const matchEmoji = text.match(emojiRegex);
  if (matchEmoji) {
    icon = matchEmoji[1] + ' ';
    text = text.substring(matchEmoji[0].length).trim();
  }
  
  const patterns = [
    {
      regex: /^Optimize method (.+?) in (.+)$/i,
      key: 'Optimize method {method} in {class}',
      params: (m: RegExpMatchArray) => ({ method: m[1], class: m[2] })
    },
    {
      regex: /^Write unit test for method (.+)$/i,
      key: 'Write unit test for method {method}',
      params: (m: RegExpMatchArray) => ({ method: m[1] })
    },
    {
      regex: /^Find all call sites of method (.+)$/i,
      key: 'Find all call sites of method {method}',
      params: (m: RegExpMatchArray) => ({ method: m[1] })
    },
    {
      regex: /^Optimize class (.+)$/i,
      key: 'Optimize class {class}',
      params: (m: RegExpMatchArray) => ({ class: m[1] })
    },
    {
      regex: /^Write unit tests for (.+)$/i,
      key: 'Write unit tests for {class}',
      params: (m: RegExpMatchArray) => ({ class: m[1] })
    },
    {
      regex: /^Analyze refactor impact for (.+)$/i,
      key: 'Analyze refactor impact for {class}',
      params: (m: RegExpMatchArray) => ({ class: m[1] })
    },
    {
      regex: /^Show ERD diagram for (.+)$/i,
      key: 'Show ERD diagram for {class}',
      params: (m: RegExpMatchArray) => ({ class: m[1] })
    },
    {
      regex: /^Show (.+) on mindmap$/i,
      key: 'Show {item} on mindmap',
      params: (m: RegExpMatchArray) => ({ item: m[1] })
    },
    {
      regex: /^Summarize folder (.+)$/i,
      key: 'Summarize folder {folder}',
      params: (m: RegExpMatchArray) => ({ folder: m[1] })
    },
    {
      regex: /^List all classes in (.+)$/i,
      key: 'List all classes in {folder}',
      params: (m: RegExpMatchArray) => ({ folder: m[1] })
    },
    {
      regex: /^Analyze dependencies for (.+)$/i,
      key: 'Analyze dependencies for {folder}',
      params: (m: RegExpMatchArray) => ({ folder: m[1] })
    }
  ];
  
  for (const pattern of patterns) {
    const m = text.match(pattern.regex);
    if (m) {
      return icon + store.t(pattern.key, pattern.params(m));
    }
  }
  
  return icon + store.t(text);
};

const welcomeSuggestions = computed(() => {
  const provider = store.devopsInfo?.provider || 'none';
  let list: string[] = [];
  
  if (store.activeTab === 'mindmap') {
    list = [
      'Show all classes in the mindmap',
      'Which class has the most dependencies?',
      'Analyze the component tree structure'
    ];
  } else if (store.activeTab === 'gitlab') {
    if (provider === 'github') {
      list = [
        'Review open pull requests',
        'Triage critical open issues',
        'Analyze GitHub Actions workflow runs'
      ];
    } else if (provider === 'gitlab') {
      list = [
        'Review open merge requests',
        'Triage critical open issues',
        'Analyze GitLab CI pipelines'
      ];
    } else {
      list = [
        'Configure DevOps API credentials',
        'Generate onboarding guide for new developers'
      ];
    }
  } else if (store.activeTab === 'analysis') {
    list = [
      'Summarize the architecture of this project',
      'What is the main tech stack?',
      'List the key features and entry points'
    ];
  } else {
    list = [
      'Summarize the codebase structure and main modules',
      'Analyze class relationships and dependencies',
      'Generate a developer onboarding guide'
    ];
    if (provider !== 'none') {
      list.push(`Switch to the DevOps tab`);
    }
  }
  
  return list.map(s => ({
    value: s,
    label: store.t(s)
  }));
});

// @mention autocomplete options from scanned classes
const mentionOptions = computed(() => {
  const q = mentionQuery.value.toLowerCase().trim();
  const opts: Array<{ type: string; label: string; value: string; detail: string }> = [];

  const sidebar = store.sidebarList as Record<string, string[]>;
  if (sidebar) {
    for (const [folder, items] of Object.entries(sidebar)) {
      for (const item of items) {
        if (!q || item.toLowerCase().includes(q)) {
          opts.push({ type: 'class', label: item, value: `@${item}`, detail: folder });
        }
      }
    }
  }
  return opts.slice(0, 12);
});

const showThinkingRow = computed(() => {
  if (!thinking.value) return false;
  const lastMsg = messages.value[messages.value.length - 1];
  if (!lastMsg || lastMsg.role !== 'assistant') return true;
  const hasContent = lastMsg.content && lastMsg.content.trim() !== '';
  const hasLogs = (lastMsg as any).thinkingLogs && (lastMsg as any).thinkingLogs.length > 0;
  return !hasContent && !hasLogs;
});

// --- Chat history persistence ---
const loadChatHistory = async () => {
  try {
    const res = await axios.get('/api/agent/history');
    messages.value = (res.data.history || []).map((h: any) => ({
      role: h.role,
      content: h.content
    }));
    scrollBottom();
  } catch (e) {
    // Silently fail — fresh start is fine
  }
};

onMounted(async () => {
  sessionId.value = Math.random().toString(36).substring(2, 15);
  await loadChatHistory();
  renderVisualBlocks(scrollBottom);
});

watch(() => messages.value, () => {
  renderVisualBlocks(scrollBottom);
}, { deep: true });

// Watch for external chat commands
watch(() => store.chatInput, (newVal) => {
  if (newVal) {
    if (store.chatSidebarOpen) {
      inputMsg.value = newVal;
      store.chatInput = '';
      if (store.autoSendNextCommand) {
        store.autoSendNextCommand = false;
        setTimeout(() => {
          handleSend();
        }, 100);
      }
    }
  }
});

// Auto-open and scroll when sidebar opens
watch(() => store.chatSidebarOpen, (isOpen) => {
  if (isOpen) {
    scrollBottom();
  }
});

watch(() => store.playbookExecutionRequest, (newVal) => {
  if (newVal) {
    const { playbookFilePath, issueNumber } = newVal;
    store.playbookExecutionRequest = null; // Reset
    store.chatSidebarOpen = true;
    runPlaybookStream(playbookFilePath, issueNumber);
  }
});

// Watch selected nodes and methods to dynamically update suggestion chips
watch(
  [() => store.activeItem, () => store.activeFolder, () => store.selectedMethod],
  ([activeItem, activeFolder, selectedMethod]) => {
    const suggestions: string[] = [];

    if (selectedMethod) {
      suggestions.push(`💡 Optimize method ${selectedMethod} in ${activeItem || 'class'}`);
      suggestions.push(`🧪 Write unit test for method ${selectedMethod}`);
      suggestions.push(`🔍 Find all call sites of method ${selectedMethod}`);
    } else if (activeItem) {
      suggestions.push(`💡 Optimize class ${activeItem}`);
      suggestions.push(`🧪 Write unit tests for ${activeItem}`);
      suggestions.push(`⚠️ Analyze refactor impact for ${activeItem}`);
      suggestions.push(`📊 Show ERD diagram for ${activeItem}`);
    } else if (activeFolder) {
      suggestions.push(`📂 Summarize folder ${activeFolder}`);
      suggestions.push(`🧩 List all classes in ${activeFolder}`);
      suggestions.push(`📊 Analyze dependencies for ${activeFolder}`);
    }

    if (suggestions.length > 0) {
      currentSuggestions.value = suggestions.map(s => ({
        value: s,
        label: translateDynamicSuggestion(s)
      }));
    } else {
      currentSuggestions.value = [];
    }
  },
  { immediate: true }
);

const sendChat = async (userText: string) => {
  if (thinking.value || !userText.trim()) return;

  messages.value.push({ role: 'user', content: userText });
  scrollBottom();

  thinking.value = true;
  
  const agentMsgIndex = messages.value.push({ role: 'assistant', content: '', suggestions: [] }) - 1;

  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userText,
        sessionId: sessionId.value,
        connectionName: store.activeConnection,
        uiContext: {
          tab: store.activeTab,
          activeItem: store.activeItem
        }
      })
    });

    if (!res.ok || !res.body) {
      const errText = await res.text();
      throw new Error(errText || 'Network error');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.substring(6);
          try {
            const data = JSON.parse(dataStr);
            if (data.error) {
               messages.value[agentMsgIndex].content = `❌ **Error:** ${data.error}`;
               messages.value[agentMsgIndex].isError = true;
            } else if (data.chunk) {
               messages.value[agentMsgIndex].content += data.chunk;
               scrollBottom();
            } else if (data.done) {
               if (data.suggestions) {
                 messages.value[agentMsgIndex].suggestions = data.suggestions;
                 currentSuggestions.value = data.suggestions.map((s: string) => ({
                   value: s,
                   label: translateDynamicSuggestion(s)
                 }));
               }
               // Process actions
               const actions: Array<{ type: string; payload: any }> = data.actions || [];
               actions.forEach(act => {
                 if (act.type === 'NAVIGATE') {
                   if (act.payload.connectionName) store.setConnection(act.payload.connectionName);
                   if (act.payload.tab) store.activeTab = act.payload.tab;
                 } else if (act.type === 'SELECT_NODE') {
                   store.selectedMindmapNode = act.payload.nodeName;
                 } else if (act.type === 'HIGHLIGHT_CLASS') {
                   store.selectedMindmapNode = act.payload.className;
                 } else if (act.type === 'AUTO_CREATE_MR') {
                   ElMessage.info(store.t('Committing workspace changes and creating MR/PR...'));
                   axios.post(`/api/${store.activeConnection}/devops/auto-create-mr`, act.payload)
                     .then((mrRes: any) => {
                       ElMessage.success(store.t('MR created successfully!'));
                       messages.value.push({ role: 'assistant', content: `✅ **Merge Request Created!**\n\n[View on ${store.devopsInfo?.provider || 'provider'}](${mrRes.data.mrUrl})` });
                       scrollBottom();
                     })
                     .catch((err: any) => {
                       console.error('MR creation error:', err);
                       const errText = err.response?.data?.error || err.message;
                       messages.value.push({ role: 'assistant', content: `❌ **Failed to create MR:** ${errText}`, isError: true });
                       scrollBottom();
                     });
                 } else if (act.type === 'SUBMIT_MR_REVIEW') {
                   ElMessage.info(store.t('Submitting Code Review...'));
                   axios.post(`/api/${store.activeConnection}/devops/submit-mr-review`, act.payload)
                     .then(() => {
                       ElMessage.success(store.t('Review submitted successfully!'));
                       messages.value.push({ role: 'assistant', content: `✅ **Code Review Submitted!** I have posted the summary and inline comments to the Merge Request.` });
                       scrollBottom();
                     })
                     .catch((err: any) => {
                       console.error('Review submission error:', err);
                       const errText = err.response?.data?.error || err.message;
                       messages.value.push({ role: 'assistant', content: `❌ **Failed to submit review:** ${errText}`, isError: true });
                       scrollBottom();
                     });
                 } else if (act.type === 'HIGHLIGHT_VULNERABILITY') {
                   store.vulnerableNodes = act.payload.classes || [];
                   store.activeTab = 'mindmap';
                   ElMessage.warning({ message: store.t('Security Audit detected vulnerabilities! Nodes highlighted in red.'), duration: 5000 });
                   messages.value.push({ role: 'assistant', content: `🚨 **Security Audit Complete!**\n\nI have highlighted the vulnerable components in red on the mindmap view.` });
                   scrollBottom();
                 } else if (act.type === 'CATALOG_READY') {
                   store.catalogReadyData = act.payload;
                   store.activeTab = 'documents';
                   ElMessage.success(store.t('Agent configuration generated successfully!'));
                   scrollBottom();
                 } else if (act.type === 'PLAYBOOK_CREATED') {
                   const filePath = act.payload.filePath;
                   const match = filePath.match(/(?:issue|pipeline|pr|mr)[_-](\d+)/i);
                   if (match) {
                     const id = match[1];
                     store.linkedPlaybooks[id] = filePath;
                   }
                   axios.get(`/api/${store.activeConnection}/documents/content?path=${encodeURIComponent(filePath)}`)
                     .then((res: any) => {
                       store.playbookToReview = {
                         title: store.t('Playbook Generated'),
                         content: res.data.content,
                         filePath
                       };
                     }).catch(console.error);
                 }
               });
            }
          } catch(e) {}
        }
      }
    }
  } catch (error: any) {
    console.error('Chat error:', error);
    messages.value[agentMsgIndex].content = `❌ **Error:** Failed to get a response from the AI.`;
    messages.value[agentMsgIndex].isError = true;
  } finally {
    thinking.value = false;
    scrollBottom();
  }
};

const runPlaybookStream = async (playbookPath: string, issueNumber: string) => {
  if (thinking.value) return;
  
  messages.value.push({ role: 'user', content: `Execute playbook \`${playbookPath}\` to fix Issue #${issueNumber}` });
  scrollBottom();

  thinking.value = true;
  const agentMsgIndex = messages.value.push({ role: 'assistant', content: '', thinkingLogs: [], thinkingOpen: true } as any) - 1;

  try {
    const res = await fetch(`/api/${store.activeConnection}/devops/run-playbook/stream?playbookPath=${encodeURIComponent(playbookPath)}&issueNumber=${encodeURIComponent(issueNumber)}`, {
      method: 'GET'
    });

    if (!res.ok || !res.body) {
      const errText = await res.text();
      throw new Error(errText || 'Network error');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.substring(6);
          try {
            const data = JSON.parse(dataStr);
            if (data.error) {
              // Normalize \n → \n\n so markdown renders each line as its own paragraph
              const errFormatted = data.error.replace(/\n/g, '\n\n');
              messages.value[agentMsgIndex].content += `\n\n❌ **Error:** ${errFormatted}`;
              messages.value[agentMsgIndex].isError = true;
              scrollBottom();
            } else if (data.modifiedFiles) {
              messages.value[agentMsgIndex].modifiedFiles = data.modifiedFiles;
              scrollBottom();
            } else if (data.log) {
              const logLines = data.log.split('\n');
              for (const logLine of logLines) {
                if (logLine.trim()) {
                  if (!messages.value[agentMsgIndex].thinkingLogs) {
                    messages.value[agentMsgIndex].thinkingLogs = [];
                  }
                  messages.value[agentMsgIndex].thinkingLogs!.push(logLine);
                }
              }
              scrollBottom();
            } else if (data.chunk) {
              messages.value[agentMsgIndex].content += data.chunk;
              scrollBottom();
            } else if (data.done) {
              messages.value[agentMsgIndex].content += `\n\n✅ **Playbook executed successfully!**`;
              if (data.mrUrl) {
                messages.value[agentMsgIndex].content += `\n\n[View Merge Request](${data.mrUrl})`;
                window.open(data.mrUrl, '_blank');
              }
              axios.get(`/api/${store.activeConnection}/stats`).then(() => {
                store.fetchSidebar();
              }).catch(console.error);
              scrollBottom();
            }
          } catch(e) {}
        }
      }
    }
  } catch (error: any) {
    console.error('Run playbook error:', error);
    messages.value[agentMsgIndex].content = `❌ **Error:** Failed to run playbook. ${error.message}`;
    messages.value[agentMsgIndex].isError = true;
  } finally {
    thinking.value = false;
    scrollBottom();
  }
};

const handleSend = () => {
  if (showMentionList.value) return;
  const text = inputMsg.value.trim();
  if (!text || thinking.value) return;
  inputMsg.value = '';
  sendChat(text);
};

const sendSuggestion = (text: string) => {
  sendChat(text);
};

const handleRetry = (idx: number) => {
  for (let i = idx - 1; i >= 0; i--) {
    if (messages.value[i].role === 'user') {
      const text = messages.value[i].content;
      messages.value.splice(idx, 1);
      sendChat(text);
      return;
    }
  }
  ElMessage.warning(store.t('No message to retry.'));
};

const handleClearChat = async () => {
  try {
    await axios.delete('/api/agent/session');
    messages.value = [];
    sessionId.value = Math.random().toString(36).substring(2, 15);
    currentSuggestions.value = [];
    ElMessage.success(store.t('Chat history cleared.'));
  } catch (e) {
    ElMessage.error(store.t('Failed to clear session.'));
  }
};

const scrollBottom = () => {
  nextTick(() => {
    if (msgContainer.value) {
      msgContainer.value.scrollTop = msgContainer.value.scrollHeight;
    }
  });
};

const handleInput = (val: string) => {
  const textBeforeCursor = val;
  const lastAtIndex = textBeforeCursor.lastIndexOf('@');
  if (lastAtIndex !== -1) {
    const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
    if (!/\s/.test(textAfterAt)) {
      showMentionList.value = true;
      mentionStartIndex.value = lastAtIndex;
      mentionQuery.value = textAfterAt;
      mentionActiveIndex.value = 0;
      return;
    }
  }
  showMentionList.value = false;
  mentionQuery.value = '';
};

const handleInputKeydown = (e: KeyboardEvent) => {
  if (showMentionList.value && mentionOptions.value.length > 0) {
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionActiveIndex.value = (mentionActiveIndex.value + 1) % mentionOptions.value.length; return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); mentionActiveIndex.value = (mentionActiveIndex.value - 1 + mentionOptions.value.length) % mentionOptions.value.length; return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); selectMention(mentionOptions.value[mentionActiveIndex.value]); return; }
    if (e.key === 'Escape') { e.preventDefault(); showMentionList.value = false; return; }
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
};

const selectMention = (opt: { type: string; label: string; value: string; detail: string }) => {
  const text = inputMsg.value;
  const before = text.substring(0, mentionStartIndex.value);
  const after = text.substring(text.length);
  inputMsg.value = before + opt.value + ' ' + after;
  showMentionList.value = false;
  mentionQuery.value = '';
};

const handleBlur = () => {
  setTimeout(() => { showMentionList.value = false; }, 200);
};
</script>

<style scoped>
.agent-chat-wrapper {
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  width: 0;
  z-index: 9999;
}

.agent-chat-wrapper.is-open {
  width: 400px;
  border-left: 1px solid var(--border-color);
  background-color: var(--bg-secondary);
}

.agent-chat-sidebar {
  width: 400px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ---- Floating trigger ---- */
.floating-chat-trigger {
  position: fixed;
  bottom: 25px;
  right: 25px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  font-size: 24px;
  box-shadow: 0 4px 20px rgba(0, 242, 254, 0.4);
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  z-index: 9999;
}

.floating-chat-trigger:hover {
  transform: scale(1.1) rotate(5deg);
  box-shadow: 0 0 25px rgba(0, 242, 254, 0.7);
}

.pulse-ring {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  border-radius: 50%;
  border: 2px solid #00f2fe;
  animation: pulse-ring 2s infinite ease-in-out;
  pointer-events: none;
}

@keyframes pulse-ring {
  0% { transform: scale(0.9); opacity: 0.8; }
  50% { transform: scale(1.15); opacity: 0.3; }
  100% { transform: scale(0.9); opacity: 0.8; }
}

/* ---- Sidebar layout ---- */
.sidebar-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

/* ---- Header ---- */
.sidebar-header {
  display: flex;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  gap: 12px;
  flex-shrink: 0;
}

.avatar { font-size: 26px; }

.header-meta {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.header-meta h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.status-tag {
  font-size: 11px;
  color: #10b981;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
}

.pulse-dot {
  width: 6px; height: 6px;
  background: #10b981;
  border-radius: 50%;
  animation: pulse-ring 1.5s infinite;
}

.header-actions { display: flex; gap: 6px; }

/* ---- Message list ---- */
.chat-logs-container {
  flex: 1;
  overflow-y: auto;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scroll-behavior: smooth;
}

.thinking-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  border-radius: 12px;
  border-bottom-left-radius: 2px;
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  background-color: var(--color-primary, #4facfe);
  border-radius: 50%;
  display: inline-block;
  animation: bounce 1.4s infinite ease-in-out both;
}

.typing-indicator span:nth-child(1) {
  animation-delay: -0.32s;
}

.typing-indicator span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1.15);
    opacity: 1;
  }
}

.thinking-text {
  font-size: 0.8rem;
  color: var(--text-muted);
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
</style>
