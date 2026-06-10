/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module 'markdown-it' {
  const markdownIt: any;
  export default markdownIt;
}

declare module 'element-plus';
declare module 'vue-router';

declare var pendo: {
  initialize: (config: any) => void;
  identify: (options: any = {}) => void;
  updateOptions: (options: any) => void;
  pageLoad: (path: string) => void;
  track: (eventName: string, metadata?: object) => void;
  trackAgent: (eventType: string, metadata?: object) => void;
  clearSession: () => void;
};

