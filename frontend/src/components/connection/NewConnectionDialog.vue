<template>
  <el-dialog
    v-model="visible"
    :title="isEditMode ? store.t('Edit Connection') : store.t('Add Connection')"
    width="520px"
  >
    <el-form 
      :model="connForm" 
      label-position="top" 
      v-loading="saving" 
      :element-loading-text="loadingText"
    >
      <el-form-item :label="store.t('Connection Name')" required>
        <el-input v-model="connForm.name" :placeholder="store.t('e.g. MyProject')" :disabled="isEditMode" />
      </el-form-item>

      <el-form-item :label="store.t('Path / Clone URL')" required>
        <el-input
          v-model="connForm.string"
          type="textarea"
          :rows="2"
          :placeholder="store.t('e.g. C:/Projects/MyProject  or  https://github.com/user/repo.git')"
        />
      </el-form-item>

      <el-form-item :label="store.t('Repository Type')">
        <el-radio-group v-model="connForm.type">
          <el-radio-button value="local">{{ store.t('Local Folder') }}</el-radio-button>
          <el-radio-button value="remote">{{ store.t('Git Remote URL') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="store.t('Default Branch')" v-if="connForm.type === 'remote'">
        <el-input v-model="connForm.branch" :placeholder="store.t('e.g. main')" />
      </el-form-item>

      <el-form-item :label="store.t('Git Username') + ' (' + store.t('Optional').toLowerCase() + ')'" v-if="connForm.type === 'remote'">
        <el-input v-model="connForm.gitUsername" :placeholder="store.t('e.g. oauth2')" />
      </el-form-item>

      <el-form-item :label="store.t('Git Personal Key / Token') + ' (' + store.t('Optional').toLowerCase() + ')'" v-if="connForm.type === 'remote'">
        <el-input v-model="connForm.gitToken" type="password" show-password :placeholder="store.t('e.g. ghp_xxxxxxxx or glpat-xxxxxxx')" />
      </el-form-item>

      <el-form-item :label="store.t('Git MCP Server Endpoint') + ' (' + store.t('Optional').toLowerCase() + ')'" v-if="connForm.type === 'remote'">
        <el-input v-model="connForm.gitMcpServer" :placeholder="store.t('e.g. https://gitlab.com/api/v4')" />
      </el-form-item>
    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="visible = false" round>{{ store.t('Cancel') }}</el-button>
        <el-button type="primary" round @click="saveConnection" :loading="saving">{{ store.t('Save') }}</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { store } from '../../stores';
import { ElMessage } from 'element-plus';
import axios from 'axios';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  editData: { type: Object as () => any, default: null }
});

const emit = defineEmits(['update:modelValue', 'saved']);

const visible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val)
});

const isEditMode = ref(false);
const saving = ref(false);

const loadingText = computed(() => {
  if (connForm.type === 'remote') {
    return isEditMode.value
      ? store.t('Updating repository files, please wait...')
      : store.t('Cloning remote repository to local machine, please wait...');
  }
  return store.t('Saving connection details...');
});

const connForm = reactive({
  name: '',
  string: '',
  type: 'local',
  branch: '',
  curr_config: '',
  gitUsername: '',
  gitToken: '',
  gitMcpServer: ''
});

watch(() => props.editData, (newVal) => {
  if (newVal) {
    isEditMode.value = true;
    connForm.name = newVal.name || '';
    connForm.string = newVal.config?.connection_string || '';
    connForm.type = newVal.config?.connection_options?.type || 'local';
    connForm.branch = newVal.config?.connection_options?.branch || '';
    connForm.curr_config = newVal.name || '';
    connForm.gitUsername = newVal.config?.connection_options?.gitUsername || '';
    connForm.gitToken = newVal.config?.connection_options?.gitToken || '';
    connForm.gitMcpServer = newVal.config?.connection_options?.gitMcpServer || '';
  } else {
    isEditMode.value = false;
    connForm.name = '';
    connForm.string = '';
    connForm.type = 'local';
    connForm.branch = '';
    connForm.curr_config = '';
    connForm.gitUsername = '';
    connForm.gitToken = '';
    connForm.gitMcpServer = '';
  }
}, { immediate: true });

// Parse embedded credentials from a Git URL and return clean URL + extracted fields
function parseCredentialsFromUrl(rawUrl: string): {
  cleanUrl: string;
  username: string;
  token: string;
} {
  const result = { cleanUrl: rawUrl, username: '', token: '' };
  try {
    // Match https://user:token@host or https://token@host
    const credMatch = rawUrl.match(/^(https?:\/\/)([^@\s]+)@(.+)$/i);
    if (!credMatch) return result;

    const scheme = credMatch[1];        // e.g. "https://"
    const credsPart = credMatch[2];     // e.g. "user:token" or just "token"
    const rest = credMatch[3];          // e.g. "github.com/owner/repo.git"

    result.cleanUrl = `${scheme}${rest}`;

    const colonIdx = credsPart.indexOf(':');
    if (colonIdx !== -1) {
      // user:token format
      result.username = decodeURIComponent(credsPart.slice(0, colonIdx));
      result.token = decodeURIComponent(credsPart.slice(colonIdx + 1));
    } else {
      // bare token (no username)
      result.token = decodeURIComponent(credsPart);
    }
  } catch (_) {}
  return result;
}

// Auto-detect Repository Type and auto-fill credentials from embedded URL auth
watch(() => connForm.string, (newVal) => {
  if (!newVal) return;
  const val = newVal.trim();
  const isRemote = /^(https?:\/\/|git@|git:\/\/)/i.test(val) ||
                   val.endsWith('.git') || 
                   val.includes('github.com') || 
                   val.includes('gitlab.com');
  if (!isEditMode.value) {
    connForm.type = isRemote ? 'remote' : 'local';
  }

  // Auto-parse credentials from the URL if embedded (https://user:token@host/...)
  if (isRemote && val.match(/^https?:\/\/[^@\s]+@/i)) {
    const parsed = parseCredentialsFromUrl(val);
    // Only auto-fill if the user hasn't already typed credentials manually
    if (parsed.token && !connForm.gitToken) {
      connForm.gitToken = parsed.token;
    }
    if (parsed.username && !connForm.gitUsername) {
      connForm.gitUsername = parsed.username;
    }
    // Strip credentials from the URL field (security: don't store raw token in URI)
    if (parsed.cleanUrl !== val) {
      connForm.string = parsed.cleanUrl;
    }
  }
});

const saveConnection = async () => {
  if (!connForm.name || !connForm.string) {
    ElMessage.error(store.t('Connection name and connection string are required'));
    return;
  }

  saving.value = true;
  try {
    const options = {
      type: connForm.type,
      branch: connForm.branch,
      gitUsername: connForm.gitUsername,
      gitToken: connForm.gitToken,
      gitMcpServer: connForm.gitMcpServer
    };
    if (isEditMode.value) {
      await axios.post('/api/connections/update', {
        curr_config: connForm.curr_config,
        conn_name: connForm.name,
        conn_string: connForm.string,
        options
      });
      ElMessage.success(store.t('Connection successfully updated'));
    } else {
      await axios.post('/api/connections/add', {
        name: connForm.name,
        string: connForm.string,
        options
      });
      ElMessage.success(store.t('Connection successfully added'));
    }
    visible.value = false;
    emit('saved');
  } catch (e: any) {
    const msg = e.response?.data?.msg || e.response?.data?.error || store.t('Error saving connection');
    ElMessage.error(msg);
  } finally {
    saving.value = false;
  }
};
</script>
