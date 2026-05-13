<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import TitleBar from './components/shell/TitleBar.vue';
import Sidebar from './components/shell/Sidebar.vue';
import WorkspaceFrame from './components/shell/WorkspaceFrame.vue';
import MonitorDetail from './components/workbench/MonitorDetail.vue';
import ConfigurationEditor from './components/workbench/ConfigurationEditor.vue';
import PlaylistEditor from './components/workbench/PlaylistEditor.vue';
import SettingsView from './components/workbench/SettingsView.vue';
import { CONFIGURATION_PREVIEW_RELATIVE_PATH, isConfigurationPreviewPayload } from './lib/domain';
import { PRESENTATION_CONTROL_EVENT, emitPresentationControl, type PlaybackControl } from './lib/playback';
import { getPresentationState, onPresentationSync, stopPresentation, toAssetUrl } from './lib/tauri';
import { buildMonitorTransform, isQuarterTurnRotation } from './lib/ui';
import { useWorkbench } from './stores/workbench';
import type { PresentationPayload } from './types';

const query = new URLSearchParams(window.location.search);
const isPresentationWindow = query.get('view') === 'presentation';
const presentationShortName = query.get('display');
const currentLabel = getCurrentWebviewWindow().label;
const presentationUnlisten = ref<null | (() => void)>(null);
const controlUnlisten = ref<null | (() => void)>(null);
const syncUnlisten = ref<null | (() => void)>(null);
const presentationPayload = ref<PresentationPayload | null>(null);

const workbench = useWorkbench();

const presentationDisplay = computed(() => {
  if (!presentationPayload.value) {
    return null;
  }

  return (
    presentationPayload.value.displays.find(
      (display) => display.shortName === presentationShortName || display.windowLabel === currentLabel
    ) ?? null
  );
});

const presentationAssetUrl = computed(() =>
  presentationDisplay.value?.assetPath ? toAssetUrl(presentationDisplay.value.assetPath) : ''
);
const activePresentation = computed(() => workbench.state.playback.payload);
const activePresentationIsPreview = computed(() => isConfigurationPreviewPayload(activePresentation.value));
const presentationDisplayIsPreview = computed(
  () => presentationDisplay.value?.relativePath === CONFIGURATION_PREVIEW_RELATIVE_PATH
);

const presentationIsVideo = computed(() => {
  const path = presentationDisplay.value?.relativePath.toLowerCase() ?? '';
  return ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'].some((extension) => path.endsWith(extension));
});

const presentationTransform = computed(() => {
  const display = presentationDisplay.value;
  if (!display) {
    return '';
  }

  return buildMonitorTransform(display.mapping);
});

const presentationRotationTransform = computed(() => {
  const display = presentationDisplay.value;
  if (!display) {
    return '';
  }

  return `rotate(${display.mapping.rotation}deg)`;
});

const presentationViewportStyle = computed(() => {
  const display = presentationDisplay.value;
  if (!display) {
    return {};
  }

  if (!isQuarterTurnRotation(display.mapping.rotation)) {
    return { inset: '0px' };
  }

  const frameWidth = display.frame?.width ?? window.innerWidth;
  const frameHeight = display.frame?.height ?? window.innerHeight;
  const scaleFactor = display.frame?.scaleFactor ?? 1;
  const logicalWidth = frameWidth / scaleFactor;
  const logicalHeight = frameHeight / scaleFactor;

  return {
    width: `${logicalHeight}px`,
    height: `${logicalWidth}px`,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)'
  };
});

async function handlePlaybackControl(control: PlaybackControl): Promise<void> {
  if (activePresentationIsPreview.value) {
    if (control === 'stop') {
      await workbench.stopActivePlayback();
    }
    return;
  }

  switch (control) {
    case 'previous':
      await workbench.stepActivePlayback(-1);
      return;
    case 'next':
      await workbench.stepActivePlayback(1);
      return;
    case 'stop':
      await workbench.stopActivePlayback();
      return;
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (isPresentationWindow) {
      void stopPresentation();
      return;
    }

    void workbench.stopActivePlayback();
    return;
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    if (isPresentationWindow) {
      void emitPresentationControl('previous');
      return;
    }

    void workbench.stepActivePlayback(-1);
    return;
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    if (isPresentationWindow) {
      void emitPresentationControl('next');
      return;
    }

    void workbench.stepActivePlayback(1);
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);

  if (isPresentationWindow) {
    presentationUnlisten.value = await onPresentationSync((payload) => {
      presentationPayload.value = payload.active ? payload : null;
    });
    const snapshot = await getPresentationState();
    presentationPayload.value = snapshot?.active ? snapshot : null;
    return;
  }

  await workbench.bootstrap();
  syncUnlisten.value = await onPresentationSync((payload) => {
    workbench.syncPlaybackState(payload.active ? payload : null);
  });
  const snapshot = await getPresentationState();
  workbench.syncPlaybackState(snapshot?.active ? snapshot : null);
  controlUnlisten.value = await listen<{ control: PlaybackControl }>(
    PRESENTATION_CONTROL_EVENT,
    ({ payload }) => {
      void handlePlaybackControl(payload.control);
    },
    { target: { kind: 'WebviewWindow', label: 'main' } }
  );
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);

  if (presentationUnlisten.value) {
    void presentationUnlisten.value();
  }

  if (controlUnlisten.value) {
    void controlUnlisten.value();
  }

  if (syncUnlisten.value) {
    void syncUnlisten.value();
  }
});
</script>

<template>
  <main v-if="isPresentationWindow" class="presentation-shell">
    <div v-if="presentationDisplay && presentationDisplayIsPreview" class="presentation-stage presentation-preview-stage">
      <span class="preview-marker marker-corner top-left" />
      <span class="preview-marker marker-corner top-right" />
      <span class="preview-marker marker-corner bottom-left" />
      <span class="preview-marker marker-corner bottom-right" />
      <span class="preview-marker marker-center" />
      <div class="presentation-preview-viewport" :style="presentationViewportStyle">
        <div class="presentation-preview-canvas" :style="{ transform: presentationRotationTransform }">
          <div
            class="presentation-preview-surface"
            :class="{ selected: presentationDisplay?.selected }"
            :style="{ transform: presentationTransform }"
          >
            <div class="presentation-preview-grid" />
            <span class="presentation-preview-word">Graph</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="presentationDisplay && presentationAssetUrl" class="presentation-stage">
      <div class="presentation-media-viewport" :style="presentationViewportStyle">
        <video
          v-if="presentationIsVideo"
          :src="presentationAssetUrl"
          class="presentation-media"
          :style="{ transform: presentationTransform }"
          autoplay
          loop
          muted
          playsinline
        />
        <img
          v-else
          :src="presentationAssetUrl"
          class="presentation-media"
          :style="{ transform: presentationTransform }"
          alt=""
        />
      </div>
    </div>
    <div v-else class="presentation-empty">
      <i class="mdi mdi-image-off-outline" />
    </div>
  </main>

  <main v-else class="shell-root shell-theme-graphite">
    <TitleBar
      :collapsed="workbench.state.sidebarCollapsed"
      @toggle-sidebar="workbench.toggleSidebar"
      @command="(_, actionKey) => workbench.handleMenuCommand(actionKey)"
    />

    <section class="shell-main" :class="{ 'shell-main-collapsed': workbench.state.sidebarCollapsed }">
      <Sidebar
        v-if="!workbench.state.sidebarCollapsed"
        :collapsed="workbench.state.sidebarCollapsed"
        :width="workbench.state.sidebarWidth"
        :head-buttons="workbench.sidebarModel.value.headButtons"
        :body-lists="workbench.sidebarModel.value.bodyLists"
        :tail-buttons="workbench.sidebarModel.value.tailButtons"
        :list-items="workbench.sidebarModel.value.listItems"
        @resize="workbench.setSidebarWidth"
        @head-button-clicked="workbench.handleMenuCommand"
        @tail-button-clicked="workbench.openSettings"
        @list-button-clicked="workbench.handleSidebarListAction"
        @list-selection-changed="workbench.handleSidebarSelection"
      />

      <WorkspaceFrame
        :title="workbench.workspaceTitle.value"
        :actions="workbench.workspaceActions.value"
        :status-message="workbench.state.statusMessage"
        :error-message="workbench.state.errorMessage"
        @action="workbench.handleWorkspaceAction"
      >
        <section
          v-if="workbench.state.playback.active && !activePresentationIsPreview"
          class="presentation-console"
        >
          <div class="presentation-console-header">
            <p class="presentation-console-label">展示模式</p>
            <h2 class="presentation-console-title">
              {{ activePresentationIsPreview ? 'Configuration Preview' : activePresentation?.fileName || 'Presentation live' }}
            </h2>
            <p class="presentation-console-meta">
              {{
                activePresentationIsPreview
                  ? 'Graph + grid on connected displays'
                  : `${(activePresentation?.index ?? 0) + 1} / ${activePresentation?.total ?? 0}`
              }}
            </p>
          </div>

          <div class="presentation-console-actions">
            <button
              class="presentation-console-button"
              type="button"
              :disabled="activePresentationIsPreview"
              @click="workbench.stepActivePlayback(-1)"
            >
              <i class="mdi mdi-chevron-left" />
              <span>上一张</span>
            </button>
            <button class="presentation-console-button danger" type="button" @click="workbench.stopActivePlayback()">
              <i class="mdi mdi-stop" />
              <span>停止</span>
            </button>
            <button
              class="presentation-console-button"
              type="button"
              :disabled="activePresentationIsPreview"
              @click="workbench.stepActivePlayback(1)"
            >
              <span>下一张</span>
              <i class="mdi mdi-chevron-right" />
            </button>
          </div>
        </section>

        <MonitorDetail
          v-else-if="workbench.state.currentPage === 'monitor'"
          :monitor="workbench.selectedMonitor.value"
          @friendly-name-changed="workbench.updateMonitorFriendlyName"
        />

        <ConfigurationEditor
          v-else-if="workbench.state.currentPage === 'configuration'"
          :configuration="workbench.selectedConfiguration.value"
          :available-monitors="workbench.state.monitors"
          :selected-monitor-key="workbench.state.selectedConfigurationMonitorKey"
          @name-changed="
            (value) => {
              if (workbench.selectedConfiguration.value) workbench.selectedConfiguration.value.name = value;
            }
          "
          @description-changed="
            (value) => {
              if (workbench.selectedConfiguration.value) workbench.selectedConfiguration.value.description = value;
            }
          "
          @add-monitor="workbench.addMonitorToSelectedConfiguration"
          @select-monitor="workbench.selectConfigurationMonitor"
          @remove-monitor="workbench.removeMonitorFromSelectedConfiguration"
          @short-name-changed="
            (deviceId, value) =>
              workbench.updateSelectedConfigurationMonitor(deviceId, (monitor) => {
                monitor.shortName = value;
              })
          "
          @rotation-changed="
            (deviceId, value) =>
              workbench.updateSelectedConfigurationMonitor(deviceId, (monitor) => {
                monitor.mapping.rotation = value;
              })
          "
          @mirror-changed="
            (deviceId, value) =>
              workbench.updateSelectedConfigurationMonitor(deviceId, (monitor) => {
                monitor.mapping.mirror = value;
              })
          "
          @scale-changed="
            (deviceId, value) =>
              workbench.updateSelectedConfigurationMonitor(deviceId, (monitor) => {
                monitor.mapping.scale = value;
              })
          "
          @offset-x-changed="
            (deviceId, value) =>
              workbench.updateSelectedConfigurationMonitor(deviceId, (monitor) => {
                monitor.mapping.offsetX = value;
              })
          "
          @offset-y-changed="
            (deviceId, value) =>
              workbench.updateSelectedConfigurationMonitor(deviceId, (monitor) => {
                monitor.mapping.offsetY = value;
              })
          "
        />

        <PlaylistEditor
          v-else-if="workbench.state.currentPage === 'playlist'"
          :playlist="workbench.selectedPlaylist.value"
          :configurations="workbench.state.configurations"
          @name-changed="
            (value) => {
              if (workbench.selectedPlaylist.value) workbench.selectedPlaylist.value.name = value;
            }
          "
          @source-folder-picked="workbench.choosePlaylistSourceFolder"
          @configuration-changed="
            async (value) => {
              if (workbench.selectedPlaylist.value) {
                workbench.selectedPlaylist.value.configurationId = value;
                await workbench.regenerateSelectedPlaylist();
              }
            }
          "
          @mapping-mode-changed="
            (value) => {
              if (workbench.selectedPlaylist.value) workbench.selectedPlaylist.value.mappingMode = value;
            }
          "
          @visibility-changed="
            (fileName, value) => {
              const entry = workbench.selectedPlaylist.value?.entries.find((item) => item.fileName === fileName);
              if (entry) entry.visibility = value;
            }
          "
        />

        <SettingsView v-else :recent-folders="workbench.state.settings.recentPlaylistFolders" />
      </WorkspaceFrame>
    </section>
  </main>
</template>

<style scoped>
.presentation-preview-stage {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.presentation-preview-viewport,
.presentation-media-viewport {
  position: absolute;
  inset: 0;
}

.presentation-preview-canvas {
  position: absolute;
  inset: 0;
  transform-origin: center;
}

.presentation-preview-surface {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  transform-origin: center;
}

.presentation-preview-surface.selected {
  box-shadow: inset 0 0 0 3px rgba(92, 155, 255, 0.96);
}

.presentation-preview-grid {
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      0deg,
      transparent 0,
      transparent 47px,
      rgba(255, 255, 255, 0.08) 47px,
      rgba(255, 255, 255, 0.08) 48px
    ),
    repeating-linear-gradient(
      90deg,
      transparent 0,
      transparent 47px,
      rgba(255, 255, 255, 0.08) 47px,
      rgba(255, 255, 255, 0.08) 48px
    );
}

.presentation-preview-word {
  position: relative;
  z-index: 1;
  font-size: clamp(80px, 15vw, 240px);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.22);
}

.preview-marker {
  position: absolute;
  z-index: 4;
  pointer-events: none;
}

.marker-corner {
  width: 22px;
  height: 22px;
}

.marker-corner::before,
.marker-corner::after {
  content: '';
  position: absolute;
  background: rgba(255, 72, 72, 0.98);
  border-radius: 999px;
}

.marker-corner::before {
  width: 22px;
  height: 3px;
}

.marker-corner::after {
  width: 3px;
  height: 22px;
}

.marker-corner.top-left {
  top: 0;
  left: 0;
}

.marker-corner.top-left::before,
.marker-corner.top-right::before {
  top: 0;
}

.marker-corner.bottom-left::before,
.marker-corner.bottom-right::before {
  bottom: 0;
}

.marker-corner.top-left::after,
.marker-corner.bottom-left::after {
  left: 0;
}

.marker-corner.top-right {
  top: 0;
  right: 0;
}

.marker-corner.top-right::after,
.marker-corner.bottom-right::after {
  right: 0;
}

.marker-corner.bottom-left {
  bottom: 0;
  left: 0;
}

.marker-corner.bottom-right {
  bottom: 0;
  right: 0;
}

.marker-center {
  left: 50%;
  top: 50%;
  width: 18px;
  height: 18px;
  transform: translate(-50%, -50%);
}

.marker-center::before,
.marker-center::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  background: rgba(255, 72, 72, 0.98);
  border-radius: 999px;
  transform: translate(-50%, -50%);
}

.marker-center::before {
  width: 18px;
  height: 3px;
}

.marker-center::after {
  width: 3px;
  height: 18px;
}

.presentation-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: center;
}

.presentation-console {
  min-height: 100%;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 28px;
  padding: 40px 24px;
  text-align: center;
}

.presentation-console-header {
  display: grid;
  gap: 10px;
}

.presentation-console-label {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.presentation-console-title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.presentation-console-meta {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.presentation-console-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.presentation-console-button {
  min-width: 144px;
  min-height: 40px;
  padding: 0 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.presentation-console-button:hover {
  background: var(--color-pill-hover);
  color: var(--color-text-primary);
}

.presentation-console-button:disabled {
  opacity: 0.35;
  pointer-events: none;
}

.presentation-console-button.danger:hover {
  background: var(--color-danger-hover);
  color: var(--color-danger-text);
}
</style>
