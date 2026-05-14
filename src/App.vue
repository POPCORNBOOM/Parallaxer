<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import TitleBar from './components/shell/TitleBar.vue';
import Sidebar from './components/shell/Sidebar.vue';
import WorkspaceFrame from './components/shell/WorkspaceFrame.vue';
import MonitorDetail from './components/workbench/MonitorDetail.vue';
import ConfigurationEditor from './components/workbench/ConfigurationEditor.vue';
import PlaylistEditor from './components/workbench/PlaylistEditor.vue';
import SettingsView from './components/workbench/SettingsView.vue';
import AboutView from './components/workbench/AboutView.vue';
import { CONFIGURATION_PREVIEW_RELATIVE_PATH, isConfigurationPreviewPayload } from './lib/domain';
import {
  PRESENTATION_CONTROL_EVENT,
  PRESENTATION_VIDEO_EVENT,
  emitPresentationControl,
  type PlaybackControl,
  type PresentationVideoSignal
} from './lib/playback';
import { getPresentationState, onPresentationSync, stopPresentation, toAssetUrl } from './lib/tauri';
import {
  buildMediaFrameDimensions,
  buildSharedSliceSourceRect,
  buildMonitorTransform,
  isQuarterTurnRotation
} from './lib/ui';
import { useWorkbench } from './stores/workbench';
import type { PresentationPayload } from './types';

const query = new URLSearchParams(window.location.search);
const isPresentationWindow = query.get('view') === 'presentation';
const presentationWindowQuery = query.get('display');
const currentLabel = getCurrentWebviewWindow().label;
const presentationUnlisten = ref<null | (() => void)>(null);
const controlUnlisten = ref<null | (() => void)>(null);
const syncUnlisten = ref<null | (() => void)>(null);
const videoUnlisten = ref<null | (() => void)>(null);
const presentationPayload = ref<PresentationPayload | null>(null);
const presentationVideoElement = ref<HTMLVideoElement | null>(null);
const presentationImageElement = ref<HTMLImageElement | null>(null);
const presentationVideoReadySent = ref(false);
const videoReadyLabels = new Set<string>();
const videoEndedLabels = new Set<string>();
const presentationVideosPaused = ref(false);
const presentationMediaReady = ref(false);
const presentationMediaIntrinsicSize = ref({
  width: 0,
  height: 0
});
const presentationViewport = ref({
  width: window.innerWidth,
  height: window.innerHeight
});
const presentationDrawerOpen = ref(false);
const presentationConsoleRef = ref<HTMLElement | null>(null);
const systemPrefersLight = ref(false);
const { t } = useI18n({ useScope: 'global' });

const workbench = useWorkbench();
const resolvedThemeMode = computed(() => {
  if (workbench.state.settings.themeMode === 'system') {
    return systemPrefersLight.value ? 'light' : 'dark';
  }

  return workbench.state.settings.themeMode;
});
const shellThemeClass = computed(() =>
  resolvedThemeMode.value === 'light' ? 'shell-theme-light' : 'shell-theme-graphite'
);
const shellMainStyle = computed(() => ({
  '--shell-sidebar-width': `${Math.max(workbench.state.sidebarWidth, 0)}px`
}));
const THEME_CLASS_NAMES = ['shell-theme-light', 'shell-theme-graphite'] as const;

function applyDocumentThemeClass(className: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.classList.remove(...THEME_CLASS_NAMES);
  document.body.classList.remove(...THEME_CLASS_NAMES);
  document.documentElement.classList.add(className);
  document.body.classList.add(className);
}

const presentationDisplay = computed(() => {
  if (!presentationPayload.value) {
    return null;
  }

  return (
    presentationPayload.value.displays.find(
      (display) => display.windowLabel === presentationWindowQuery || display.windowLabel === currentLabel
    ) ?? null
  );
});

const presentationAssetUrl = computed(() =>
  presentationDisplay.value?.assetPath ? toAssetUrl(presentationDisplay.value.assetPath) : ''
);
const activePresentation = computed(() => workbench.state.playback.payload);
const activePresentationIsPreview = computed(() => isConfigurationPreviewPayload(activePresentation.value));
const activePlaybackPlaylist = computed(() =>
  workbench.state.playlists.find((item) => item.id === workbench.state.playback.playlistId) ?? null
);
const activePlaybackConfiguration = computed(() =>
  workbench.state.configurations.find((item) => item.id === workbench.state.playback.configurationId) ?? null
);
const presentationDisplayIsPreview = computed(
  () => presentationDisplay.value?.relativePath === CONFIGURATION_PREVIEW_RELATIVE_PATH
);

const presentationIsVideo = computed(() => {
  const path = presentationDisplay.value?.relativePath.toLowerCase() ?? '';
  return ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'].some((extension) => path.endsWith(extension));
});

const presentationVideoDisplays = computed(() =>
  (workbench.state.playback.payload?.displays ?? []).filter((display) => {
    const path = display.relativePath.toLowerCase();
    return ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'].some((extension) => path.endsWith(extension));
  })
);

const presentationAudioOwnerLabel = computed(() => {
  const payload = isPresentationWindow ? presentationPayload.value : workbench.state.playback.payload;
  const firstVideoDisplay = payload?.displays.find((display) => {
    const path = display.relativePath.toLowerCase();
    return ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v'].some((extension) => path.endsWith(extension));
  });

  return firstVideoDisplay?.windowLabel ?? null;
});

const presentationShouldPlayAudio = computed(() => {
  if (!presentationIsVideo.value) {
    return false;
  }

  return presentationAudioOwnerLabel.value === currentLabel;
});

const presentationTransform = computed(() => {
  const display = presentationDisplay.value;
  if (!display) {
    return '';
  }

  return buildMonitorTransform(display.mapping);
});

const presentationContentViewportSize = computed(() => {
  const display = presentationDisplay.value;
  if (!display) {
    return { width: 1, height: 1 };
  }

  const baseWidth = presentationViewport.value.width;
  const baseHeight = presentationViewport.value.height;
  return isQuarterTurnRotation(display.mapping.rotation)
    ? { width: baseHeight, height: baseWidth }
    : { width: baseWidth, height: baseHeight };
});

const presentationMediaFrameStyle = computed(() => {
  const dimensions = presentationMediaFrameDimensions.value;
  return {
    width: `${dimensions.width}px`,
    height: `${dimensions.height}px`,
    transform: `translate(-50%, -50%) ${presentationTransform.value}`.trim()
  };
});

const presentationMediaFrameDimensions = computed(() => {
  const display = presentationDisplay.value;
  if (!display) {
    return {
      width: presentationContentViewportSize.value.width,
      height: presentationContentViewportSize.value.height
    };
  }

  const slice = display.slice;
  const viewportWidth = presentationContentViewportSize.value.width;
  const viewportHeight = presentationContentViewportSize.value.height;
  const intrinsicWidth = Math.max(presentationMediaIntrinsicSize.value.width, 1);
  const intrinsicHeight = Math.max(presentationMediaIntrinsicSize.value.height, 1);
  const mediaWidth = slice ? intrinsicWidth / slice.total : intrinsicWidth;
  const mediaHeight = intrinsicHeight;

  return buildMediaFrameDimensions({
    viewportWidth,
    viewportHeight,
    mediaWidth,
    mediaHeight
  });
});

const presentationSliceSourceRect = computed(() => {
  const display = presentationDisplay.value;
  const slice = display?.slice;
  const intrinsicWidth = Math.max(presentationMediaIntrinsicSize.value.width, 1);
  const intrinsicHeight = Math.max(presentationMediaIntrinsicSize.value.height, 1);

  if (!slice) {
    return { x: 0, y: 0, width: intrinsicWidth, height: intrinsicHeight };
  }

  return buildSharedSliceSourceRect({
    intrinsicWidth,
    intrinsicHeight,
    total: slice.total,
    index: slice.index,
    frameWidth: presentationMediaFrameDimensions.value.width,
    devicePixelRatio: window.devicePixelRatio || 1
  });
});

const presentationMediaSurfaceStyle = computed(() => {
  const rect = presentationSliceSourceRect.value;
  const frame = presentationMediaFrameDimensions.value;

  return {
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    left: '50%',
    top: '50%',
    transform: `translate(-50%, -50%) scale(${frame.width / rect.width}, ${frame.height / rect.height})`,
    transformOrigin: 'center'
  };
});

const presentationMediaStyle = computed<Record<string, string>>(() => {
  const rect = presentationSliceSourceRect.value;

  return {
    width: `${Math.max(presentationMediaIntrinsicSize.value.width, 1)}px`,
    height: `${Math.max(presentationMediaIntrinsicSize.value.height, 1)}px`,
    left: `${-rect.x}px`,
    top: `${-rect.y}px`,
    visibility: presentationMediaReady.value ? 'visible' : 'hidden'
  };
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

  const logicalWidth = presentationViewport.value.width;
  const logicalHeight = presentationViewport.value.height;

  return {
    width: `${logicalHeight}px`,
    height: `${logicalWidth}px`,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)'
  };
});

function syncPresentationViewport(): void {
  presentationViewport.value = {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

let systemThemeMediaQuery: MediaQueryList | null = null;
let removeSystemThemeListener: (() => void) | null = null;

function syncSystemThemePreference(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    systemPrefersLight.value = false;
    return;
  }

  systemThemeMediaQuery = systemThemeMediaQuery ?? window.matchMedia('(prefers-color-scheme: light)');
  systemPrefersLight.value = systemThemeMediaQuery.matches;
}

function bindSystemThemeListener(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return;
  }

  syncSystemThemePreference();
  const mediaQuery = systemThemeMediaQuery ?? window.matchMedia('(prefers-color-scheme: light)');
  const listener = (event: MediaQueryListEvent): void => {
    systemPrefersLight.value = event.matches;
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    removeSystemThemeListener = () => mediaQuery.removeEventListener('change', listener);
  } else {
    mediaQuery.addListener(listener);
    removeSystemThemeListener = () => mediaQuery.removeListener(listener);
  }
}

async function emitPresentationVideoSignal(signal: PresentationVideoSignal): Promise<void> {
  await getCurrentWebviewWindow().emitTo('main', PRESENTATION_VIDEO_EVENT, {
    signal,
    windowLabel: currentLabel
  });
}

async function onPresentationVideoCanPlay(): Promise<void> {
  const video = presentationVideoElement.value;
  if (!video || presentationVideoReadySent.value) {
    return;
  }

  presentationMediaIntrinsicSize.value = {
    width: video.videoWidth || 0,
    height: video.videoHeight || 0
  };
  presentationMediaReady.value = true;
  video.pause();
  video.currentTime = 0;
  presentationVideoReadySent.value = true;
  await emitPresentationVideoSignal('ready');
}

function onPresentationImageLoad(): void {
  const image = presentationImageElement.value;
  if (!image) {
    return;
  }

  presentationMediaIntrinsicSize.value = {
    width: image.naturalWidth || 0,
    height: image.naturalHeight || 0
  };
  presentationMediaReady.value = true;
}

function resetVideoSyncState(): void {
  videoReadyLabels.clear();
  videoEndedLabels.clear();
}

async function handlePresentationVideoSignal(signal: PresentationVideoSignal): Promise<void> {
  const video = presentationVideoElement.value;
  if (!video || !presentationIsVideo.value) {
    return;
  }

  if (signal === 'seek-backward') {
    video.currentTime = Math.max(0, video.currentTime - 5);
    return;
  }

  if (signal === 'seek-forward') {
    const duration = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
    video.currentTime = Math.min(duration, video.currentTime + 5);
    return;
  }

  if (signal === 'toggle-pause') {
    if (video.paused) {
      await video.play().catch(() => undefined);
    } else {
      video.pause();
    }
    return;
  }

  if (signal === 'restart') {
    video.currentTime = 0;
  }

  await video.play().catch(() => undefined);
}

async function handleVideoStatusEvent(payload: {
  signal: PresentationVideoSignal;
  windowLabel: string;
}): Promise<void> {
  const videoDisplays = presentationVideoDisplays.value;
  const videoLabels = new Set(videoDisplays.map((display) => display.windowLabel));

  if (!videoLabels.has(payload.windowLabel)) {
    return;
  }

  if (payload.signal === 'ready') {
    videoReadyLabels.add(payload.windowLabel);
    if (videoReadyLabels.size === videoLabels.size) {
      videoEndedLabels.clear();
      await Promise.all(
        [...videoLabels].map((label) =>
          getCurrentWebviewWindow().emitTo(label, PRESENTATION_VIDEO_EVENT, {
            signal: 'play' as PresentationVideoSignal
          })
        )
      );
    }
    return;
  }

  if (payload.signal === 'ended') {
    videoEndedLabels.add(payload.windowLabel);
    if (videoEndedLabels.size === videoLabels.size) {
      videoEndedLabels.clear();
      await Promise.all(
        [...videoLabels].map((label) =>
          getCurrentWebviewWindow().emitTo(label, PRESENTATION_VIDEO_EVENT, {
            signal: 'restart' as PresentationVideoSignal
          })
        )
      );
    }
    return;
  }

  if (payload.signal === 'toggle-pause') {
    presentationVideosPaused.value = !presentationVideosPaused.value;
  }
}

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

function broadcastVideoSignal(signal: Extract<PresentationVideoSignal, 'toggle-pause' | 'seek-backward' | 'seek-forward'>): void {
  const videoLabels = presentationVideoDisplays.value.map((display) => display.windowLabel);
  if (videoLabels.length === 0) {
    return;
  }

  if (signal === 'toggle-pause') {
    presentationVideosPaused.value = !presentationVideosPaused.value;
  }

  void Promise.all(
    videoLabels.map((label) =>
      getCurrentWebviewWindow().emitTo(label, PRESENTATION_VIDEO_EVENT, {
        signal
      })
    )
  );
}

function handlePresentationHotkeys(event: KeyboardEvent, target: 'presentation-window' | 'presentation-console'): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (target === 'presentation-window') {
      void stopPresentation();
      return;
    }

    void workbench.stopActivePlayback();
    return;
  }

  if (event.key === 'ArrowLeft') {
    if (event.shiftKey) {
      if (!presentationIsVideo.value && presentationVideoDisplays.value.length === 0) {
        return;
      }

      event.preventDefault();
      if (target === 'presentation-window') {
        void emitPresentationVideoSignal('seek-backward');
        return;
      }

      broadcastVideoSignal('seek-backward');
      return;
    }

    event.preventDefault();
    if (target === 'presentation-window') {
      void emitPresentationControl('previous');
      return;
    }

    void workbench.stepActivePlayback(-1);
    return;
  }

  if (event.key === 'ArrowRight') {
    if (event.shiftKey) {
      if (!presentationIsVideo.value && presentationVideoDisplays.value.length === 0) {
        return;
      }

      event.preventDefault();
      if (target === 'presentation-window') {
        void emitPresentationVideoSignal('seek-forward');
        return;
      }

      broadcastVideoSignal('seek-forward');
      return;
    }

    event.preventDefault();
    if (target === 'presentation-window') {
      void emitPresentationControl('next');
      return;
    }

    void workbench.stepActivePlayback(1);
    return;
  }

  if (event.key === ' ') {
    if (!presentationIsVideo.value && presentationVideoDisplays.value.length === 0) {
      return;
    }

    event.preventDefault();
    if (target === 'presentation-window') {
      void emitPresentationVideoSignal('toggle-pause');
      return;
    }

    broadcastVideoSignal('toggle-pause');
  }
}

function onWindowKeydown(event: KeyboardEvent): void {
  handlePresentationHotkeys(event, 'presentation-window');
}

function onPresentationConsoleKeydown(event: KeyboardEvent): void {
  handlePresentationHotkeys(event, 'presentation-console');
}

onMounted(async () => {
  window.addEventListener('resize', syncPresentationViewport);
  syncPresentationViewport();
  bindSystemThemeListener();

  if (isPresentationWindow) {
    window.addEventListener('keydown', onWindowKeydown);
    presentationUnlisten.value = await onPresentationSync((payload) => {
      presentationPayload.value = payload.active ? payload : null;
    });
    videoUnlisten.value = await listen<{ signal: PresentationVideoSignal }>(
      PRESENTATION_VIDEO_EVENT,
      ({ payload }) => {
        void handlePresentationVideoSignal(payload.signal);
      },
      { target: { kind: 'WebviewWindow', label: currentLabel } }
    );
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
  videoUnlisten.value = await listen<{ signal: PresentationVideoSignal; windowLabel: string }>(
    PRESENTATION_VIDEO_EVENT,
    ({ payload }) => {
      void handleVideoStatusEvent(payload);
    },
      { target: { kind: 'WebviewWindow', label: 'main' } }
  );
});

watch(
  () => workbench.state.playback.payload?.fileName,
  () => {
    resetVideoSyncState();
  }
);

watch(
  shellThemeClass,
  (className) => {
    applyDocumentThemeClass(className);
  },
  { immediate: true }
);

watch(
  () => workbench.state.playback.active,
  async (active) => {
    if (!active) {
      resetVideoSyncState();
      presentationVideosPaused.value = false;
      presentationDrawerOpen.value = false;
      presentationConsoleRef.value?.blur();
      return;
    }

    if (!isPresentationWindow && !activePresentationIsPreview.value) {
      await Promise.resolve();
      presentationConsoleRef.value?.focus();
    }
  }
);

watch(
  () => presentationAssetUrl.value,
  () => {
    presentationVideoReadySent.value = false;
    presentationVideosPaused.value = false;
    presentationMediaReady.value = false;
    presentationMediaIntrinsicSize.value = { width: 0, height: 0 };
  }
);

watch(
  () => presentationShouldPlayAudio.value,
  (shouldPlayAudio) => {
    const video = presentationVideoElement.value;
    if (!video) {
      return;
    }

    video.muted = !shouldPlayAudio;
    video.volume = shouldPlayAudio ? 1 : 0;
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown);
  window.removeEventListener('resize', syncPresentationViewport);

  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove(...THEME_CLASS_NAMES);
    document.body.classList.remove(...THEME_CLASS_NAMES);
  }

  if (presentationUnlisten.value) {
    void presentationUnlisten.value();
  }

  if (controlUnlisten.value) {
    void controlUnlisten.value();
  }

  if (syncUnlisten.value) {
    void syncUnlisten.value();
  }

  if (videoUnlisten.value) {
    void videoUnlisten.value();
  }

  if (removeSystemThemeListener) {
    removeSystemThemeListener();
    removeSystemThemeListener = null;
  }
});
</script>

<template>
  <main v-if="isPresentationWindow" class="presentation-shell">
    <div v-if="presentationDisplay && presentationDisplayIsPreview"
      class="presentation-stage presentation-preview-stage">
      <span class="preview-marker marker-corner top-left" />
      <span class="preview-marker marker-corner top-right" />
      <span class="preview-marker marker-corner bottom-left" />
      <span class="preview-marker marker-corner bottom-right" />
      <span class="preview-marker marker-center" />
      <div class="presentation-preview-viewport" :style="presentationViewportStyle">
        <div class="presentation-preview-canvas" :style="{ transform: presentationRotationTransform }">
          <div class="presentation-preview-surface" :class="{ selected: presentationDisplay?.selected }"
            :style="{ transform: presentationTransform }">
            <div class="presentation-preview-grid" />
            <span class="presentation-preview-word">{{ t('common.graph') }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="presentationDisplay && presentationAssetUrl" class="presentation-stage">
      <div class="presentation-media-viewport" :style="presentationViewportStyle">
        <div class="presentation-media-canvas" :style="{ transform: presentationRotationTransform }">
          <div class="presentation-media-frame" :style="presentationMediaFrameStyle">
            <div class="presentation-media-surface" :style="presentationMediaSurfaceStyle">
              <video v-if="presentationIsVideo" ref="presentationVideoElement" :src="presentationAssetUrl"
                class="presentation-media" :style="presentationMediaStyle" :muted="!presentationShouldPlayAudio"
                playsinline preload="auto"
                @canplay="onPresentationVideoCanPlay"
                @ended="emitPresentationVideoSignal('ended')" />
              <img v-else ref="presentationImageElement" :src="presentationAssetUrl" class="presentation-media"
                :style="presentationMediaStyle" alt="" @load="onPresentationImageLoad" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="presentation-empty">
      <i class="mdi mdi-image-off-outline" />
    </div>
  </main>

  <main v-else class="shell-root" :class="shellThemeClass">
    <TitleBar :collapsed="workbench.state.sidebarCollapsed" @toggle-sidebar="workbench.toggleSidebar"
      @command="(_, actionKey) => workbench.handleMenuCommand(actionKey)" />

    <section class="shell-main" :class="{ 'shell-main-collapsed': workbench.state.sidebarCollapsed }"
      :style="shellMainStyle">
      <Sidebar :collapsed="workbench.state.sidebarCollapsed"
        :width="workbench.state.sidebarWidth" :head-buttons="workbench.sidebarModel.value.headButtons"
        :body-lists="workbench.sidebarModel.value.bodyLists" :tail-buttons="workbench.sidebarModel.value.tailButtons"
        :list-items="workbench.sidebarModel.value.listItems" @resize="workbench.setSidebarWidth"
        @head-button-clicked="workbench.handleMenuCommand" @tail-button-clicked="workbench.openSettings"
        @list-button-clicked="workbench.handleSidebarListAction"
        @list-selection-changed="workbench.handleSidebarSelection" />

      <WorkspaceFrame :title="workbench.workspaceTitle.value" :actions="workbench.workspaceActions.value"
        :status-message="workbench.state.statusMessage" :error-message="workbench.state.errorMessage"
        :lock-body-scroll="workbench.state.playback.active && !activePresentationIsPreview"
        :flush-body="workbench.state.playback.active && !activePresentationIsPreview"
        @action="workbench.handleWorkspaceAction">
        <section v-if="workbench.state.playback.active && !activePresentationIsPreview" ref="presentationConsoleRef"
          class="presentation-console"
          tabindex="0"
          @keydown="onPresentationConsoleKeydown"
          :class="{ open: presentationDrawerOpen }">
          <div class="presentation-console-body">
            <div v-if="activePresentation" class="presentation-console-header"
              :class="{ hidden: presentationDrawerOpen }">
              <p class="presentation-console-label">{{ t('presentation.modeLabel') }}</p>
              <h2 class="presentation-console-title">{{ activePresentation.fileName || t('presentation.liveTitle') }}</h2>
              <p class="presentation-console-meta">{{ `${(activePresentation.index ?? 0) + 1} / ${activePresentation.total ?? 0}` }}</p>
            </div>

            <div class="presentation-console-actions">
              <button class="presentation-console-button" type="button" @click="workbench.stepActivePlayback(-1)">
                <i class="mdi mdi-chevron-left" />
                <span>{{ t('presentation.previousSlide') }}</span>
              </button>
              <button class="presentation-console-button danger" type="button" @click="workbench.stopActivePlayback()">
                <i class="mdi mdi-stop" />
                <span>{{ t('presentation.stop') }}</span>
              </button>
              <button class="presentation-console-button" type="button" @click="workbench.stepActivePlayback(1)">
                <span>{{ t('presentation.nextSlide') }}</span>
                <i class="mdi mdi-chevron-right" />
              </button>
            </div>
          </div>

          <div v-if="activePlaybackConfiguration" class="presentation-console-panel-shell"
            :class="{ open: presentationDrawerOpen }">
            <button class="presentation-console-drawer-toggle" type="button"
              @click="presentationDrawerOpen = !presentationDrawerOpen">
              <i class="mdi" :class="presentationDrawerOpen ? 'mdi-chevron-down' : 'mdi-chevron-up'" />
              <span>{{ presentationDrawerOpen ? t('presentation.collapse') : t('presentation.configuration') }}</span>
            </button>

            <section class="presentation-console-panel">
              <div class="presentation-console-panel-body">
                <div class="presentation-console-drawer-header">
                  <p class="presentation-console-drawer-label">{{ t('presentation.currentConfiguration') }}</p>
                  <h3 class="presentation-console-drawer-title">{{ activePlaybackConfiguration.name || t('common.untitledConfiguration') }}</h3>
                </div>

                <ConfigurationEditor
                  :configuration="activePlaybackConfiguration"
                  :available-monitors="workbench.state.monitors"
                  :selected-monitor-key="workbench.state.selectedConfigurationMonitorKey"
                  :monitor-strip-height-gamma="workbench.state.settings.monitorStripHeightGamma"
                  @name-changed="workbench.updateSelectedConfigurationName"
                  @description-changed="workbench.updateSelectedConfigurationDescription"
                  @add-monitor="workbench.addMonitorToSelectedConfiguration"
                  @select-monitor="workbench.selectConfigurationMonitor"
                  @remove-monitor="workbench.removeMonitorFromSelectedConfiguration"
                  @reorder-monitors="workbench.reorderSelectedConfigurationMonitors"
                  @short-name-changed="
                    (deviceId, value) =>
                      workbench.updateSelectedConfigurationMonitor(deviceId, (monitor) => {
                        monitor.shortName = value;
                      })
                  "
                  @rotation-changed="
                    (deviceId, value, syncAll) =>
                      workbench.updateConfigurationMappingValue('rotation', value, deviceId, syncAll)
                  "
                  @mirror-changed="
                    (deviceId, value, syncAll) =>
                      workbench.updateConfigurationMappingValue('mirror', value, deviceId, syncAll)
                  "
                  @scale-x-changed="
                    (deviceId, value, syncAll) =>
                      workbench.updateConfigurationMappingValue('scaleX', value, deviceId, syncAll)
                  "
                  @scale-y-changed="
                    (deviceId, value, syncAll) =>
                      workbench.updateConfigurationMappingValue('scaleY', value, deviceId, syncAll)
                  "
                  @offset-x-changed="
                    (deviceId, value, syncAll) =>
                      workbench.updateConfigurationMappingValue('offsetX', value, deviceId, syncAll)
                  "
                  @offset-y-changed="
                    (deviceId, value, syncAll) =>
                      workbench.updateConfigurationMappingValue('offsetY', value, deviceId, syncAll)
                  "
                />
              </div>
            </section>
          </div>
        </section>

        <MonitorDetail v-else-if="workbench.state.currentPage === 'monitor'" :monitor="workbench.selectedMonitor.value"
          @friendly-name-changed="workbench.updateMonitorFriendlyName" @forget-monitor="
            workbench.handleMenuCommand('forget-monitor')
          " />

        <ConfigurationEditor v-else-if="workbench.state.currentPage === 'configuration'"
          :configuration="workbench.selectedConfiguration.value" :available-monitors="workbench.state.monitors"
          :selected-monitor-key="workbench.state.selectedConfigurationMonitorKey"
          :monitor-strip-height-gamma="workbench.state.settings.monitorStripHeightGamma" @name-changed="
            workbench.updateSelectedConfigurationName
          " @description-changed="
            workbench.updateSelectedConfigurationDescription
          " @create-configuration="workbench.createConfiguration" @add-monitor="workbench.addMonitorToSelectedConfiguration"
          @select-monitor="workbench.selectConfigurationMonitor"
          @remove-monitor="workbench.removeMonitorFromSelectedConfiguration"
          @reorder-monitors="workbench.reorderSelectedConfigurationMonitors" @short-name-changed="
            (deviceId, value) =>
              workbench.updateSelectedConfigurationMonitor(deviceId, (monitor) => {
                monitor.shortName = value;
              })
          " @rotation-changed="
            (deviceId, value, syncAll) =>
              workbench.updateConfigurationMappingValue('rotation', value, deviceId, syncAll)
          " @mirror-changed="
            (deviceId, value, syncAll) =>
              workbench.updateConfigurationMappingValue('mirror', value, deviceId, syncAll)
          " @scale-x-changed="
            (deviceId, value, syncAll) =>
              workbench.updateConfigurationMappingValue('scaleX', value, deviceId, syncAll)
          " @scale-y-changed="
            (deviceId, value, syncAll) =>
              workbench.updateConfigurationMappingValue('scaleY', value, deviceId, syncAll)
          " @offset-x-changed="
            (deviceId, value, syncAll) =>
              workbench.updateConfigurationMappingValue('offsetX', value, deviceId, syncAll)
          " @offset-y-changed="
            (deviceId, value, syncAll) =>
              workbench.updateConfigurationMappingValue('offsetY', value, deviceId, syncAll)
          " />

        <PlaylistEditor v-else-if="workbench.state.currentPage === 'playlist'"
          :playlist="workbench.selectedPlaylist.value" :configurations="workbench.state.configurations" :available-monitors="workbench.state.monitors"
          :monitor-strip-height-gamma="workbench.state.settings.monitorStripHeightGamma"
          @name-changed="workbench.updateSelectedPlaylistName"
          @source-folder-picked="workbench.choosePlaylistSourceFolder"
          @configuration-changed="workbench.updateSelectedPlaylistConfiguration"
          @create-configuration="workbench.createConfiguration"
          @visibility-changed="workbench.updateSelectedPlaylistEntryVisibility" />

        <SettingsView v-else-if="workbench.state.currentPage === 'settings'"
          :monitor-strip-height-gamma="workbench.state.settings.monitorStripHeightGamma"
          :theme-mode="workbench.state.settings.themeMode"
          @monitor-strip-gamma-changed="workbench.updateMonitorStripHeightGamma"
          @theme-mode-changed="workbench.updateThemeMode" />

        <AboutView v-else />
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

.presentation-media-canvas {
  position: absolute;
  inset: 0;
  transform-origin: center;
}

.presentation-media-surface {
  position: absolute;
  transform-origin: center;
  backface-visibility: hidden;
  will-change: transform;
}

.presentation-media-frame {
  position: absolute;
  left: 50%;
  top: 50%;
  overflow: hidden;
  transform: translate(-50%, -50%);
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
    repeating-linear-gradient(0deg,
      transparent 0,
      transparent 47px,
      rgba(255, 255, 255, 0.08) 47px,
      rgba(255, 255, 255, 0.08) 48px),
    repeating-linear-gradient(90deg,
      transparent 0,
      transparent 47px,
      rgba(255, 255, 255, 0.08) 47px,
      rgba(255, 255, 255, 0.08) 48px);
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
  left: 0;
  top: 0;
  object-fit: fill;
  transform-origin: center;
}

.presentation-console {
  position: relative;
  min-height: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
}

.presentation-console-body {
  min-height: 100%;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 28px;
  justify-content: center;
  padding: 40px 24px 96px;
  text-align: center;
}

.presentation-console-header {
  display: grid;
  gap: 10px;
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.presentation-console-header.hidden {
  opacity: 0;
  transform: translateY(18px);
  pointer-events: none;
}

.presentation-console-label {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.presentation-console-playlist {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.presentation-console-title {
  margin: 0;
  font-size: 28px;
  font-weight: var(--font-weight-ui-title);
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
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.presentation-console.open .presentation-console-actions {
  opacity: 0;
  transform: translateY(18px);
  pointer-events: none;
}

.presentation-console-panel-shell {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: min(1280px, calc(100% - 48px));
  height: min(80%, 80svh);
  z-index: 5;
  transform: translate(-50%, calc(100% - 18px));
  transition: transform 220ms ease;
  pointer-events: none;
}

.presentation-console-panel-shell.open {
  transform: translate(-50%, 0);
}

.presentation-console-panel {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-panel) var(--radius-panel) 0 0;
  background: var(--color-surface-elevated);
  box-shadow:
    0 -20px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  pointer-events: auto;
}

.presentation-console-drawer-header {
  display: grid;
  gap: 6px;
  margin-bottom: 14px;
  text-align: left;
}

.presentation-console-drawer-label {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.presentation-console-drawer-title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: var(--font-weight-ui-section);
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

.presentation-console-drawer-toggle {
  position: absolute;
  left: 50%;
  top: 0;
  z-index: 2;
  transform: translate(-50%, -50%);
  min-width: 112px;
  min-height: 36px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-secondary);
  transition:
    background-color 140ms ease,
    color 140ms ease,
    transform 220ms ease;
  pointer-events: auto;
}

.presentation-console-drawer-toggle .mdi {
  transition: transform 220ms ease;
}

.presentation-console-panel-shell.open .presentation-console-drawer-toggle .mdi {
  transform: rotate(180deg);
}

.presentation-console-panel {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}

.presentation-console-panel-body {
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 28px 18px 18px;
}

.presentation-console-drawer-toggle:hover {
  background: var(--color-pill-hover);
  color: var(--color-text-primary);
}
</style>
