<script setup lang="ts">
import { computed, ref } from 'vue';
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from '../../lib/window';

type MenuKey = 'file' | 'edit' | 'help';

interface MenuAction {
  key: string;
  label: string;
}

const props = defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  toggleSidebar: [];
  command: [menu: MenuKey, actionKey: string];
}>();

const openMenu = ref<MenuKey | null>(null);

const menuItems = computed<Record<MenuKey, MenuAction[]>>(() => ({
  file: [
    { key: 'new-config', label: 'New Config' },
    { key: 'new-playlist', label: 'New Playlist' },
    { key: 'open-playlist-folder', label: 'Open Playlist Folder' }
  ],
  edit: [
    { key: 'refresh-monitors', label: 'Refresh Monitors' },
    { key: 'refresh-configurations', label: 'Refresh Configurations' },
    { key: 'refresh-playlists', label: 'Refresh Playlists' }
  ],
  help: [{ key: 'about', label: 'About Parallaxer' }]
}));

function toggleMenu(menu: MenuKey): void {
  openMenu.value = openMenu.value === menu ? null : menu;
}

function runMenuCommand(menu: MenuKey, actionKey: string): void {
  openMenu.value = null;
  emit('command', menu, actionKey);
}
</script>

<template>
  <header class="titlebar">
    <div class="titlebar-left">
      <button class="titlebar-icon" type="button" @click="emit('toggleSidebar')">
        <i :class="props.collapsed ? 'mdi mdi-dock-right' : 'mdi mdi-dock-left'" />
      </button>

      <div v-for="menu in ['file', 'edit', 'help'] as MenuKey[]" :key="menu" class="titlebar-menu">
        <button class="titlebar-menu-button" type="button" @click="toggleMenu(menu)">
          {{ menu.charAt(0).toUpperCase() + menu.slice(1) }}
        </button>
        <div v-if="openMenu === menu" class="titlebar-menu-panel floating-overlay">
          <button
            v-for="item in menuItems[menu]"
            :key="item.key"
            class="titlebar-menu-item"
            type="button"
            @click="runMenuCommand(menu, item.key)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="titlebar-drag" data-tauri-drag-region>
      <span class="titlebar-brand">Parallaxer</span>
    </div>

    <div class="titlebar-right">
      <button class="titlebar-icon" type="button" @click="minimizeWindow">
        <i class="mdi mdi-window-minimize" />
      </button>
      <button class="titlebar-icon" type="button" @click="toggleMaximizeWindow">
        <i class="mdi mdi-checkbox-blank-outline" />
      </button>
      <button class="titlebar-icon titlebar-icon-danger" type="button" @click="closeWindow">
        <i class="mdi mdi-close" />
      </button>
    </div>
  </header>
</template>
