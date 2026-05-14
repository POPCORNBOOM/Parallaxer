<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  ConfigurationMonitor,
  ConfigurationRecord,
  MediaFit,
  MirrorMode,
  MonitorRecord,
  Rotation
} from '../../types';
import {
  mapMonitorStripHeight,
  MONITOR_STRIP_REFERENCE_HEIGHT,
  buildMediaFrameStyle,
  buildMonitorTransform,
  formatMonitorTitle,
  getMonitorMediaFit,
  isQuarterTurnRotation
} from '../../lib/ui';

const props = defineProps<{
  configuration: ConfigurationRecord | null;
  availableMonitors: MonitorRecord[];
  selectedMonitorKey: string | null;
  monitorStripHeightGamma: number;
}>();

const emit = defineEmits<{
  'name-changed': [value: string];
  'description-changed': [value: string];
  'add-monitor': [deviceId: string];
  'select-monitor': [deviceId: string];
  'remove-monitor': [deviceId: string];
  'reorder-monitors': [orderedDeviceIds: string[]];
  'short-name-changed': [deviceId: string, value: string];
  'rotation-changed': [deviceId: string, value: Rotation, syncAll?: boolean];
  'mirror-changed': [deviceId: string, value: MirrorMode, syncAll?: boolean];
  'fit-changed': [deviceId: string, value: MediaFit, syncAll?: boolean];
  'scale-changed': [deviceId: string, value: number, syncAll?: boolean];
  'offset-x-changed': [deviceId: string, value: number, syncAll?: boolean];
  'offset-y-changed': [deviceId: string, value: number, syncAll?: boolean];
}>();

const rotations: Rotation[] = [0, 90, 180, 270];
const mirrors: MirrorMode[] = ['none', 'horizontal', 'vertical'];
const fits: MediaFit[] = ['contain', 'cover', 'fill', 'none'];
const { t } = useI18n({ useScope: 'global' });

const addPickerOpen = ref(false);
const addTriggerRef = ref<HTMLElement | null>(null);
const addPickerElement = ref<HTMLElement | null>(null);
const stripScrollRef = ref<HTMLElement | null>(null);
const addPickerStyle = ref<Record<string, string>>({});
const shiftPressed = ref(false);
const dragOrderedIds = ref<string[]>([]);
const pressedDeviceId = ref<string | null>(null);
const draggedDeviceId = ref<string | null>(null);
const dragOverDeviceId = ref<string | null>(null);
const dragBefore = ref(false);
const suppressMonitorClick = ref(false);
let dragStartX = 0;
let dragStartY = 0;
let dragScrollFrame = 0;
let dragScrollDirection = 0;

function getMonitorInfo(deviceId: string): MonitorRecord | undefined {
  return props.availableMonitors.find((monitor) => monitor.deviceId === deviceId);
}

function getSelectedMonitor(): ConfigurationMonitor | null {
  if (!props.configuration) {
    return null;
  }

  return (
    props.configuration.monitors.find((monitor) => monitor.deviceId === props.selectedMonitorKey) ??
    props.configuration.monitors[0] ??
    null
  );
}

function getPhysicalSize(deviceId: string): { width: number; height: number } {
  const info = getMonitorInfo(deviceId);
  const width = info?.size.width ?? 1;
  const height = info?.size.height ?? 1;

  return { width, height };
}

function getPreviewTransform(
  mapping: ConfigurationMonitor['mapping'],
  cardWidth: number,
  cardHeight: number,
  effectiveMonitorWidth: number,
  effectiveMonitorHeight: number
): string {
  const offsetXMultiplier = effectiveMonitorWidth > 0 ? cardWidth / effectiveMonitorWidth : 1;
  const offsetYMultiplier = effectiveMonitorHeight > 0 ? cardHeight / effectiveMonitorHeight : 1;

  return buildMonitorTransform({
    ...mapping,
    offsetX: (mapping.offsetX ?? 0) * offsetXMultiplier,
    offsetY: (mapping.offsetY ?? 0) * offsetYMultiplier
  });
}

function isRotated(mapping: ConfigurationMonitor['mapping']): boolean {
  return isQuarterTurnRotation(mapping.rotation);
}

function getRotationTransform(mapping: ConfigurationMonitor['mapping']): string {
  return `rotate(${mapping.rotation}deg)`;
}

function getPreviewViewportStyle(
  cardWidth: number,
  cardHeight: number,
  mapping: ConfigurationMonitor['mapping']
): Record<string, string> {
  if (!isRotated(mapping)) {
    return { inset: '0px' };
  }

  return {
    width: `${cardHeight}px`,
    height: `${cardWidth}px`,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)'
  };
}

function getPreviewFrameStyle(
  cardWidth: number,
  cardHeight: number,
  monitor: ReturnType<typeof getDisplayedMonitors>[number]
): Record<string, string> {
  const effectiveMonitorWidth = isRotated(monitor.mapping) ? monitor.size.height : monitor.size.width;
  const effectiveMonitorHeight = isRotated(monitor.mapping) ? monitor.size.width : monitor.size.height;

  return buildMediaFrameStyle({
    fit: getMonitorMediaFit(monitor.mapping),
    viewportWidth: cardWidth,
    viewportHeight: cardHeight,
    mediaWidth: effectiveMonitorWidth,
    mediaHeight: effectiveMonitorHeight
  });
}

const configuredMonitors = computed(() =>
  (props.configuration?.monitors ?? [])
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((monitor) => {
    const info = getMonitorInfo(monitor.deviceId);
    const size = getPhysicalSize(monitor.deviceId);
    return {
      ...monitor,
      info,
      size,
      title: info?.friendlyName || info?.systemName || monitor.deviceId
    };
  })
);

const stripMetrics = computed(() => {
  const widths = configuredMonitors.value.map((monitor) => monitor.size.width);
  const maxWidth = Math.max(...widths, 1);

  return configuredMonitors.value.map((monitor) => {
    const isReferenceMonitor = monitor.size.width === maxWidth;
    const rawHeight = isReferenceMonitor
      ? MONITOR_STRIP_REFERENCE_HEIGHT
      : MONITOR_STRIP_REFERENCE_HEIGHT * (monitor.size.height / maxWidth);
    const normalizedHeight = Math.min(Math.max(rawHeight / MONITOR_STRIP_REFERENCE_HEIGHT, 0), 1);
    const mappedHeight = mapMonitorStripHeight(normalizedHeight, props.monitorStripHeightGamma);
    const aspectRatio = monitor.size.height > 0 ? monitor.size.width / monitor.size.height : 1;
    const width = mappedHeight * aspectRatio;
    const height = mappedHeight;

    return {
      deviceId: monitor.deviceId,
      width,
      height
    };
  });
});

const stripHeight = computed(() =>
  Math.max(MONITOR_STRIP_REFERENCE_HEIGHT, ...stripMetrics.value.map((metric) => metric.height))
);

const stripMetricsById = computed<Record<string, { width: number; height: number }>>(() =>
  Object.fromEntries(
    stripMetrics.value.map((metric) => [metric.deviceId, { width: metric.width, height: metric.height }])
  )
);

const monitorCardStyles = computed<Record<string, string>>(() => {
  return Object.fromEntries(
    stripMetrics.value.map((metric) => [
      metric.deviceId,
      `width:${metric.width}px;height:${metric.height}px;`
    ])
  );
});

const addableMonitors = computed(() => {
  const configuredIds = new Set((props.configuration?.monitors ?? []).map((monitor) => monitor.deviceId));
  return props.availableMonitors.filter((monitor) => !configuredIds.has(monitor.deviceId));
});

const addCardStyle = computed(() => `width:168px;height:${stripHeight.value}px;`);

function stopDragAutoScroll(): void {
  dragScrollDirection = 0;
  if (dragScrollFrame) {
    cancelAnimationFrame(dragScrollFrame);
    dragScrollFrame = 0;
  }
}

function runDragAutoScroll(): void {
  const container = stripScrollRef.value;
  if (!container || dragScrollDirection === 0) {
    dragScrollFrame = 0;
    return;
  }

  container.scrollLeft += dragScrollDirection * 12;
  dragScrollFrame = requestAnimationFrame(runDragAutoScroll);
}

function startDragAutoScroll(direction: number): void {
  if (dragScrollDirection === direction && dragScrollFrame) {
    return;
  }

  dragScrollDirection = direction;
  if (!dragScrollFrame) {
    dragScrollFrame = requestAnimationFrame(runDragAutoScroll);
  }
}

function resetDragState(): void {
  pressedDeviceId.value = null;
  draggedDeviceId.value = null;
  dragOverDeviceId.value = null;
  dragBefore.value = false;
  dragOrderedIds.value = [];
  stopDragAutoScroll();
  document.body.style.userSelect = '';
}

function applyReorder(targetDeviceId: string, before: boolean): void {
  if (!draggedDeviceId.value || draggedDeviceId.value === targetDeviceId) {
    return;
  }

  const nextIds = dragOrderedIds.value.length > 0
    ? [...dragOrderedIds.value]
    : configuredMonitors.value.map((monitor) => monitor.deviceId);
  const draggedIndex = nextIds.indexOf(draggedDeviceId.value);
  const targetIndex = nextIds.indexOf(targetDeviceId);
  if (draggedIndex < 0 || targetIndex < 0) {
    return;
  }

  nextIds.splice(draggedIndex, 1);
  const insertIndex = before
    ? Math.max(0, targetIndex - (draggedIndex < targetIndex ? 1 : 0))
    : targetIndex + (draggedIndex < targetIndex ? 0 : 1);
  nextIds.splice(insertIndex, 0, draggedDeviceId.value);
  dragOrderedIds.value = nextIds;
}

function onMonitorPointerDown(event: PointerEvent, deviceId: string): void {
  if (event.button !== 0) {
    return;
  }

  pressedDeviceId.value = deviceId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragOrderedIds.value = configuredMonitors.value.map((monitor) => monitor.deviceId);
}

function onMonitorPointerMove(event: PointerEvent): void {
  if (!pressedDeviceId.value) {
    return;
  }

  if (!draggedDeviceId.value) {
    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;
    if (Math.hypot(deltaX, deltaY) < 6) {
      return;
    }

    draggedDeviceId.value = pressedDeviceId.value;
    document.body.style.userSelect = 'none';
  }

  const targetElement = document.elementFromPoint(event.clientX, event.clientY);
  const stackElement = targetElement instanceof Element
    ? targetElement.closest<HTMLElement>('.monitor-stack[data-monitor-device-id]')
    : null;
  const targetDeviceId = stackElement?.dataset.monitorDeviceId ?? null;

  if (!targetDeviceId || targetDeviceId === draggedDeviceId.value) {
    dragOverDeviceId.value = null;
    stopDragAutoScroll();
    return;
  }

  if (!stackElement) {
    return;
  }

  const rect = stackElement.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const before = offsetX < rect.width / 2;
  dragOverDeviceId.value = targetDeviceId;
  dragBefore.value = before;
  applyReorder(targetDeviceId, before);

  const scrollContainer = stripScrollRef.value;
  if (scrollContainer) {
    const scrollRect = scrollContainer.getBoundingClientRect();
    const edgeThreshold = 48;
    if (event.clientX <= scrollRect.left + edgeThreshold) {
      startDragAutoScroll(-1);
    } else if (event.clientX >= scrollRect.right - edgeThreshold) {
      startDragAutoScroll(1);
    } else {
      stopDragAutoScroll();
    }
  }
}

function onMonitorPointerUp(): void {
  if (!pressedDeviceId.value) {
    return;
  }

  if (draggedDeviceId.value && dragOrderedIds.value.length > 0) {
    emit('reorder-monitors', [...dragOrderedIds.value]);
    suppressMonitorClick.value = true;
  }
  resetDragState();
}

function onMonitorClick(deviceId: string): void {
  if (suppressMonitorClick.value) {
    suppressMonitorClick.value = false;
    return;
  }

  emit('select-monitor', deviceId);
}

function isDropPreviewBefore(deviceId: string): boolean {
  return dragOverDeviceId.value === deviceId && dragBefore.value;
}

function isDropPreviewAfter(deviceId: string): boolean {
  return dragOverDeviceId.value === deviceId && !dragBefore.value;
}

function getDisplayedMonitors() {
  if (dragOrderedIds.value.length === 0) {
    return configuredMonitors.value;
  }

  const byId = Object.fromEntries(configuredMonitors.value.map((monitor) => [monitor.deviceId, monitor]));
  return dragOrderedIds.value.map((deviceId) => byId[deviceId]).filter(Boolean);
}

function updateAddPickerPosition(): void {
  const trigger = addTriggerRef.value;
  if (!trigger) {
    return;
  }

  const rect = trigger.getBoundingClientRect();
  addPickerStyle.value = {
    left: `${Math.round(rect.left)}px`,
    top: `${Math.round(rect.top - 12)}px`,
    transform: 'translateY(-100%)'
  };
}

async function toggleAddPicker(): Promise<void> {
  if (addableMonitors.value.length === 0) {
    return;
  }

  addPickerOpen.value = !addPickerOpen.value;
  if (addPickerOpen.value) {
    await nextTick();
    updateAddPickerPosition();
  }
}

function closeAddPicker(): void {
  addPickerOpen.value = false;
}

function selectAddMonitor(deviceId: string): void {
  emit('add-monitor', deviceId);
  closeAddPicker();
}

function onPointerDown(event: PointerEvent): void {
  if (!addPickerOpen.value) {
    return;
  }

  const target = event.target;
  if (
    target instanceof Node &&
    !addTriggerRef.value?.contains(target) &&
    !addPickerElement.value?.contains(target)
  ) {
    closeAddPicker();
  }
}

function onViewportChanged(): void {
  if (addPickerOpen.value) {
    updateAddPickerPosition();
  }
}

function parseNumberInput(event: Event, fallback: number): number {
  const next = Number.parseFloat((event.target as HTMLInputElement).value);
  return Number.isFinite(next) ? next : fallback;
}

function shouldSyncAll(event?: MouseEvent): boolean {
  return Boolean(event?.shiftKey || shiftPressed.value);
}

function onWindowKeydown(event: KeyboardEvent): void {
  shiftPressed.value = event.shiftKey;
}

function onWindowKeyup(event: KeyboardEvent): void {
  shiftPressed.value = event.shiftKey;
}

function onWindowBlur(): void {
  shiftPressed.value = false;
}

function fitLabel(fit: MediaFit): string {
  if (fit === 'none') {
    return t('configuration.option.none');
  }
  return t(`configuration.option.${fit}`);
}

onMounted(() => {
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onMonitorPointerMove);
  window.addEventListener('pointerup', onMonitorPointerUp);
  window.addEventListener('resize', onViewportChanged);
  window.addEventListener('scroll', onViewportChanged, true);
  window.addEventListener('keydown', onWindowKeydown);
  window.addEventListener('keyup', onWindowKeyup);
  window.addEventListener('blur', onWindowBlur);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('pointermove', onMonitorPointerMove);
  window.removeEventListener('pointerup', onMonitorPointerUp);
  window.removeEventListener('resize', onViewportChanged);
  window.removeEventListener('scroll', onViewportChanged, true);
  window.removeEventListener('keydown', onWindowKeydown);
  window.removeEventListener('keyup', onWindowKeyup);
  window.removeEventListener('blur', onWindowBlur);
});
</script>

<template>
  <div v-if="props.configuration" class="detail-stack configuration-editor">
    <section class="detail-stack config-surface">
      <label class="detail-label config-label">{{ t('configuration.name') }}</label>
      <input class="detail-input" :value="props.configuration.name" :placeholder="t('configuration.namePlaceholder')"
        @input="emit('name-changed', ($event.target as HTMLInputElement).value)" />
      <label class="detail-label config-label">{{ t('configuration.description') }}</label>
      <textarea class="detail-textarea" :value="props.configuration.description"
        :placeholder="t('configuration.descriptionPlaceholder')"
        @input="emit('description-changed', ($event.target as HTMLTextAreaElement).value)" />
    </section>

    <section class="config-surface monitor-strip-panel">
      <div class="monitor-strip-header">
        <div>
          <p class="monitor-strip-title">{{ t('configuration.layoutTitle') }}</p>
          <p class="monitor-strip-copy">{{ t('configuration.layoutCopy') }}</p>
        </div>
      </div>

      <div class="monitor-strip-scroll">
        <div ref="stripScrollRef" class="monitor-strip-canvas" :style="{ minHeight: `${stripHeight}px` }">
          <div class="add-monitor-slot">
            <button ref="addTriggerRef" class="monitor-card add-card"
              :class="{ 'is-open': addPickerOpen, 'is-disabled': addableMonitors.length === 0 }" :style="addCardStyle"
              type="button" @click="toggleAddPicker">
              <span class="add-card-plus">+</span>
              <span class="add-card-label">
                {{ addableMonitors.length === 0 ? t('common.allMonitorsAdded') : t('common.addMonitor') }}
              </span>
            </button>
          </div>

          <div v-for="monitor in getDisplayedMonitors()" :key="monitor.deviceId" class="monitor-stack"
            :class="{
              dragging: draggedDeviceId === monitor.deviceId,
              'drop-preview-before': isDropPreviewBefore(monitor.deviceId),
              'drop-preview-after': isDropPreviewAfter(monitor.deviceId)
            }" :data-monitor-device-id="monitor.deviceId" @pointerdown="onMonitorPointerDown($event, monitor.deviceId)">
            <div class="monitor-stack-top">
              <div class="monitor-stack-top-left">
                <strong class="monitor-name">{{ monitor.title }}</strong>
                <span class="monitor-short">{{ monitor.shortName }}</span>
              </div>
              <span class="monitor-index">{{ monitor.order + 1 }}</span>
            </div>
            <div class="monitor-card monitor-visual"
              :class="{ selected: monitor.deviceId === props.selectedMonitorKey }"
              :style="monitorCardStyles[monitor.deviceId]" role="button" tabindex="0"
              @click="onMonitorClick(monitor.deviceId)"
              @keydown.enter="emit('select-monitor', monitor.deviceId)"
              @keydown.space.prevent="emit('select-monitor', monitor.deviceId)">
              <div class="monitor-preview-stage" aria-hidden="true">
                <div class="monitor-preview-viewport" :style="getPreviewViewportStyle(
                  stripMetricsById[monitor.deviceId]?.width ?? monitor.size.width,
                  stripMetricsById[monitor.deviceId]?.height ?? monitor.size.height,
                  monitor.mapping
                )
                  ">
                  <div class="monitor-preview-canvas" :style="{ transform: getRotationTransform(monitor.mapping) }">
                    <div class="monitor-preview-frame" :style="getPreviewFrameStyle(
                      stripMetricsById[monitor.deviceId]?.width ?? monitor.size.width,
                      stripMetricsById[monitor.deviceId]?.height ?? monitor.size.height,
                      monitor
                    )">
                      <div class="monitor-preview" :style="{
                        transform: getPreviewTransform(
                          monitor.mapping,
                          stripMetricsById[monitor.deviceId]?.width ?? monitor.size.width,
                          stripMetricsById[monitor.deviceId]?.height ?? monitor.size.height,
                          monitor.size.width,
                          monitor.size.height
                        )
                      }">
                        <span class="monitor-preview-word">{{ t('common.graph') }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="monitor-stack-bottom">
              <span class="monitor-size">{{ monitor.size.width }}×{{ monitor.size.height }}</span>
              <button class="monitor-remove" type="button" @pointerdown.stop
                @click.stop="emit('remove-monitor', monitor.deviceId)">
                {{ t('configuration.remove') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <teleport to="body">
        <div v-if="addPickerOpen" ref="addPickerElement" class="add-monitor-picker floating-overlay"
          :style="addPickerStyle">
          <button v-for="monitor in addableMonitors" :key="monitor.deviceId" class="add-monitor-option" type="button"
            @click="selectAddMonitor(monitor.deviceId)">
            <span class="add-monitor-option-title">{{ formatMonitorTitle(monitor) }}</span>
            <span class="add-monitor-option-meta">{{ monitor.size.width }}×{{ monitor.size.height }}</span>
          </button>
        </div>
      </teleport>
    </section>

    <section v-if="getSelectedMonitor()" class="detail-stack config-surface">
      <label class="detail-label config-label">{{ t('configuration.shortName') }}</label>
      <input class="detail-input" :value="getSelectedMonitor()!.shortName" :placeholder="t('configuration.shortNamePlaceholder')"
        @input="emit('short-name-changed', getSelectedMonitor()!.deviceId, ($event.target as HTMLInputElement).value)" />

      <div class="mapping-field">
        <label class="detail-label config-label">{{ t('configuration.rotation') }}</label>
        <div class="choice-row">
          <button v-for="rotation in rotations" :key="rotation" class="choice-button"
            :class="{ selected: getSelectedMonitor()!.mapping.rotation === rotation }" type="button"
            @click="emit('rotation-changed', getSelectedMonitor()!.deviceId, rotation, shouldSyncAll($event))">
            {{ rotation }}
          </button>
        </div>
      </div>

      <div class="mapping-field">
        <label class="detail-label config-label">{{ t('configuration.mirror') }}</label>
        <div class="choice-row">
          <button v-for="mirror in mirrors" :key="mirror" class="choice-button"
            :class="{ selected: getSelectedMonitor()!.mapping.mirror === mirror }" type="button"
            @click="emit('mirror-changed', getSelectedMonitor()!.deviceId, mirror, shouldSyncAll($event))">
            {{ t(`configuration.option.${mirror}`) }}
          </button>
        </div>
      </div>

      <div class="mapping-field">
        <label class="detail-label config-label">{{ t('configuration.fit') }}</label>
        <div class="choice-row">
          <button v-for="fit in fits" :key="fit" class="choice-button"
            :class="{ selected: (getSelectedMonitor()!.mapping.fit ?? 'contain') === fit }" type="button"
            @click="emit('fit-changed', getSelectedMonitor()!.deviceId, fit, shouldSyncAll($event))">
            {{ fitLabel(fit) }}
          </button>
        </div>
      </div>

      <div class="mapping-grid">
        <div class="mapping-field">
          <label class="detail-label config-label">{{ t('configuration.scale') }}</label>
          <input class="detail-input" type="number" min="0.1" max="8" step="0.05"
            :value="getSelectedMonitor()!.mapping.scale ?? 1" @input="
              emit(
                'scale-changed',
                getSelectedMonitor()!.deviceId,
                parseNumberInput($event, getSelectedMonitor()!.mapping.scale ?? 1),
                shiftPressed
              )
              " />
        </div>

        <div class="mapping-field">
          <label class="detail-label config-label">{{ t('configuration.offsetX') }}</label>
          <input class="detail-input" type="number" step="1" :value="getSelectedMonitor()!.mapping.offsetX ?? 0" @input="
            emit(
              'offset-x-changed',
              getSelectedMonitor()!.deviceId,
              parseNumberInput($event, getSelectedMonitor()!.mapping.offsetX ?? 0),
              shiftPressed
            )
            " />
        </div>

        <div class="mapping-field">
          <label class="detail-label config-label">{{ t('configuration.offsetY') }}</label>
          <input class="detail-input" type="number" step="1" :value="getSelectedMonitor()!.mapping.offsetY ?? 0" @input="
            emit(
              'offset-y-changed',
              getSelectedMonitor()!.deviceId,
              parseNumberInput($event, getSelectedMonitor()!.mapping.offsetY ?? 0),
              shiftPressed
            )
            " />
        </div>
      </div>
    </section>
  </div>
  <div v-else class="empty-state">{{ t('configuration.empty') }}</div>
</template>

<style scoped>
.configuration-editor {
  gap: 14px;
}

.config-surface {
  display: grid;
  gap: 10px;
}

.config-label {
  text-transform: none;
  letter-spacing: 0.02em;
  font-size: 11px;
}

.detail-input,
.detail-textarea,
.choice-button {
  font-size: 13px;
}

.monitor-strip-panel {
  display: grid;
  gap: 12px;
  overflow: visible;
}

.monitor-strip-header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 12px;
}

.monitor-strip-title {
  margin: 0;
  font-size: 13px;
  font-weight: 400;
  color: rgba(244, 244, 245, 0.96);
}

.monitor-strip-copy {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(176, 178, 184, 0.74);
}

.monitor-strip-scroll {
  overflow-x: auto;
  overflow-y: visible;
  padding-bottom: 4px;
}

.monitor-strip-canvas {
  position: relative;
  display: flex;
  align-items: end;
  gap: 16px;
  min-width: fit-content;
}

.add-monitor-slot {
  position: relative;
  flex: 0 0 auto;
  align-self: center;
}

.monitor-stack {
  display: grid;
  grid-template-rows: auto auto auto;
  align-self: center;
  gap: 8px;
  flex: 0 0 auto;
  position: relative;
  cursor: grab;
}

.monitor-stack.dragging {
  opacity: 0.42;
  cursor: grabbing;
}

.monitor-stack.drop-preview-before::before,
.monitor-stack.drop-preview-after::after {
  content: '';
  position: absolute;
  top: 34px;
  bottom: 28px;
  width: 2px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
}

.monitor-stack.drop-preview-before::before {
  left: -8px;
}

.monitor-stack.drop-preview-after::after {
  right: -8px;
}

.monitor-stack-top,
.monitor-stack-bottom {
  width: 100%;
  display: flex;
  align-items: center;
}

.monitor-stack-top {
  justify-content: space-between;
  gap: 10px;
  min-height: 28px;
}

.monitor-stack-bottom {
  justify-content: space-between;
  gap: 10px;
  min-height: 22px;
}

.monitor-stack-top-left {
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: 2px;
}

.monitor-card {
  position: relative;
  flex: 0 0 auto;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.025);
  color: rgba(244, 244, 245, 0.96);
  box-shadow: none;
  transition:
    border-color 140ms ease,
    background-color 140ms ease;
}

.monitor-visual {
  display: block;
  cursor: inherit;
}

.monitor-visual:hover,
.monitor-visual:focus-visible,
.add-card:hover,
.add-card:focus-visible {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.055);
}

.monitor-visual:focus-visible,
.add-card:focus-visible {
  outline: none;
}

.monitor-visual.selected {
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.08);
}

.monitor-preview-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 16px;
}

.monitor-preview-stage.selected {
  box-shadow: inset 0 0 0 2px rgba(92, 155, 255, 0.92);
}

.monitor-preview-viewport {
  position: absolute;
  inset: 0;
}

.monitor-preview-canvas {
  position: absolute;
  inset: 0;
  transform-origin: center;
}

.monitor-preview {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
    repeating-linear-gradient(0deg,
      transparent 0,
      transparent 17px,
      rgba(255, 255, 255, 0.04) 17px,
      rgba(255, 255, 255, 0.04) 18px),
    repeating-linear-gradient(90deg,
      transparent 0,
      transparent 17px,
      rgba(255, 255, 255, 0.04) 17px,
      rgba(255, 255, 255, 0.04) 18px);
  transform-origin: center;
  pointer-events: none;
}

.monitor-preview-frame {
  position: absolute;
  left: 50%;
  top: 50%;
  overflow: hidden;
  transform: translate(-50%, -50%);
  transform-origin: center;
}

.monitor-preview-word {
  font-size: clamp(20px, 14%, 44px);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.16);
}

.monitor-name {
  font-size: 12px;
  line-height: 1.25;
}

.monitor-short,
.monitor-size,
.monitor-index {
  font-size: 10px;
  color: rgba(194, 196, 201, 0.78);
}

.monitor-remove {
  border: 0;
  background: transparent;
  color: rgba(255, 154, 154, 0.94);
  font-size: 10px;
  font-weight: 400;
  padding: 0;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
}

.monitor-remove:hover,
.monitor-remove:focus-visible {
  color: rgba(255, 194, 194, 1);
  outline: none;
}

.monitor-stack:hover .monitor-remove,
.monitor-stack:focus-within .monitor-remove,
.monitor-visual.selected+.monitor-stack-bottom .monitor-remove {
  opacity: 1;
  pointer-events: auto;
}

.mapping-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.mapping-field {
  display: grid;
  gap: 6px;
}

.add-card {
  display: grid;
  place-items: center;
  gap: 8px;
  cursor: pointer;
}

.add-card.is-open {
  border-color: rgba(255, 255, 255, 0.22);
}

.add-card.is-disabled {
  opacity: 0.6;
  cursor: default;
}

.add-card-plus {
  font-size: 42px;
  line-height: 1;
  font-weight: 300;
}

.add-card-label {
  font-size: 11px;
  letter-spacing: 0.02em;
  color: rgba(205, 207, 212, 0.82);
}

.add-monitor-picker {
  position: fixed;
  z-index: 20;
  min-width: 260px;
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 14px;
}

.add-monitor-option {
  display: grid;
  gap: 3px;
  text-align: left;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(244, 244, 245, 0.96);
  cursor: pointer;
}

.add-monitor-option:hover,
.add-monitor-option:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  outline: none;
}

.add-monitor-option-title {
  font-size: 12px;
  line-height: 1.3;
}

.add-monitor-option-meta {
  font-size: 10px;
  color: rgba(181, 183, 188, 0.72);
}

@media (max-width: 760px) {
  .mapping-grid {
    grid-template-columns: 1fr;
  }

  .monitor-strip-copy {
    max-width: 40ch;
  }

  .add-monitor-picker {
    min-width: min(280px, calc(100vw - 72px));
  }
}
</style>
