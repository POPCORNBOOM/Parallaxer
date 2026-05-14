<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppSelect from '../shell/AppSelect.vue';
import {
  MAX_MONITOR_STRIP_HEIGHT_GAMMA,
  MIN_MONITOR_STRIP_HEIGHT_GAMMA,
  MONITOR_STRIP_HEIGHT_GAMMA_STEP,
  MONITOR_STRIP_REFERENCE_HEIGHT,
  formatAppRootPath,
  formatSettingsStorageHint,
  mapMonitorStripHeight,
  normalizeMonitorStripHeightGamma
} from '../../lib/ui';
import type { ThemeMode } from '../../types';
import { getLocale, setLocale, SUPPORTED_LOCALES, type AppLocale } from '../../i18n';

const props = defineProps<{
  monitorStripHeightGamma: number;
  themeMode: ThemeMode;
}>();

const emit = defineEmits<{
  'monitor-strip-gamma-changed': [value: number];
  'theme-mode-changed': [value: ThemeMode];
}>();

const { t } = useI18n({ useScope: 'global' });

const localeOptions = computed(() => [
  { value: 'en' as const, label: t('common.english') },
  { value: 'zh-CN' as const, label: t('common.chineseSimplified') }
]);
const themeOptions = computed(() => [
  { value: 'system' as const, label: t('settings.themeSystem') },
  { value: 'dark' as const, label: t('settings.themeDark') },
  { value: 'light' as const, label: t('settings.themeLight') }
]);

const currentLocale = computed(() => getLocale());
const currentGamma = computed(() => normalizeMonitorStripHeightGamma(props.monitorStripHeightGamma));
const gammaValueText = computed(() => currentGamma.value.toFixed(2));
const gammaTrackRef = ref<HTMLElement | null>(null);
const gammaDragging = ref(false);

const gammaProgress = computed(() => {
  const range = MAX_MONITOR_STRIP_HEIGHT_GAMMA - MIN_MONITOR_STRIP_HEIGHT_GAMMA;
  if (range <= 0) {
    return 0;
  }
  return (currentGamma.value - MIN_MONITOR_STRIP_HEIGHT_GAMMA) / range;
});

const previewItems = computed(() => {
  const previewMonitors = [
    { id: '3840x2160', width: 3840, height: 2160 },
    { id: '2560x1440', width: 2560, height: 1440 },
    { id: '1920x1080', width: 1920, height: 1080 },
    { id: '720x720', width: 720, height: 720 }
  ] as const;
  const previewScale = 0.56;
  const maxWidth = Math.max(...previewMonitors.map((monitor) => monitor.width), 1);

  return previewMonitors.map((monitor) => {
    const rawHeight =
      monitor.width === maxWidth
        ? MONITOR_STRIP_REFERENCE_HEIGHT
        : MONITOR_STRIP_REFERENCE_HEIGHT * (monitor.height / maxWidth);
    const normalizedHeight = Math.min(Math.max(rawHeight / MONITOR_STRIP_REFERENCE_HEIGHT, 0), 1);
    const mappedHeight = mapMonitorStripHeight(normalizedHeight, currentGamma.value) * previewScale;
    const mappedWidth = mappedHeight * (monitor.width / Math.max(monitor.height, 1));

    return {
      id: monitor.id,
      label: `${monitor.width}x${monitor.height}`,
      width: mappedWidth,
      height: mappedHeight
    };
  });
});

function onLocaleChanged(value: string): void {
  if ((SUPPORTED_LOCALES as readonly string[]).includes(value)) {
    setLocale(value as AppLocale);
  }
}

function onThemeChanged(value: string): void {
  if (value === 'dark' || value === 'light' || value === 'system') {
    emit('theme-mode-changed', value);
  }
}

function roundGammaToStep(value: number): number {
  const stepCount = Math.round((value - MIN_MONITOR_STRIP_HEIGHT_GAMMA) / MONITOR_STRIP_HEIGHT_GAMMA_STEP);
  return normalizeMonitorStripHeightGamma(
    MIN_MONITOR_STRIP_HEIGHT_GAMMA + stepCount * MONITOR_STRIP_HEIGHT_GAMMA_STEP
  );
}

function updateGammaByClientX(clientX: number): void {
  const track = gammaTrackRef.value;
  if (!track) {
    return;
  }

  const rect = track.getBoundingClientRect();
  if (rect.width <= 0) {
    return;
  }

  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const rawValue =
    MIN_MONITOR_STRIP_HEIGHT_GAMMA +
    ratio * (MAX_MONITOR_STRIP_HEIGHT_GAMMA - MIN_MONITOR_STRIP_HEIGHT_GAMMA);
  emit('monitor-strip-gamma-changed', roundGammaToStep(rawValue));
}

function onGammaTrackPointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  gammaDragging.value = true;
  document.body.style.userSelect = 'none';
  gammaTrackRef.value?.setPointerCapture?.(event.pointerId);
  updateGammaByClientX(event.clientX);

  const onPointerMove = (moveEvent: PointerEvent): void => {
    if (!gammaDragging.value) {
      return;
    }
    moveEvent.preventDefault();
    updateGammaByClientX(moveEvent.clientX);
  };

  const onPointerUp = (upEvent: PointerEvent): void => {
    upEvent.preventDefault();
    gammaDragging.value = false;
    document.body.style.userSelect = '';
    if (gammaTrackRef.value?.hasPointerCapture?.(upEvent.pointerId)) {
      gammaTrackRef.value.releasePointerCapture(upEvent.pointerId);
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function onGammaKeydown(event: KeyboardEvent): void {
  const current = currentGamma.value;
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      event.preventDefault();
      emit('monitor-strip-gamma-changed', roundGammaToStep(current - MONITOR_STRIP_HEIGHT_GAMMA_STEP));
      return;
    case 'ArrowRight':
    case 'ArrowUp':
      event.preventDefault();
      emit('monitor-strip-gamma-changed', roundGammaToStep(current + MONITOR_STRIP_HEIGHT_GAMMA_STEP));
      return;
    case 'Home':
      event.preventDefault();
      emit('monitor-strip-gamma-changed', MIN_MONITOR_STRIP_HEIGHT_GAMMA);
      return;
    case 'End':
      event.preventDefault();
      emit('monitor-strip-gamma-changed', MAX_MONITOR_STRIP_HEIGHT_GAMMA);
      return;
    default:
      return;
  }
}

onBeforeUnmount(() => {
  document.body.style.userSelect = '';
});
</script>

<template>
  <div class="detail-stack settings-view">
    <section class="detail-stack detail-section">
      <label class="detail-label">{{ t('common.language') }}</label>
      <AppSelect :model-value="currentLocale" :options="localeOptions" @update:model-value="onLocaleChanged" />
    </section>

    <section class="detail-stack detail-section">
      <label class="detail-label">{{ t('settings.themeMode') }}</label>
      <AppSelect :model-value="props.themeMode" :options="themeOptions" @update:model-value="onThemeChanged" />
    </section>

    <section class="detail-stack detail-section">
      <div class="detail-heading-row">
        <div class="detail-label-with-hint">
          <label class="detail-label" for="monitor-strip-gamma">{{ t('settings.monitorStripGamma') }}</label>
          <button class="hint-anchor" type="button" :aria-label="t('settings.monitorStripGammaHint')"
            :data-tooltip="t('settings.monitorStripGammaHint')">
            <i class="mdi mdi-help-circle-outline hint-icon" aria-hidden="true" />
          </button>
        </div>
        <strong class="gamma-value">{{ gammaValueText }}</strong>
      </div>
      <div id="monitor-strip-gamma" ref="gammaTrackRef" class="gamma-slider" :class="{ dragging: gammaDragging }"
        role="slider" tabindex="0" :aria-label="t('settings.monitorStripGamma')"
        :aria-valuemin="MIN_MONITOR_STRIP_HEIGHT_GAMMA" :aria-valuemax="MAX_MONITOR_STRIP_HEIGHT_GAMMA"
        :aria-valuenow="currentGamma" :aria-valuetext="gammaValueText"
        @pointerdown="onGammaTrackPointerDown" @keydown="onGammaKeydown">
        <span class="gamma-slider-fill" :style="{ width: `${gammaProgress * 100}%` }" />
        <span class="gamma-slider-thumb" :style="{ left: `${gammaProgress * 100}%` }" />
      </div>
      <div class="gamma-preview-strip-shell">
        <div class="gamma-preview-strip">
          <div v-for="item in previewItems" :key="item.id" class="gamma-monitor-stack">
            <div class="gamma-monitor-card" :style="{ width: `${item.width}px`, height: `${item.height}px` }">
              <div class="gamma-monitor-preview-stage">
                <div class="gamma-monitor-preview-grid" />
                <span class="gamma-monitor-preview-word">{{ item.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="detail-stack detail-section">
      <div class="detail-label-with-hint">
        <label class="detail-label">{{ t('settings.appRoot') }}</label>
        <button class="hint-anchor" type="button" :aria-label="formatSettingsStorageHint()"
          :data-tooltip="formatSettingsStorageHint()">
          <i class="mdi mdi-help-circle-outline hint-icon" aria-hidden="true" />
        </button>
      </div>
      <strong class="app-root-path">{{ formatAppRootPath() }}</strong>
    </section>
  </div>
</template>

<style scoped>
.settings-view {
  gap: 14px;
}

.detail-section {
  gap: 8px;
}

.detail-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.detail-label-with-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hint-anchor {
  position: relative;
  width: 16px;
  height: 16px;
  display: inline-grid;
  place-items: center;
  border: 0;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: help;
  transition: color 120ms ease;
}

.hint-anchor:hover,
.hint-anchor:focus-visible {
  color: var(--color-text-primary);
}

.hint-anchor:focus-visible {
  outline: none;
}

.hint-icon {
  font-size: 14px;
  line-height: 1;
}

.gamma-value {
  font-size: 13px;
  font-weight: var(--font-weight-ui-value);
}

.gamma-slider {
  position: relative;
  width: 100%;
  height: 20px;
  border-radius: 999px;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.gamma-slider::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 5px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--color-surface-muted);
  box-shadow: inset 0 0 0 1px var(--color-divider);
}

.gamma-slider:focus-visible {
  outline: none;
}

.gamma-slider:focus-visible::before {
  box-shadow:
    inset 0 0 0 1px var(--color-divider-strong),
    0 0 0 2px rgba(255, 255, 255, 0.05);
}

.gamma-slider-fill {
  position: absolute;
  left: 0;
  top: 50%;
  height: 5px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.24));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  pointer-events: none;
}

.gamma-slider-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px solid var(--color-divider-strong);
  background: var(--color-text-primary);
  box-shadow:
    0 1px 4px rgba(0, 0, 0, 0.35),
    0 0 0 2px rgba(255, 255, 255, 0.05);
  pointer-events: none;
  transition:
    transform 120ms ease,
    box-shadow 120ms ease;
}

.gamma-slider.dragging .gamma-slider-thumb {
  transform: translate(-50%, -50%) scale(1.06);
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.38),
    0 0 0 3px rgba(255, 255, 255, 0.08);
}

.gamma-preview-strip-shell {
  display: flex;
  justify-content: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
}

.gamma-preview-strip {
  display: flex;
  align-items: end;
  gap: 14px;
  width: max-content;
  margin-inline: auto;
}

.gamma-monitor-stack {
  flex: 0 0 auto;
}

.gamma-monitor-card {
  position: relative;
  border-radius: 16px;
  border: 1px solid var(--color-monitor-card-border);
  background: var(--color-monitor-card-bg);
  overflow: hidden;
}

.gamma-monitor-preview-stage {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.gamma-monitor-preview-grid {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, var(--color-monitor-card-bg-hover), var(--color-monitor-card-bg)),
    repeating-linear-gradient(0deg,
      transparent 0,
      transparent 17px,
      var(--color-monitor-grid-line) 17px,
      var(--color-monitor-grid-line) 18px),
    repeating-linear-gradient(90deg,
      transparent 0,
      transparent 17px,
      var(--color-monitor-grid-line) 17px,
      var(--color-monitor-grid-line) 18px);
}

.gamma-monitor-preview-word {
  position: relative;
  z-index: 1;
  font-size: clamp(9px, 1.6vw, 14px);
  font-weight: var(--font-weight-ui-section);
  letter-spacing: 0.04em;
  color: var(--color-monitor-word);
}

.settings-hint {
  font-size: 13px;
  line-height: 1.4;
}

.app-root-path {
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-ui-value);
}

@media (max-width: 760px) {
  .gamma-preview-strip {
    gap: 10px;
  }
}
</style>
