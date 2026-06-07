import { createRouter, createWebHistory } from 'vue-router';
import { store } from '../stores';

import Welcome from '../views/Welcome.vue';
import Login from '../views/Login.vue';
import Guide from '../views/Guide.vue';
import Connections from '../views/Connections.vue';
import RepositoryDashboard from '../views/RepositoryDashboard.vue';
import MindmapView from '../views/MindmapView.vue';
import ClassInspector from '../views/ClassInspector.vue';

const routes = [
  {
    path: '/welcome',
    name: 'Welcome',
    component: Welcome
  },
  {
    path: '/guide',
    name: 'Guide',
    component: Guide
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/',
    name: 'Connections',
    component: Connections
  },
  {
    path: '/:conn',
    name: 'CodebaseDashboard',
    component: RepositoryDashboard
  },
  {
    path: '/:conn/explorer',
    name: 'FolderViewRoot',
    component: MindmapView
  },
  {
    path: '/:conn/explorer/:folder',
    name: 'FolderView',
    component: MindmapView
  },
  {
    path: '/:conn/explorer/:folder/:item',
    name: 'ClassInspector',
    component: ClassInspector
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// Navigation Auth guard
router.beforeEach(async (to, _from) => {
  await store.fetchAuthStatus();

  // Set store active route tokens automatically
  if (to.params.conn) {
    store.setConnection(to.params.conn as string);
  } else {
    store.activeConnection = '';
  }

  if (to.params.folder) {
    const folderName = (to.params.folder as string).replace(/_/g, '/');
    store.setFolder(folderName);
  } else {
    store.activeFolder = '';
  }

  if (to.params.item) {
    store.setItem(to.params.item as string);
  } else {
    store.activeItem = '';
  }

  // Redirect logic
  if (to.path === '/') {
    if (!store.loggedIn) {
      return '/welcome';
    }
  } else if (
    store.passwordRequired &&
    !store.loggedIn &&
    to.path !== '/login' &&
    to.path !== '/welcome' &&
    to.path !== '/guide'
  ) {
    return '/welcome';
  } else if (store.loggedIn && to.path === '/login') {
    return '/';
  }
});

export default router;
