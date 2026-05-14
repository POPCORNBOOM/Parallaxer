<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

export interface AppSelectOption {
  value: string;
  label: string;
}

const props = defineProps<{
  modelValue: string;
  options: AppSelectOption[];
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const selectedLabel = computed(() => {
  const option = props.options.find((item) => item.value === props.modelValue);
  return option?.label ?? props.placeholder ?? '';
});

function close(): void {
  open.value = false;
}

function toggle(): void {
  open.value = !open.value;
}

function select(value: string): void {
  emit('update:modelValue', value);
  close();
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target as Node | null;
  if (!root.value || (target && root.value.contains(target))) {
    return;
  }

  close();
}

window.addEventListener('pointerdown', onPointerDown);

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown);
});
</script>

<template>
  <div ref="root" class="app-select" :class="{ open }">
    <button
      class="app-select-trigger"
      type="button"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="app-select-value" :class="{ placeholder: !modelValue }">
        {{ selectedLabel }}
      </span>
      <i class="mdi mdi-chevron-down app-select-icon" />
    </button>

    <div v-if="open" class="app-select-menu floating-overlay">
      <button
        v-for="option in options"
        :key="option.value || '__empty__'"
        class="app-select-option"
        :class="{ selected: option.value === modelValue }"
        type="button"
        @click="select(option.value)"
      >
        <span>{{ option.label }}</span>
        <i v-if="option.value === modelValue" class="mdi mdi-check" />
      </button>
    </div>
  </div>
</template>
