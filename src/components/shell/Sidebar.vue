<script setup lang="ts">
import { ref } from 'vue';
import type { SidebarButton, SidebarItem, SidebarList } from '../../lib/sidebar';

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
</script>

<template>
  <aside ref="sidebarElement" class="shell-sidebar" :class="{ collapsed }" :style="{ width: `${width}px` }">
    <div class="shell-sidebar-group shell-sidebar-group-top">
      <button
        v-for="button in headButtons"
        :key="button.key"
        class="shell-sidebar-button"
        type="button"
        :title="button.hoverTip"
        @click="emit('head-button-clicked', button.key)"
      >
        <i v-if="button.icon" :class="iconClasses(button.icon)" />
        <span v-if="!collapsed">{{ button.title }}</span>
      </button>
    </div>

    <div class="shell-sidebar-body">
      <section v-for="list in bodyLists" :key="list.key" class="shell-sidebar-list">
        <div class="shell-sidebar-list-head">
          <strong v-if="!collapsed">{{ list.title }}</strong>
          <div class="shell-sidebar-actions">
            <button
              v-for="action in list.actions"
              :key="`${list.key}-${action.key ?? action.icon}`"
              class="shell-sidebar-action"
              type="button"
              :title="action.hoverTip"
              @click="action.key && emit('list-button-clicked', list.key, null, action.key)"
            >
              <i :class="iconClasses(action.icon)" />
            </button>
          </div>
        </div>

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
            <i v-if="item.head" :class="iconClasses(item.head.icon)" />
          </span>
          <span v-if="!collapsed" class="shell-sidebar-item-body">
            <span class="shell-sidebar-item-title">{{ item.title }}</span>
            <span class="shell-sidebar-item-tail">
              <span class="shell-sidebar-tail-base">
                <template v-if="isActionObject(item.tail)">
                  <button
                    class="shell-sidebar-action"
                    type="button"
                    :title="item.tail.hoverTip"
                    @click.stop="item.tail.key && emit('list-button-clicked', list.key, item.key, item.tail.key)"
                  >
                    <i :class="iconClasses(item.tail.icon)" />
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
                    :title="action.hoverTip"
                    @click.stop="action.key && emit('list-button-clicked', list.key, item.key, action.key)"
                  >
                    <i :class="iconClasses(action.icon)" />
                  </button>
                </template>
              </span>
            </span>
          </span>
        </button>
      </section>
    </div>

    <div class="shell-sidebar-group shell-sidebar-group-bottom">
      <button
        v-for="button in tailButtons"
        :key="button.key"
        class="shell-sidebar-button"
        type="button"
        :title="button.hoverTip"
        @click="emit('tail-button-clicked', button.key)"
      >
        <i v-if="button.icon" :class="iconClasses(button.icon)" />
        <span v-if="!collapsed">{{ button.title }}</span>
      </button>
    </div>

    <div v-if="!collapsed" class="shell-sidebar-resizer" @pointerdown.prevent="onResizePointerDown" />
  </aside>
</template>
