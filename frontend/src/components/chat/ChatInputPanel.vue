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
      <el-input
        ref="elInputRef"
        v-model="internalValue"
        :placeholder="store.t('Ask about code, request refactoring, navigate tabs...')"
        class="chat-input-bar"
        @input="onInput"
        @keydown="onKeydown"
        @blur="$emit('blur')"
      >
        <template #prepend>
          <el-button
            :type="listening ? 'danger' : 'info'"
            :title="store.t('Voice input')"
            :icon="Microphone"
            @click="$emit('voice-click')"
          ></el-button>
        </template>
        <template #append>
          <el-button @click="$emit('send')" :loading="thinking" :icon="Promotion" :title="store.t('Send')"></el-button>
        </template>
      </el-input>
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

.chat-input-bar {
  width: 100%;
}
</style>
