import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css'; // Dark mode
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import './styles/theme.css';
import App from './App.vue';
import { pinia, store } from './stores';
import router from './router';
import { i18n } from './locales/index.js';

// Initialize Theme
store.initTheme();

const app = createApp(App);

// Register Element Plus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(pinia);
app.use(i18n);
app.use(router);
app.use(ElementPlus);
app.mount('#app');
