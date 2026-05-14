<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
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

const { t } = useI18n({ useScope: 'global' });
const openMenu = ref<MenuKey | null>(null);
const menuLabel = computed<Record<MenuKey, string>>(() => ({
  file: t('titlebar.file'),
  edit: t('titlebar.edit'),
  help: t('titlebar.help')
}));

const menuItems = computed<Record<MenuKey, MenuAction[]>>(() => ({
  file: [
    { key: 'new-config', label: t('titlebar.newConfig') },
    { key: 'new-playlist', label: t('titlebar.newPlaylist') },
    { key: 'open-playlist-folder', label: t('titlebar.openPlaylistFolder') }
  ],
  edit: [
    { key: 'refresh-monitors', label: t('titlebar.refreshMonitors') },
    { key: 'refresh-configurations', label: t('titlebar.refreshConfigurations') },
    { key: 'refresh-playlists', label: t('titlebar.refreshPlaylists') }
  ],
  help: [{ key: 'about', label: t('titlebar.about') }]
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
          {{ menuLabel[menu] }}
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
      <span class="titlebar-brand">{{ t('common.appName') }}</span>
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
