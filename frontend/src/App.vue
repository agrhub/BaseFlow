<template>
  <div class="app-wrapper">
    <!-- Full-screen public layout for Login / Welcome / Guide -->
    <template v-if="['Login', 'Welcome', 'Guide'].includes(String($route.name))">
      <div class="public-wrapper">
        <router-view />
      </div>
    </template>

    <!-- Master Dashboard Layout -->
    <template v-else>
      <div class="app-container">
        <!-- Explorer Sidebar -->
        <Sidebar />

        <!-- Main Panel -->
        <div class="main-content">
          <!-- Top Header Navigation -->
          <header class="navbar-header">
            <!-- Breadcrumbs -->
            <div class="breadcrumb-container">
              <span class="crumb root-crumb" @click="$router.push('/')">
                <el-icon><HomeFilled /></el-icon>
                {{ store.t('Connections') }}
              </span>

              <template v-if="store.activeConnection">
                <el-icon class="breadcrumb-separator"><ArrowRight /></el-icon>
                <span class="crumb" @click="$router.push(`/${store.activeConnection}`)">
                  {{ store.activeConnection }}
                </span>
              </template>

              <template v-if="store.activeFolder">
                <el-icon class="breadcrumb-separator"><ArrowRight /></el-icon>
                <span class="crumb" @click="goToFolderMindmap">
                  {{ store.activeFolder }}
                </span>
              </template>

              <template v-if="store.activeItem">
                <el-icon class="breadcrumb-separator"><ArrowRight /></el-icon>
                <span class="crumb active-crumb">
                  {{ store.activeItem }}
                </span>
              </template>
            </div>

            <!-- Top Header Action widgets -->
            <div class="header-widgets">
              <!-- Dashboard/Mindmap Toggle Button -->
              <!-- <el-button
                v-if="store.activeConnection"
                type="primary"
                text bg round
                size="small"
                @click="$router.push('/' + store.activeConnection + (String($route.name) === 'CodebaseDashboard' ? '/explorer' : ''))"
              >
                <el-icon style="margin-right: 4px;">
                  <Share v-if="String($route.name) === 'CodebaseDashboard'" />
                  <Grid v-else />
                </el-icon>
                {{ String($route.name) === 'CodebaseDashboard' ? store.t('Mindmap') : store.t('Dashboard') }}
              </el-button> -->

              <!-- Theme selector dropdown -->
              <el-dropdown trigger="click" @command="handleThemeChange" size="small">
                <el-button text bg round size="small">
                  <el-icon>
                    <Sunny v-if="store.theme === 'light'" />
                    <Moon v-else-if="store.theme === 'dark'" />
                    <Monitor v-else />
                  </el-icon>
                  {{ store.t(themeLabel) }}
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="light" :class="{ 'is-active': store.theme === 'light' }">
                      <el-icon><Sunny /></el-icon> {{ store.t('Light') }}
                    </el-dropdown-item>
                    <el-dropdown-item command="dark" :class="{ 'is-active': store.theme === 'dark' }">
                      <el-icon><Moon /></el-icon> {{ store.t('Dark') }}
                    </el-dropdown-item>
                    <el-dropdown-item command="system" :class="{ 'is-active': store.theme === 'system' }">
                      <el-icon><Monitor /></el-icon> {{ store.t('System') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>

              <!-- Language selector dropdown -->
              <el-dropdown trigger="click" @command="handleLocaleChange" size="small">
                <el-button text bg round size="small">
                  <el-icon><Location /></el-icon>
                  {{ store.activeLocale.toUpperCase() }}
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="(label, code) in availableLocales"
                      :key="code"
                      :command="code"
                      :class="{ 'is-active': store.activeLocale === code }"
                    >
                      {{ label }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>

              <!-- Logout button (only shown if password protection is on) -->
              <el-button
                v-if="store.passwordRequired"
                type="danger"
                text bg round
                size="small"
                :icon="SwitchButton"
                @click="handleLogout"
              >
                {{ store.t('Logout') }}
              </el-button>
            </div>
          </header>

          <!-- Main viewport body -->
          <div class="viewport-body">
            <router-view v-slot="{ Component }">
              <transition name="fade" mode="out-in">
                <component :is="Component" />
              </transition>
            </router-view>
          </div>
        </div>

        <!-- Floating Chatbot Sidebar Panel -->
        <AgentChatSidebar />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { store } from './stores';
import Sidebar from './components/sidebar/Sidebar.vue';
import AgentChatSidebar from './components/chat/AgentChatSidebar.vue';
import {
  HomeFilled, ArrowRight, SwitchButton,
  Location, Sunny, Moon, Monitor
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useLocale } from './hooks/useLocale';

const { availableLocales, handleLocaleChange } = useLocale();

const router = useRouter();

const themeLabel = computed(() => {
  if (store.theme === 'light') return 'Light';
  if (store.theme === 'dark') return 'Dark';
  return 'System';
});

const handleThemeChange = (theme: string) => {
  store.setTheme(theme);
  ElMessage.success(store.t('Theme changed successfully'));
};

const goToFolderMindmap = () => {
  if (store.activeFolder && store.activeFolder !== 'root') {
    const encodedDb = store.activeFolder.replace(/\//g, '_');
    router.push(`/${store.activeConnection}/explorer/${encodedDb}`);
  } else {
    router.push(`/${store.activeConnection}/explorer`);
  }
};

const handleLogout = async () => {
  const result = await store.logout();
  if (result.success) {
    ElMessage.success(store.t('Logged out successfully'));
    router.push('/login');
  } else {
    ElMessage.error(store.t('Logout failed'));
  }
};

onMounted(async () => {
  store.loading = true;
  await store.fetchLocales();
  const path = window.location.pathname;
  if (path !== '/login' && path !== '/welcome' && path !== '/guide') {
    await store.fetchConnections();
  }
  store.loading = false;
});
</script>

<style scoped>
.app-wrapper {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.public-wrapper {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
}

.app-container {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-primary);
}

.navbar-header {
  height: 64px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2rem;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.breadcrumb-container {
  display: flex;
  align-items: center;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.crumb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: color var(--transition-fast);
}

.crumb:hover {
  color: var(--color-brand);
}

.root-crumb {
  color: var(--text-muted);
}

.breadcrumb-separator {
  margin: 0 8px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.active-crumb {
  color: var(--text-primary);
  font-weight: 600;
  cursor: default;
}

.active-crumb:hover {
  color: var(--text-primary);
}

.header-widgets {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.viewport-body {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
