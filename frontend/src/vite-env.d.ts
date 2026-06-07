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

// declare module 'vue3-mindmap' {
//   const mindmap: any;
//   export default mindmap;
// }

