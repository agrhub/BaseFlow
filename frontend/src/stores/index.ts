import { defineStore, createPinia } from 'pinia';
import axios from 'axios';
import { i18n } from '../locales/index.js';

axios.defaults.withCredentials = true;

// Create Pinia instance
export const pinia = createPinia();

export const useAppStore = defineStore('app', {
  state: () => ({
    // Connection & Navigation States
    connections: {} as Record<string, any>,
    activeConnection: '',
    activeFolder: '',   // Folder Path (corresponds to activeFolder)
    activeItem: '', // Class/File Name (corresponds to activeItem)
    sidebarList: {} as Record<string, string[]>,
    activeLocale: 'en',
    loggedIn: false,
    passwordRequired: false,
    loading: false,
    theme: 'system',
    activeTab: 'generate',
    selectedMindmapNode: '',
    vulnerableNodes: [] as string[],
    catalogReadyData: null as any,
    linkedPlaybooks: {} as Record<string, string>,
    playbookToReview: null as any,
    classesData: [] as any[],
    devopsInfo: {
      provider: 'none',
      hasToken: false,
      owner: '',
      repo: '',
      fullPath: '',
      options: {}
    } as any,

    // Chat Agent State
    chatSidebarOpen: false,
    chatInput: '',
    autoSendNextCommand: false,
    schemaRefreshTrigger: 0,
    dataRefreshTrigger: 0,
    selectedMethod: '',
    hoveredMethod: ''
  }),

  actions: {
    setSelectedMethod(methodName: string) {
      this.selectedMethod = methodName;
    },
    setHoveredMethod(methodName: string) {
      this.hoveredMethod = methodName;
    },
    triggerSchemaRefresh() {
      this.schemaRefreshTrigger++;
    },
    triggerDataRefresh() {
      this.dataRefreshTrigger++;
    },
    
    // Translation helper proxy to vue-i18n
    t(key: string, params?: any): string {
      if (!key) return '';
      try {
        // Handle typescript type assertion
        return (i18n.global as any).t(key, params);
      } catch (e) {
        return key;
      }
    },

    async fetchAuthStatus() {
      try {
        const res = await axios.get('/api/auth/status');
        this.loggedIn = res.data.loggedIn;
        this.passwordRequired = res.data.passwordRequired;
        return res.data;
      } catch (e) {
        console.error('Error fetching auth status:', e);
        this.passwordRequired = true;
        this.loggedIn = false;
        return { passwordRequired: true, loggedIn: false };
      }
    },

    async login(password: string) {
      try {
        await axios.post('/api/auth/login', { password });
        this.loggedIn = true;
        return { success: true };
      } catch (e: any) {
        const msg = e.response && e.response.data && e.response.data.msg
          ? e.response.data.msg
          : 'Error logging in';
        return { success: false, msg };
      }
    },

    async logout() {
      try {
        await axios.post('/api/auth/logout');
        this.loggedIn = false;
        return { success: true };
      } catch (e) {
        console.error('Error logging out:', e);
        return { success: false };
      }
    },

    async fetchLocales() {
      const savedLocale = localStorage.getItem('baseflow_locale');
      if (savedLocale) {
        this.activeLocale = savedLocale;
        (i18n.global.locale as any).value = savedLocale;
      } else {
        this.activeLocale = 'en';
        (i18n.global.locale as any).value = 'en';
      }
      document.cookie = `baseflow_locale=${this.activeLocale}; path=/; max-age=31536000; SameSite=Lax`;
    },

    setLocale(locale: string) {
      this.activeLocale = locale;
      (i18n.global.locale as any).value = locale;
      localStorage.setItem('baseflow_locale', locale);
      document.cookie = `baseflow_locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    },

    async fetchConnections() {
      try {
        const res = await axios.get('/api/connections');
        this.connections = res.data.connections || {};
      } catch (e) {
        console.error('Error fetching connections:', e);
      }
    },

    async fetchSidebar() {
      if (!this.activeConnection) return;
      try {
        const res = await axios.get(`/api/${this.activeConnection}/sidebar`);
        this.sidebarList = res.data.sidebar_list || {};
      } catch (e) {
        console.error('Error fetching sidebar list:', e);
      }
    },

    async fetchDevOpsInfo() {
      if (!this.activeConnection) return;
      try {
        const res = await axios.get(`/api/${this.activeConnection}/devops/info`);
        this.devopsInfo = res.data;
        this.fetchPlaybooks(); // Also fetch linked playbooks
      } catch (e) {
        console.error('Error fetching devops info:', e);
        this.devopsInfo = { provider: 'none', hasToken: false };
      }
    },
    
    async fetchPlaybooks() {
      if (!this.activeConnection) return;
      try {
        const res = await axios.get(`/api/${this.activeConnection}/documents`);
        const files: string[] = res.data.documents || [];
        this.linkedPlaybooks = {};
        files.forEach(filePath => {
          const lower = filePath.toLowerCase();
          const match = filePath.match(/(?:issue|pipeline|pr|mr)[_-](\d+)/i);
          if (match) {
            this.linkedPlaybooks[match[1]] = filePath;
          } else if (lower.includes('onboard')) {
            this.linkedPlaybooks['onboarding'] = filePath;
          } else if (lower.includes('report') || lower.includes('devops')) {
            this.linkedPlaybooks['devops_report'] = filePath;
          } else if (lower.includes('audit') || lower.includes('security')) {
            this.linkedPlaybooks['security_audit'] = filePath;
          }
        });
      } catch (e) {
        console.error('Error fetching playbooks:', e);
      }
    },

    setConnection(connName: string) {
      if (this.activeConnection !== connName) {
        this.activeConnection = connName;
        this.activeFolder = '';
        this.activeItem = '';
        this.sidebarList = {};
        this.fetchSidebar();
        this.fetchDevOpsInfo();
      }
    },

    setFolder(folderName: string) {
      this.activeFolder = folderName;
      this.activeItem = '';
    },

    setItem(itemName: string) {
      this.activeItem = itemName;
    },

    initTheme() {
      this.theme = localStorage.getItem('baseflow_theme') || 'system';
      this.applyTheme();

      // Listen for system theme changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => {
        if (this.theme === 'system') {
          this.applyTheme();
        }
      };
      mediaQuery.removeEventListener('change', listener);
      mediaQuery.addEventListener('change', listener);
    },

    setTheme(theme: string) {
      this.theme = theme;
      localStorage.setItem('baseflow_theme', theme);
      this.applyTheme();
    },

    applyTheme() {
      const resolvedTheme = this.theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : this.theme;

      if (resolvedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    }
  }
});

// Instance store proxy
export const store = useAppStore(pinia);

// Setup interceptors to handle 401 Unauthorized globally
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      store.loggedIn = false;
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/welcome' && path !== '/guide') {
        window.location.href = '/welcome';
      }
    }
    return Promise.reject(error);
  }
);
