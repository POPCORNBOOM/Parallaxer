<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppSelect from '../shell/AppSelect.vue';
import type { ConfigurationRecord, MonitorRecord, PlaylistRecord } from '../../types';
import {
  formatPlaylistEntryMessage,
  mapMonitorStripHeight,
  MONITOR_STRIP_REFERENCE_HEIGHT
} from '../../lib/ui';
import { sortConfigurationMonitors, DEFAULT_MONITOR_STRIP_HEIGHT_GAMMA } from '../../lib/domain';

const props = defineProps<{
  playlist: PlaylistRecord | null;
  configurations: ConfigurationRecord[];
  availableMonitors: MonitorRecord[];
  monitorStripHeightGamma: number;
}>();

const emit = defineEmits<{
  'name-changed': [value: string];
  'source-folder-picked': [];
  'configuration-changed': [value: string];
  'visibility-changed': [fileName: string, value: boolean];
  'create-configuration': [];
}>();

const { t } = useI18n({ useScope: 'global' });
const mappingGuideOpen = ref(false);
const mappingGuideSlide = ref(0);
const GUIDE_SOURCE_FOLDER_NAME = 'Source Folder Name';
const GUIDE_SHARED_FILE_NAME = 'Banana.mp4';

const configurationOptions = computed(() => [
  { value: '', label: t('playlist.selectConfiguration') },
  ...props.configurations.map((configuration) => ({
    value: configuration.id,
    label: configuration.name || t('common.untitledConfiguration')
  }))
]);

interface GuideDisplayItem {
  key: string;
  label: string;
  shortName: string;
  pathSegment: string;
  toneClass: string;
  shapeClass: string;
  delay: string;
  width: number;
  height: number;
}

function getGuideFolderName(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/g, '').trim();
  if (!normalized) {
    return GUIDE_SOURCE_FOLDER_NAME;
  }

  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? GUIDE_SOURCE_FOLDER_NAME;
}

function formatGuideLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (token) => token.toUpperCase());
}

function getGuideShapeClass(shortName: string, fallbackIndex: number): string {
  const normalized = shortName.trim().toLowerCase();
  if (!normalized || normalized === '...') {
    return `shape-${(fallbackIndex % 3) + 1}`;
  }

  let hash = 0;
  for (const character of normalized) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return `shape-${(hash % 3) + 1}`;
}

const guideDisplays = computed<GuideDisplayItem[]>(() => {
  const activeConfiguration =
    props.configurations.find((configuration) => configuration.id === props.playlist?.configurationId) ?? null;
  const monitorByDeviceId = new Map(props.availableMonitors.map((monitor) => [monitor.deviceId, monitor]));
  const sortedMonitors = activeConfiguration
    ? sortConfigurationMonitors(activeConfiguration.monitors)
        .filter((monitor) => monitor.shortName.trim())
        .map((monitor) => ({
          ...monitor,
          size: monitorByDeviceId.get(monitor.deviceId)?.size ?? { width: 1920, height: 1080 }
        }))
    : [];

  let rawItems: Array<{ shortName: string; width: number; height: number }>;
  if (sortedMonitors.length === 0) {
    rawItems = [
      { shortName: 'left', width: 1920, height: 1080 },
      { shortName: 'right', width: 1920, height: 1080 }
    ];
  } else if (sortedMonitors.length === 1) {
    rawItems = [
      {
        shortName: sortedMonitors[0].shortName,
        width: sortedMonitors[0].size.width,
        height: sortedMonitors[0].size.height
      },
      { shortName: '另一块屏幕', width: 1920, height: 1080 }
    ];
  } else if (sortedMonitors.length === 2) {
    rawItems = sortedMonitors.slice(0, 2).map((monitor) => ({
      shortName: monitor.shortName,
      width: monitor.size.width,
      height: monitor.size.height
    }));
  } else if (sortedMonitors.length === 3) {
    rawItems = sortedMonitors.slice(0, 3).map((monitor) => ({
      shortName: monitor.shortName,
      width: monitor.size.width,
      height: monitor.size.height
    }));
  } else {
    rawItems = [
      {
        shortName: sortedMonitors[0].shortName,
        width: sortedMonitors[0].size.width,
        height: sortedMonitors[0].size.height
      },
      {
        shortName: sortedMonitors[1].shortName,
        width: sortedMonitors[1].size.width,
        height: sortedMonitors[1].size.height
      },
      { shortName: '...', width: 1600, height: 900 }
    ];
  }

  return rawItems.map((item, index) => ({
    key: `${item.shortName}-${index}`,
    label: item.shortName === '...' ? '...' : formatGuideLabel(item.shortName),
    shortName: item.shortName,
    pathSegment: item.shortName === '...' ? '...' : item.shortName,
    toneClass: `tone-${(index % 3) + 1}`,
    shapeClass: getGuideShapeClass(item.shortName, index),
    delay: `${index * 160}ms`,
    width: item.width,
    height: item.height
  }));
});

const activeGuideConfiguration = computed(
  () => props.configurations.find((configuration) => configuration.id === props.playlist?.configurationId) ?? null
);

const guideConfigurationName = computed(
  () => activeGuideConfiguration.value?.name || t('playlist.selectConfiguration')
);

const guideConfigurationMonitors = computed(() => guideDisplays.value.slice(0, 3));

const guideSourceFolderName = computed(() => getGuideFolderName(props.playlist?.sourceFolder ?? ''));

const sharedGuideFileName = computed(() => {
  const names = guideDisplays.value
    .map((item) => item.pathSegment)
    .filter((name) => name && name !== '...')
    .map((name) => formatGuideLabel(name).replace(/\s+/g, '-'));

  const fileStem = names.length > 0 ? names.join('-') : 'Left-Right';
  return `${fileStem}.mp4`;
});

const folderGuidePathRests = computed(() =>
  guideDisplays.value.map(
    (item) => `/${item.pathSegment}/${GUIDE_SHARED_FILE_NAME}`
  )
);

const folderGuidePlaybackLines = computed(() =>
  guideDisplays.value.map((item) => ({
    path: `${guideSourceFolderName.value}${folderGuidePathRests.value[guideDisplays.value.indexOf(item)]}`,
    monitor: item.shortName
  }))
);

const guideStripMetrics = computed(() => {
  const maxWidth = Math.max(...guideDisplays.value.map((item) => item.width), 1);

  return guideDisplays.value.map((item) => {
    const rawHeight =
      item.width === maxWidth
        ? MONITOR_STRIP_REFERENCE_HEIGHT
        : MONITOR_STRIP_REFERENCE_HEIGHT * (item.height / maxWidth);
    const normalizedHeight = Math.min(Math.max(rawHeight / MONITOR_STRIP_REFERENCE_HEIGHT, 0), 1);
    const mappedHeight = mapMonitorStripHeight(normalizedHeight, props.monitorStripHeightGamma) * 0.42;
    const aspectRatio = item.height > 0 ? item.width / item.height : 1;
    return {
      key: item.key,
      width: mappedHeight * aspectRatio,
      height: mappedHeight
    };
  });
});

const guideStripMetricsByKey = computed<Record<string, { width: number; height: number }>>(() =>
  Object.fromEntries(
    guideStripMetrics.value.map((metric) => [metric.key, { width: metric.width, height: metric.height }])
  )
);

const guideMonitorRowHeight = computed(() =>
  Math.max(...guideStripMetrics.value.map((metric) => metric.height), 0) + 34
);

function getGuideMonitorStyle(item: GuideDisplayItem): Record<string, string> {
  const metric = guideStripMetricsByKey.value[item.key];
  return {
    width: `${metric?.width ?? 72}px`,
    height: `${metric?.height ?? 72}px`
  };
}
</script>

<template>
  <div v-if="props.playlist" class="detail-stack playlist-editor">
    <section class="detail-stack detail-section">
      <label class="detail-label">{{ t('playlist.name') }}</label>
      <input
        class="detail-input"
        :value="props.playlist.name"
        :placeholder="t('playlist.namePlaceholder')"
        @input="emit('name-changed', ($event.target as HTMLInputElement).value)"
      />

      <label class="detail-label">{{ t('playlist.sourceFolder') }}</label>
      <div class="inline-field">
        <input class="detail-input" :value="props.playlist.sourceFolder" readonly />
        <button class="chip-button" type="button" @click="emit('source-folder-picked')">{{ t('common.browse') }}</button>
      </div>

      <label class="detail-label">{{ t('playlist.configuration') }}</label>
      <AppSelect
        :model-value="props.playlist.configurationId"
        :options="configurationOptions"
        :placeholder="t('playlist.selectConfiguration')"
        @update:model-value="emit('configuration-changed', $event)"
      />
    </section>

    <section class="detail-section">
      <table class="playlist-table">
        <thead>
          <tr>
            <th>{{ t('common.file') }}</th>
            <th>{{ t('common.info') }}</th>
            <th>{{ t('common.visible') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in props.playlist.entries" :key="entry.fileName">
            <td>{{ entry.fileName }}</td>
            <td>{{ formatPlaylistEntryMessage(entry) }}</td>
            <td>
              <input
                type="checkbox"
                :checked="entry.visibility"
                @change="emit('visibility-changed', entry.fileName, ($event.target as HTMLInputElement).checked)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="playlist-guide">
      <button
        class="playlist-guide-toggle"
        type="button"
        :aria-expanded="mappingGuideOpen"
        @click="mappingGuideOpen = !mappingGuideOpen"
      >
        <span>{{ t('playlist.mappingGuideTitle') }}</span>
        <i class="mdi" :class="mappingGuideOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
      </button>

      <div v-if="mappingGuideOpen" class="playlist-guide-body">
        <div class="playlist-guide-carousel">
          <div class="playlist-guide-track" :style="{ transform: `translateX(-${mappingGuideSlide * 100}%)` }">
            <article class="playlist-guide-method">
              <div class="playlist-guide-copy">
                <h3 class="playlist-guide-heading">{{ t('playlist.mappingGuideConfigTitle') }}</h3>
                <p class="playlist-guide-text">{{ t('playlist.mappingGuideConfigBody') }}</p>
                <div class="guide-config-cta">
                  <span class="guide-config-cta-text">{{ t('playlist.mappingGuideNoConfiguration') }}</span>
                  <button class="chip-button" type="button" @click="emit('create-configuration')">
                    {{ t('playlist.mappingGuideCreateConfiguration') }}
                  </button>
                </div>
              </div>

              <div class="playlist-guide-demo playlist-guide-demo-config" aria-hidden="true">
                <div class="guide-config-select">
                  <label class="guide-config-select-label">{{ t('playlist.configuration') }}</label>
                  <AppSelect
                    :model-value="props.playlist.configurationId"
                    :options="configurationOptions"
                    :placeholder="t('playlist.selectConfiguration')"
                    @update:model-value="emit('configuration-changed', $event)"
                  />
                </div>
                <div class="guide-arrow-row">
                  <span class="guide-arrow" />
                </div>
                <div class="guide-config-monitor-row" :style="{ minHeight: `${guideMonitorRowHeight}px` }">
                  <div
                    v-for="item in guideConfigurationMonitors"
                    :key="`monitor-config-${item.key}`"
                    class="guide-monitor-column"
                  >
                    <span class="guide-monitor-caption">{{ item.label }}</span>
                    <span class="guide-monitor-surface" :class="item.toneClass" :style="getGuideMonitorStyle(item)">
                      <span class="guide-shape-stack guide-shape-stack-monitor" :class="item.shapeClass" aria-hidden="true">
                        <span class="guide-shape guide-shape-back" />
                        <span class="guide-shape guide-shape-front" />
                      </span>
                      <span class="guide-monitor-progress" :style="{ animationDelay: item.delay }" />
                    </span>
                    <span class="guide-monitor-shortname">{{ item.shortName }}</span>
                  </div>
                </div>
              </div>
            </article>

            <article class="playlist-guide-method">
              <div class="playlist-guide-copy">
                <h3 class="playlist-guide-heading">{{ t('playlist.mappingGuideSplitTitle') }}</h3>
                <p class="playlist-guide-text">{{ t('playlist.mappingGuideSplitBody') }}</p>
              </div>

              <div class="playlist-guide-demo playlist-guide-demo-split" aria-hidden="true">
                <div class="guide-source-frame">
                  <div class="guide-source-strip">
                    <span
                      v-for="item in guideDisplays"
                      :key="`shared-${item.key}`"
                      class="guide-source-segment"
                      :class="item.toneClass"
                    >
                    <span class="guide-shape-stack" :class="item.shapeClass" aria-hidden="true">
                      <span class="guide-shape guide-shape-back" />
                      <span class="guide-shape guide-shape-front" />
                    </span>
                    </span>
                  </div>
                </div>
                <p class="guide-path"><strong class="guide-path-folder">{{ guideSourceFolderName }}</strong><span class="guide-path-rest">/{{ sharedGuideFileName }}</span></p>
                <div class="guide-arrow-row">
                  <span class="guide-arrow" />
                </div>
                <div class="guide-monitor-row" :style="{ minHeight: `${guideMonitorRowHeight}px` }">
                  <div
                    v-for="item in guideDisplays"
                    :key="`monitor-split-${item.key}`"
                    class="guide-monitor-column"
                  >
                    <span class="guide-monitor-caption">{{ item.label }}</span>
                    <span class="guide-monitor-surface" :class="item.toneClass" :style="getGuideMonitorStyle(item)">
                      <span class="guide-shape-stack guide-shape-stack-monitor" :class="item.shapeClass" aria-hidden="true">
                        <span class="guide-shape guide-shape-back" />
                        <span class="guide-shape guide-shape-front" />
                      </span>
                      <span class="guide-monitor-progress" :style="{ animationDelay: item.delay }" />
                    </span>
                    <span class="guide-monitor-shortname">{{ item.shortName }}</span>
                  </div>
                </div>
              </div>
            </article>

            <article class="playlist-guide-method">
              <div class="playlist-guide-copy">
                <h3 class="playlist-guide-heading">{{ t('playlist.mappingGuideOverrideTitle') }}</h3>
                <p class="playlist-guide-text">{{ t('playlist.mappingGuideOverrideBody') }}</p>
              </div>

              <div class="playlist-guide-demo playlist-guide-demo-folders" aria-hidden="true">
                <div class="guide-folder-grid" :style="{ gridTemplateColumns: `repeat(${Math.max(guideDisplays.length, 1)}, minmax(0, 1fr))` }">
                  <div v-for="item in guideDisplays" :key="`folder-${item.key}`" class="guide-folder-grid-cell guide-folder-grid-cell-top">
                    <div class="guide-folder-scene">
                      <div class="guide-folder-video-card" :class="item.toneClass">
                        <span class="guide-shape-stack guide-shape-stack-video" :class="item.shapeClass" aria-hidden="true">
                          <span class="guide-shape guide-shape-back" />
                          <span class="guide-shape guide-shape-front" />
                        </span>
                        <span class="guide-folder-video-bar" :style="{ animationDelay: item.delay }" />
                      </div>
                      <div class="guide-folder-card">
                        <svg class="guide-folder-icon" viewBox="0 0 128 108" aria-hidden="true">
                          <path
                            d="M14 42c0-10.4 8.4-18.8 18.8-18.8h22.4c4.8 0 9.4 1.9 12.8 5.3l5.2 5.1h27.1c8.4 0 15.2 6.8 15.2 15.2v24.7c0 10.2-8.3 18.5-18.5 18.5H32.5C22.3 92 14 83.7 14 73.5z"
                            fill="currentColor"
                          />
                        </svg>
                        <span class="guide-folder-label">{{ item.pathSegment }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="guide-folder-arrow-row" :style="{ gridColumn: '1 / -1' }">
                    <span
                      v-for="item in guideDisplays"
                      :key="`folder-arrow-${item.key}`"
                      class="guide-folder-arrow"
                    />
                  </div>
                  <div
                    v-for="(item, index) in guideDisplays"
                    :key="`monitor-folder-${item.key}`"
                    class="guide-folder-grid-cell guide-folder-grid-cell-bottom"
                    :style="{ minHeight: `${guideMonitorRowHeight}px` }"
                  >
                    <div class="guide-monitor-column">
                      <span class="guide-monitor-surface" :class="item.toneClass" :style="getGuideMonitorStyle(item)">
                        <span class="guide-shape-stack guide-shape-stack-monitor" :class="item.shapeClass" aria-hidden="true">
                          <span class="guide-shape guide-shape-back" />
                          <span class="guide-shape guide-shape-front" />
                        </span>
                        <span class="guide-monitor-progress" :style="{ animationDelay: item.delay }" />
                      </span>
                      <p class="guide-playing-line">
                        <span>{{ t('playlist.mappingGuidePlayingPrefix') }}</span>
                        <span class="guide-playing-path">{{ folderGuidePlaybackLines[index].path }}</span>
                        <br />
                        <span>{{ t('playlist.mappingGuidePlayingMiddle') }}</span>
                        <strong class="guide-playing-monitor">{{ folderGuidePlaybackLines[index].monitor }}</strong>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
        <div class="playlist-guide-nav" role="tablist" :aria-label="t('playlist.mappingGuideTitle')">
          <button
            class="playlist-guide-nav-button"
            :class="{ 'playlist-guide-nav-button-active': mappingGuideSlide === 0 }"
            type="button"
            role="tab"
            :aria-selected="mappingGuideSlide === 0"
            @click="mappingGuideSlide = 0"
          >
            00
          </button>
          <button
            class="playlist-guide-nav-button"
            :class="{ 'playlist-guide-nav-button-active': mappingGuideSlide === 1 }"
            type="button"
            role="tab"
            :aria-selected="mappingGuideSlide === 1"
            @click="mappingGuideSlide = 1"
          >
            01
          </button>
          <button
            class="playlist-guide-nav-button"
            :class="{ 'playlist-guide-nav-button-active': mappingGuideSlide === 2 }"
            type="button"
            role="tab"
            :aria-selected="mappingGuideSlide === 2"
            @click="mappingGuideSlide = 2"
          >
            02
          </button>
        </div>
      </div>
    </section>
  </div>
  <div v-else class="empty-state">{{ t('playlist.empty') }}</div>
</template>

<style scoped>
.playlist-editor {
  gap: 14px;
}

.detail-section {
  display: grid;
  gap: 10px;
}

.detail-input,
.playlist-table {
  font-size: 13px;
}

.playlist-table th,
.playlist-table td {
  padding-top: 8px;
  padding-bottom: 8px;
}

.playlist-guide {
  display: grid;
  gap: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-divider);
}

.playlist-guide-toggle {
  min-height: var(--button-height);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: left;
}

.playlist-guide-toggle:hover {
  color: var(--color-text-primary);
}

.playlist-guide-body {
  display: grid;
  gap: var(--space-5);
}

.playlist-guide-carousel {
  overflow: hidden;
}

.playlist-guide-track {
  display: flex;
  transition: transform 260ms ease;
  will-change: transform;
}

.playlist-guide-method {
  flex: 0 0 100%;
  min-width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(260px, 1.2fr);
  gap: var(--space-6);
  align-items: center;
}

.playlist-guide-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

.playlist-guide-nav-button {
  min-width: 42px;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: var(--font-weight-ui-section);
  letter-spacing: 0.08em;
  transition:
    background-color 180ms ease,
    color 180ms ease;
}

.playlist-guide-nav-button:hover {
  background: var(--color-hover-surface);
  color: var(--color-text-secondary);
}

.playlist-guide-nav-button-active {
  background: var(--color-hover-surface);
  color: var(--color-text-primary);
}

.playlist-guide-copy {
  display: grid;
  gap: var(--space-2);
}

.playlist-guide-heading {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: var(--font-weight-ui-section);
}

.playlist-guide-text {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.playlist-guide-demo {
  --guide-monitor-height: 92px;
  --guide-folder-overlap: 44px;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
  border-radius: var(--radius-panel);
  background: var(--color-surface-muted);
  box-shadow: inset 0 0 0 1px var(--color-divider);
}

.playlist-guide-demo-config {
  align-content: center;
}

.guide-config-select {
  display: grid;
  gap: var(--space-2);
  justify-items: center;
}

.guide-config-select-label {
  color: var(--color-text-secondary);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.guide-config-monitor-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
}

.guide-config-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.guide-config-cta-text {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.guide-source-frame {
  display: grid;
  place-items: center;
}

.guide-source-strip {
  width: 100%;
  max-width: 280px;
  height: 52px;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
  border-radius: var(--radius-field);
  box-shadow: inset 0 0 0 1px var(--color-divider-strong);
}

.guide-source-segment,
.guide-monitor-surface {
  position: relative;
  overflow: hidden;
}

.guide-source-segment {
  display: grid;
  place-items: center;
}

.guide-shape-stack {
  position: relative;
  z-index: 1;
  width: 46px;
  height: 30px;
  display: block;
}

.guide-shape {
  position: absolute;
  display: block;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.3);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
}

.guide-shape-front {
  width: 34px;
  height: 12px;
  left: 6px;
  top: 10px;
}

.guide-shape-back {
  width: 22px;
  height: 10px;
  left: 18px;
  top: 4px;
  opacity: 0.7;
}

.guide-shape-stack-monitor {
  transform: scale(0.92);
}

.guide-shape-stack-video {
  transform: scale(0.84) rotate(-3deg);
}

.shape-1 .guide-shape-front {
  transform: rotate(-18deg);
}

.shape-1 .guide-shape-back {
  transform: rotate(28deg);
}

.shape-2 .guide-shape-front {
  transform: rotate(14deg);
}

.shape-2 .guide-shape-back {
  transform: rotate(-32deg);
}

.shape-3 .guide-shape-front {
  transform: rotate(-6deg);
}

.shape-3 .guide-shape-back {
  transform: rotate(36deg);
}

.guide-source-segment::before,
.guide-monitor-surface::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0)),
    repeating-linear-gradient(0deg,
      transparent 0,
      transparent 15px,
      var(--color-monitor-grid-line) 15px,
      var(--color-monitor-grid-line) 16px),
    repeating-linear-gradient(90deg,
      transparent 0,
      transparent 15px,
      var(--color-monitor-grid-line) 15px,
      var(--color-monitor-grid-line) 16px);
}

.tone-1 {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
}

.tone-2 {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
}

.tone-3 {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.015));
}

.guide-path {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
  word-break: break-all;
}

.guide-path-folder {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-ui-section);
}

.guide-path-rest {
  color: var(--color-text-tertiary);
}

.guide-playing-line {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

.guide-playing-path {
  color: var(--color-text-secondary);
}

.guide-playing-monitor {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-ui-section);
}

.guide-arrow-row {
  display: grid;
  place-items: center;
}

.guide-arrow {
  position: relative;
  justify-self: center;
  width: 10px;
  height: 28px;
}

.guide-arrow::before,
.guide-arrow::after {
  content: '';
  position: absolute;
  background: var(--color-text-tertiary);
  left: 50%;
  transform: translateX(-50%);
}

.guide-arrow::before {
  top: 0;
  bottom: 9px;
  width: 1px;
  opacity: 0.45;
}

.guide-arrow::after {
  bottom: 0;
  width: 8px;
  height: 8px;
  clip-path: polygon(50% 100%, 0 0, 100% 0);
  opacity: 0.7;
}

.guide-monitor-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
}

.guide-monitor-column {
  display: grid;
  align-self: center;
  gap: var(--space-2);
  justify-items: center;
}

.guide-monitor-caption {
  min-height: 14px;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-align: center;
  letter-spacing: 0.03em;
}

.guide-monitor-surface {
  border-radius: var(--radius-field);
  box-shadow: inset 0 0 0 1px var(--color-monitor-card-border);
  display: grid;
  align-items: center;
  justify-items: center;
}

.guide-monitor-progress {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  height: 2px;
  background: rgba(255, 255, 255, 0.16);
  overflow: hidden;
}

.guide-monitor-progress::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.52);
  transform-origin: left center;
  animation: guide-progress 7.6s linear infinite;
}

.guide-monitor-shortname {
  color: var(--color-text-tertiary);
  font-size: 11px;
  text-align: center;
}

.playlist-guide-demo-split .guide-source-strip {
  animation: guide-pan 3.2s ease-in-out infinite alternate;
}

.playlist-guide-demo-split .guide-monitor-surface::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
  transform: translateX(-140%);
  animation: guide-sweep 2.4s ease-in-out infinite;
}

.guide-folder-grid {
  display: grid;
  column-gap: var(--space-3);
  row-gap: var(--space-4);
  align-items: start;
}

.guide-folder-grid-cell {
  display: grid;
  justify-items: center;
}

.guide-folder-grid-cell-top {
  align-items: start;
}

.guide-folder-grid-cell-bottom {
  align-items: center;
}

.guide-folder-arrow-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  align-items: center;
  gap: var(--space-3);
  padding-inline: 10px;
}

.guide-folder-arrow {
  position: relative;
  justify-self: center;
  width: 10px;
  height: 28px;
}

.guide-folder-arrow::before,
.guide-folder-arrow::after {
  content: '';
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-text-tertiary);
}

.guide-folder-arrow::before {
  top: 0;
  bottom: 9px;
  width: 1px;
  opacity: 0.45;
}

.guide-folder-arrow::after {
  bottom: 0;
  width: 8px;
  height: 8px;
  clip-path: polygon(50% 100%, 0 0, 100% 0);
  opacity: 0.7;
}

.guide-folder-scene {
  width: 188px;
  min-height: 126px;
  display: grid;
  place-items: center;
}

.guide-folder-video-card {
  grid-area: 1 / 1;
  width: 84px;
  height: 46px;
  overflow: hidden;
  transform: translate(28px, -25px) rotate(25deg);
  transform-origin: center;
}

.guide-folder-video-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0)),
    repeating-linear-gradient(0deg,
      transparent 0,
      transparent 15px,
      var(--color-monitor-grid-line) 15px,
      var(--color-monitor-grid-line) 16px),
    repeating-linear-gradient(90deg,
      transparent 0,
      transparent 15px,
      var(--color-monitor-grid-line) 15px,
      var(--color-monitor-grid-line) 16px);
}

.guide-folder-video-bar {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  height: 2px;
  background: rgba(255, 255, 255, 0.15);
  overflow: hidden;
}

.guide-folder-video-bar::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.5);
  transform-origin: left center;
  animation: guide-progress 7.6s linear infinite;
}

.guide-folder-card {
  grid-area: 1 / 1;
  width: 152px;
  min-height: 114px;
  padding: 0;
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 2px;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  z-index: 1;
}

.guide-folder-icon {
  color: var(--color-text-secondary);
  width: 118px;
  height: 94px;
  display: block;
  filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.16));
}

.guide-folder-label {
  margin-left: 16px;
  margin-top: -12px;
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: var(--font-weight-ui-section);
  text-transform: none;
}

.guide-file-badge {
  color: var(--color-text-primary);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.guide-file-badge::after {
  content: '';
  position: absolute;
  inset: auto 14px 14px;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  transform-origin: left center;
  animation: guide-underline 2.4s ease-in-out infinite;
}

@keyframes guide-pan {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-6px);
  }
}

@keyframes guide-sweep {
  0%,
  18% {
    transform: translateX(-140%);
  }
  52%,
  100% {
    transform: translateX(140%);
  }
}

@keyframes guide-underline {
  0%,
  100% {
    transform: scaleX(0.38);
    opacity: 0.45;
  }
  50% {
    transform: scaleX(1);
    opacity: 0.8;
  }
}

@keyframes guide-progress {
  0% {
    transform: scaleX(0);
  }
  100% {
    transform: scaleX(1);
  }
}

@media (max-width: 900px) {
  .playlist-guide-method {
    grid-template-columns: 1fr;
  }
}
</style>
