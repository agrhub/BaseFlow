<template>
  <div class="chat-input-panel-container">
    <!-- Context suggestions tray (above input) -->
    <div v-if="currentSuggestions.length > 0" class="context-suggestions-tray">
      <el-button
        v-for="sugg in currentSuggestions"
        :key="sugg.value"
        type="primary" round text bg size="small"
        @click="$emit('select-suggestion', sugg.value)"
      >
        {{ sugg.label }}
      </el-button>
    </div>

    <!-- Input bar -->
    <div class="input-panel-row">
      <div class="chat-input-wrapper" :class="{ 'is-focused': isFocused }">
        <el-button
          :type="listening ? 'danger' : 'default'"
          :title="store.t('Voice input')"
          :icon="Microphone"
          circle
          class="voice-input-btn"
          @click="$emit('voice-click')"
        ></el-button>

        <el-input
          ref="elInputRef"
          v-model="internalValue"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 6 }"
          :placeholder="store.t('Ask about code, request refactoring, navigate tabs...')"
          class="chat-input-textarea"
          resize="none"
          @input="onInput"
          @keydown="onKeydown"
          @focus="isFocused = true"
          @blur="onBlur"
        />

        <el-button
          type="primary"
          :loading="thinking"
          :icon="Promotion"
          :title="store.t('Send')"
          circle
          class="send-message-btn"
          @click="$emit('send')"
        ></el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { store } from '../../stores';
import { Microphone, Promotion } from '@element-plus/icons-vue';

const props = defineProps<{
  modelValue: string;
  currentSuggestions: Array<{ value: string; label: string }>;
  thinking: boolean;
  listening: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
  (e: 'send'): void;
  (e: 'voice-click'): void;
  (e: 'select-suggestion', suggestion: string): void;
  (e: 'input', val: string): void;
  (e: 'keydown', event: KeyboardEvent): void;
  (e: 'blur'): void;
}>();

const elInputRef = ref<any>(null);
const isFocused = ref(false);

const internalValue = computed({
  get() {
    return props.modelValue;
  },
  set(val) {
    emit('update:modelValue', val);
  }
});

const onInput = (val: string) => {
  emit('input', val);
};

const onKeydown = (event: KeyboardEvent) => {
  emit('keydown', event);
};

const onBlur = () => {
  isFocused.value = false;
  emit('blur');
};

const focus = () => {
  elInputRef.value?.focus();
};

defineExpose({
  focus
});
</script>

<style scoped>
.chat-input-panel-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.context-suggestions-tray {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  overflow-x: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(0, 0, 0, 0.1);
  white-space: nowrap;
  flex-shrink: 0;
}

.context-suggestions-tray::-webkit-scrollbar {
  display: none;
}

.input-panel-row {
  padding: 12px 16px 16px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.chat-input-wrapper {
  display: flex;
  align-items: flex-end;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 6px 8px;
  gap: 8px;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  box-shadow: var(--shadow-sm);
}

.chat-input-wrapper.is-focused {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 2px var(--color-brand-light);
}

.voice-input-btn, .send-message-btn {
  flex-shrink: 0;
  align-self: flex-end;
  margin-bottom: 2px;
}

.chat-input-textarea {
  flex: 1;
}

.chat-input-textarea :deep(.el-textarea__inner) {
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 6px 4px !important;
  resize: none !important;
  color: var(--text-primary) !important;
  font-family: inherit !important;
  font-size: 14px !important;
  line-height: 1.5 !important;
  min-height: 24px !important;
}

.chat-input-textarea :deep(.el-textarea__inner)::-webkit-scrollbar {
  width: 4px;
}

.chat-input-textarea :deep(.el-textarea__inner)::-webkit-scrollbar-thumb {
  background: var(--text-muted);
  border-radius: 2px;
}
</style>
