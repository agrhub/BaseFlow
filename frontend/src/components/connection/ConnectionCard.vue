<template>
  <el-card class="conn-card" @click="handleConnect">
    <!-- Card title -->
    <div class="card-header-row">
      <div class="conn-title-box">
        <el-icon class="conn-icon"><Connection /></el-icon>
        <span class="conn-name">{{ name }}</span>
      </div>
      <div class="conn-options">
        <el-tag type="success" round v-if="config.connection_options?.type === 'remote'"><el-icon><Cloudy /></el-icon>{{ store.t('Remote') }}</el-tag>
        <el-tag type="primary" round v-else-if="config.connection_options?.type === 'local'"><el-icon><Monitor /></el-icon>{{ store.t('Local') }}</el-tag>
        <el-dropdown trigger="click" @command="handleCommand" @click.stop>
          <el-button type="primary" link :icon="MoreFilled" @click.stop />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="edit" :icon="Edit">{{ store.t('Edit') }}</el-dropdown-item>
              <el-dropdown-item command="delete" :icon="Delete" class="text-danger">{{ store.t('Delete') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- Connection details -->
    <div class="card-body-box">
      <div class="detail-row">
        <span class="detail-lbl">{{ store.t('Connection String') }}:</span>
        <span class="detail-val mask-string">{{ maskConnString(config.connection_string) }}</span>
      </div>
      <div class="detail-row" v-if="config.connection_options && Object.keys(config.connection_options).length > 0">
        <span class="detail-lbl">{{ store.t('Options') }}:</span>
        <div class="options-list">
          <div 
            v-for="(val, key) in config.connection_options" 
            :key="key" 
            class="option-item"
          >
            <span class="option-key">{{ key }}</span>
            <span class="option-val">{{ isSensitive(String(key)) ? '••••••••' : val }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Card actions -->
    <div class="card-footer-box">
      <el-button 
        type="primary" round
        class="connect-btn"
        @click.stop="handleConnect"
      >
        {{ store.t('Connect') }}
      </el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { store } from '../../stores';
import { Connection, Edit, Delete, MoreFilled } from '@element-plus/icons-vue';

const props = defineProps<{
  name: string;
  config: {
    connection_string?: string;
    connection_options?: {
      type?: string;
      branch?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
}>();

const emit = defineEmits<{
  (e: 'edit', name: string, config: any): void;
  (e: 'delete', name: string): void;
}>();

const router = useRouter();

const maskConnString = (str?: string) => {
  if (!str) return '';
  try {
    return str.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, '$1******$3');
  } catch (e) {
    return str;
  }
};

const isSensitive = (key: string) => {
  const k = key.toLowerCase();
  return k.includes('token') || k.includes('key') || k.includes('secret') || k.includes('password');
};

const handleConnect = () => {
  store.setConnection(props.name);
  router.push(`/${props.name}`);
};

const handleCommand = (cmd: string) => {
  if (cmd === 'edit') {
    emit('edit', props.name, props.config);
  } else if (cmd === 'delete') {
    emit('delete', props.name);
  }
};
</script>

<style scoped>
.conn-card {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.5rem;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.conn-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.1));
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.75rem;
  margin-bottom: 1rem;
}

.conn-title-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conn-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conn-icon {
  font-size: 1.25rem;
  color: var(--color-brand);
}

.conn-name {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-primary);
}

.card-body-box {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-lbl {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.detail-val {
  font-size: 0.875rem;
  color: var(--text-secondary);
  word-break: break-all;
}

.mask-string {
  font-family: var(--font-mono, monospace);
  font-size: 0.8rem;
  background: var(--bg-secondary);
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-secondary);
  padding: 8px 12px;
  border-radius: var(--radius-md, 6px);
  border: 1px solid var(--border-color);
}

.option-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  font-family: var(--font-mono, monospace);
}

.option-key {
  color: var(--text-muted);
  font-weight: 500;
}

.option-key::after {
  content: ":";
}

.option-val {
  color: var(--text-secondary);
  word-break: break-all;
  font-weight: 600;
}

.card-footer-box {
  border-top: 1px solid var(--border-color);
  padding-top: 1rem;
  margin-top: auto;
}

.connect-btn {
  width: 100%;
}

.text-danger {
  color: var(--color-danger) !important;
}
</style>
