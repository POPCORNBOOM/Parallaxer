<script setup lang="ts">
import { ref, watch } from 'vue';
import type { SidebarButton, SidebarItem, SidebarList } from '../../lib/sidebar';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  collapsed: boolean;
  width: number;
  headButtons: SidebarButton[];
  bodyLists: SidebarList[];
  tailButtons: SidebarButton[];
  listItems: Record<string, SidebarItem[]>;
}>();

const emit = defineEmits<{
  'head-button-clicked': [buttonKey: string];
  'list-button-clicked': [listKey: string, itemKey: string | null, actionKey: string];
  'list-selection-changed': [listKey: string, itemKey: string];
  'tail-button-clicked': [buttonKey: string];
  resize: [width: number];
}>();

const sidebarElement = ref<HTMLElement | null>(null);
const resizing = ref(false);
const collapsedLists = ref<Record<string, boolean>>({});
const { t } = useI18n({ useScope: 'global' });

function ensureListState(lists: SidebarList[]): void {
  const next: Record<string, boolean> = {};
  for (const list of lists) {
    next[list.key] = collapsedLists.value[list.key] ?? false;
  }
  collapsedLists.value = next;
}

watch(
  () => props.bodyLists,
  (lists) => {
    ensureListState(lists);
  },
  { immediate: true }
);

function onResizePointerDown(event: PointerEvent): void {
  if (props.collapsed) {
    return;
  }

  resizing.value = true;
  const pointerId = event.pointerId;
  const startLeft = sidebarElement.value?.getBoundingClientRect().left ?? 0;

  const onPointerMove = (moveEvent: PointerEvent): void => {
    if (!resizing.value) {
      return;
    }

    emit('resize', Math.max(78, Math.round(moveEvent.clientX - startLeft)));
  };

  const onPointerUp = (): void => {
    resizing.value = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    if (sidebarElement.value?.hasPointerCapture(pointerId)) {
      sidebarElement.value.releasePointerCapture(pointerId);
    }
  };

  sidebarElement.value?.setPointerCapture(pointerId);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function isActionObject(value: string | { icon: string; key?: string }): value is { icon: string; key?: string } {
  return typeof value !== 'string';
}

function iconClasses(icon: string): string[] {
  const tokens = icon.split(/\s+/).filter(Boolean);
  return tokens.includes('mdi') ? tokens : ['mdi', ...tokens];
}

function iconStyle(color?: string): { color?: string } | undefined {
  return color ? { color } : undefined;
}

function toggleListCollapsed(listKey: string): void {
  collapsedLists.value[listKey] = !collapsedLists.value[listKey];
}

function isListCollapsed(listKey: string): boolean {
  return collapsedLists.value[listKey] === true;
}
</script>

<template>
  <aside ref="sidebarElement" class="shell-sidebar" :class="{ collapsed }" :style="{ width: `${width}px` }">
    <div class="shell-sidebar-group shell-sidebar-group-top">
      <button
        v-for="button in headButtons"
        :key="button.key"
        class="shell-sidebar-button"
        type="button"
        :data-tooltip="button.hoverTip || null"
        @click="emit('head-button-clicked', button.key)"
      >
        <i v-if="button.icon" :class="iconClasses(button.icon)" />
        <span v-if="!collapsed">{{ button.title }}</span>
      </button>
    </div>

    <div class="shell-sidebar-body">
      <section v-for="list in bodyLists" :key="list.key" class="shell-sidebar-list">
        <div class="shell-sidebar-list-head">
          <button v-if="!collapsed" class="shell-sidebar-list-toggle" type="button"
            :data-tooltip="isListCollapsed(list.key) ? t('shell.action.expandList') : t('shell.action.collapseList')"
            @click.stop="toggleListCollapsed(list.key)">
            <span class="shell-sidebar-list-title">{{ list.title }}</span>
            <i class="mdi mdi-chevron-down" :class="{ collapsed: isListCollapsed(list.key) }" />
          </button>

          <div class="shell-sidebar-actions">
            <button
              v-for="action in list.actions"
              :key="`${list.key}-${action.key ?? action.icon}`"
              class="shell-sidebar-action"
              type="button"
              :data-tooltip="action.hoverTip || null"
              @click="action.key && emit('list-button-clicked', list.key, null, action.key)"
            >
              <i :class="iconClasses(action.icon)" :style="iconStyle(action.color)" />
            </button>
          </div>
        </div>

        <div class="shell-sidebar-list-content-wrap" :class="{ collapsed: isListCollapsed(list.key) }">
          <div class="shell-sidebar-list-content">
          <div v-if="(listItems[list.key]?.length ?? 0) === 0" class="shell-sidebar-empty">
            <span v-if="!collapsed">{{ list.placeholder }}</span>
          </div>

          <button
            v-for="item in listItems[list.key] ?? []"
            :key="item.key"
            class="shell-sidebar-item"
            :class="{ selected: item.selected }"
            type="button"
            @click="emit('list-selection-changed', list.key, item.key)"
          >
            <span class="shell-sidebar-item-head">
              <button
                v-if="item.head"
                class="shell-sidebar-action shell-sidebar-head-action shell-sidebar-head-base"
                type="button"
                :data-tooltip="item.head.hoverTip || null"
                @click.stop="item.head.key && emit('list-button-clicked', list.key, item.key, item.head.key)"
              >
                <i :class="iconClasses(item.head.icon)" :style="iconStyle(item.head.color)" />
              </button>
              <button
                v-if="item.hoverHead"
                class="shell-sidebar-action shell-sidebar-head-action shell-sidebar-head-hover"
                type="button"
                :data-tooltip="item.hoverHead.hoverTip || null"
                @click.stop="item.hoverHead.key && emit('list-button-clicked', list.key, item.key, item.hoverHead.key)"
              >
                <i :class="iconClasses(item.hoverHead.icon)" :style="iconStyle(item.hoverHead.color)" />
              </button>
            </span>
            <span v-if="!collapsed" class="shell-sidebar-item-body">
              <span class="shell-sidebar-item-title">{{ item.title }}</span>
              <span class="shell-sidebar-item-tail">
                <span class="shell-sidebar-tail-base">
                  <template v-if="isActionObject(item.tail)">
                    <button
                      class="shell-sidebar-action"
                      type="button"
                      :data-tooltip="item.tail.hoverTip || null"
                      @click.stop="item.tail.key && emit('list-button-clicked', list.key, item.key, item.tail.key)"
                    >
                      <i :class="iconClasses(item.tail.icon)" :style="iconStyle(item.tail.color)" />
                    </button>
                  </template>
                  <span v-else class="shell-sidebar-tail-text">{{ item.tail }}</span>
                </span>

                <span class="shell-sidebar-tail-hover">
                  <span v-if="typeof item.hoverTail === 'string'" class="shell-sidebar-tail-text">
                    {{ item.hoverTail }}
                  </span>
                  <template v-else>
                    <button
                      v-for="action in item.hoverTail"
                      :key="`${item.key}-${action.key ?? action.icon}`"
                      class="shell-sidebar-action"
                      type="button"
                      :data-tooltip="action.hoverTip || null"
                      @click.stop="action.key && emit('list-button-clicked', list.key, item.key, action.key)"
                    >
                      <i :class="iconClasses(action.icon)" :style="iconStyle(action.color)" />
                    </button>
                  </template>
                </span>
              </span>
            </span>
          </button>
          </div>
        </div>
      </section>
    </div>

    <div class="shell-sidebar-group shell-sidebar-group-bottom">
      <button
        v-for="button in tailButtons"
        :key="button.key"
        class="shell-sidebar-button"
        type="button"
        :data-tooltip="button.hoverTip || null"
        @click="emit('tail-button-clicked', button.key)"
      >
        <i v-if="button.icon" :class="iconClasses(button.icon)" />
        <span v-if="!collapsed">{{ button.title }}</span>
      </button>
    </div>

    <div v-if="!collapsed" class="shell-sidebar-resizer" @pointerdown.prevent="onResizePointerDown" />
  </aside>
</template>
