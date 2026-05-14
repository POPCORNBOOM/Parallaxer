import { computed, reactive } from 'vue';
import { t } from '../i18n';
import type {
  AppSettings,
  ConfigurationMonitor,
  ConfigurationRecord,
  MirrorMode,
  MonitorRecord,
  PlaylistRecord,
  PresentationPayload,
  ThemeMode,
  Rotation
} from '../types';
import {
  buildConfigurationPreviewPayload,
  createCachedPlaylistRecord,
  createConfigurationDraft,
  createConfigurationMonitor,
  createEmptySettings,
  createPlaylistKey,
  createPlaylistDraft,
  normalizeAppSettings,
  normalizeMonitorStripHeightGamma,
  duplicateConfigurationRecord,
  findPlaylistBySourceFolder,
  getPlaylistSidebarCache,
  isConfigurationPreviewPayload,
  mergeMonitorHistory,
  normalizeConfigurationMonitorShortName,
  normalizePlaylistFolder,
  renumberConfigurationMonitors,
  removeRecentPlaylistFolder,
  setPlaylistSidebarCache,
  upsertPlaylistRecord,
  upsertRecentPlaylistFolder,
  validateConfiguration,
  validatePlaylist
} from '../lib/domain';
import {
  buildSidebarModel,
  getSidebarCollapseState,
  type SidebarAction,
  type WorkbenchPage,
  SIDEBAR_COLLAPSED_WIDTH,
  createSidebarWidth
} from '../lib/sidebar';
import {
  buildPlaybackPayload,
  createPlaybackSession,
  openPresentationWindows,
  startPlayback,
  stepPlayback,
  stopPlayback,
  type PlaybackContext,
  type PlaybackSession
} from '../lib/playback';
import {
  choosePlaylistFolder,
  deleteConfiguration,
  listConfigurations,
  listMonitors,
  loadAppSettings,
  readPlaylist,
  saveAppSettings,
  saveConfiguration,
  savePlaylist,
  scanPlaylistFolder,
  startPresentation,
  syncPresentation,
} from '../lib/tauri';
import { formatMonitorTitle, formatWorkspaceTitle } from '../lib/ui';

export interface WorkbenchState {
  monitors: MonitorRecord[];
  configurations: ConfigurationRecord[];
  playlists: PlaylistRecord[];
  settings: AppSettings;
  currentPage: WorkbenchPage;
  selectedMonitorId: string | null;
  selectedConfigurationId: string | null;
  selectedPlaylistId: string | null;
  selectedConfigurationMonitorKey: string | null;
  sidebarWidth: number;
  sidebarExpandedWidth: number;
  sidebarCollapsed: boolean;
  statusMessage: string;
  errorMessage: string;
  loading: boolean;
  playback: PlaybackSession;
  configurationPreviewActive: boolean;
  configurationPreviewId: string | null;
}

function normalizeMirrorMode(value: string | undefined): MirrorMode {
  if (value === 'horizontal' || value === 'vertical' || value === 'none') {
    return value;
  }

  return 'none';
}

function normalizeConfigurationMirrorModes(configurations: ConfigurationRecord[]): {
  configurations: ConfigurationRecord[];
  changed: boolean;
} {
  let changed = false;

  const normalizedConfigurations = configurations.map((configuration) => {
    const normalizedMonitors = configuration.monitors.map((monitor) => {
      const normalizedMirror = normalizeMirrorMode(monitor.mapping.mirror as string | undefined);
      if (monitor.mapping.mirror !== normalizedMirror) {
        changed = true;
      }

      return {
        ...monitor,
        mapping: {
          ...monitor.mapping,
          mirror: normalizedMirror
        }
      };
    });

    return {
      ...configuration,
      monitors: normalizedMonitors
    };
  });

  return {
    configurations: normalizedConfigurations,
    changed
  };
}

function sortByName<T extends { name?: string; friendlyName?: string; systemName?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) =>
    Number(Boolean((right as { favorite?: boolean }).favorite)) -
      Number(Boolean((left as { favorite?: boolean }).favorite)) ||
    String(left.name ?? left.friendlyName ?? left.systemName ?? '').localeCompare(
      String(right.name ?? right.friendlyName ?? right.systemName ?? '')
    )
  );
}

export function useWorkbench() {
  const defaultSidebarWidth = 264;
  const autosaveDebounceMs = 320;
  let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let configurationSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let playlistSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingConfigurationSaveId: string | null = null;
  const pendingPlaylistSaveIds = new Set<string>();

  const state = reactive<WorkbenchState>({
    monitors: [],
    configurations: [],
    playlists: [],
    settings: createEmptySettings(),
    currentPage: 'settings',
    selectedMonitorId: null,
    selectedConfigurationId: null,
    selectedPlaylistId: null,
    selectedConfigurationMonitorKey: null,
    sidebarWidth: defaultSidebarWidth,
    sidebarExpandedWidth: defaultSidebarWidth,
    sidebarCollapsed: false,
    statusMessage: t('common.ready'),
    errorMessage: '',
    loading: false,
    playback: createPlaybackSession(),
    configurationPreviewActive: false,
    configurationPreviewId: null
  });

  const selectedMonitor = computed(
    () => state.monitors.find((item) => item.deviceId === state.selectedMonitorId) ?? null
  );
  const selectedConfiguration = computed(
    () => state.configurations.find((item) => item.id === state.selectedConfigurationId) ?? null
  );
  const selectedPlaylist = computed(
    () => state.playlists.find((item) => item.id === state.selectedPlaylistId) ?? null
  );
  const selectedPlaylistConfiguration = computed(
    () =>
      state.configurations.find((item) => item.id === selectedPlaylist.value?.configurationId) ?? null
  );

  const sidebarModel = computed(() =>
    buildSidebarModel({
      monitors: state.monitors,
      configurations: state.configurations,
      playlists: state.playlists,
      currentPage: state.currentPage,
      selectedMonitorId: state.selectedMonitorId,
      selectedConfigurationId: state.selectedConfigurationId,
      selectedPlaylistId: state.selectedPlaylistId
    })
  );

  const workspaceTitle = computed(() => {
    if (state.playback.active && !state.configurationPreviewActive) {
      const playlist = state.playlists.find((item) => item.id === state.playback.playlistId) ?? null;
      return playlist?.name
        ? t('shell.workspace.presentationModeWithPlaylist', { name: playlist.name })
        : t('shell.workspace.presentationMode');
    }

    if (state.currentPage === 'monitor') {
      return selectedMonitor.value ? formatMonitorTitle(selectedMonitor.value) : t('shell.page.monitors');
    }

    if (state.currentPage === 'configuration') {
      return selectedConfiguration.value?.name || t('shell.page.configurations');
    }

    if (state.currentPage === 'playlist') {
      return (
        formatWorkspaceTitle({
          playlist: selectedPlaylist.value,
          configuration: selectedPlaylistConfiguration.value
        }) || t('shell.page.playlists')
      );
    }

    if (state.currentPage === 'about') {
      return t('about.title');
    }

    return t('shell.page.settings');
  });

  const workspaceActions = computed<SidebarAction[]>(() => {
    if (state.playback.active && !state.configurationPreviewActive) {
      return [
        { key: 'presentation-previous', hoverTip: t('shell.action.previous'), icon: 'mdi-chevron-left' },
        { key: 'presentation-stop', hoverTip: t('shell.action.stop'), icon: 'mdi-stop' },
        { key: 'presentation-next', hoverTip: t('shell.action.next'), icon: 'mdi-chevron-right' }
      ];
    }

    if (state.currentPage === 'monitor' && selectedMonitor.value && !selectedMonitor.value.connected) {
      return [
        {
          key: 'forget-monitor',
          hoverTip: t('shell.action.forgetMonitor'),
          icon: 'mdi-close',
          color: 'var(--color-danger-text)'
        }
      ];
    }

    if (state.currentPage === 'configuration' && selectedConfiguration.value) {
      return [
        {
          key: 'preview-configuration',
          hoverTip: state.configurationPreviewActive ? t('shell.action.stopPreview') : t('shell.action.previewConfiguration'),
          icon: state.configurationPreviewActive ? 'mdi-eye-off-outline' : 'mdi-monitor-eye'
        },
        { key: 'duplicate-configuration', hoverTip: t('shell.action.duplicateConfiguration'), icon: 'mdi-content-copy' }
      ];
    }

    if (state.currentPage === 'playlist' && selectedPlaylist.value) {
      return [
        { key: 'play-playlist', hoverTip: t('shell.action.playPlaylist'), icon: 'mdi-play-outline' }
      ];
    }

    return [];
  });

  function clearError(): void {
    state.errorMessage = '';
  }

  function setError(message: string): void {
    state.errorMessage = message;
  }

  function setStatus(message: string): void {
    state.statusMessage = message;
    clearError();
  }

  async function persistSettingsNow(): Promise<void> {
    await saveAppSettings(state.settings);
  }

  function queueSettingsSave(): void {
    if (settingsSaveTimer) {
      clearTimeout(settingsSaveTimer);
    }

    settingsSaveTimer = setTimeout(() => {
      settingsSaveTimer = null;
      void persistSettingsNow().catch((error) => {
        setError(error instanceof Error ? error.message : String(error));
      });
    }, autosaveDebounceMs);
  }

  async function persistConfigurationDraftById(configurationId: string | null): Promise<void> {
    if (!configurationId) {
      return;
    }

    const configuration = state.configurations.find((item) => item.id === configurationId) ?? null;
    if (!configuration) {
      return;
    }

    const savedConfiguration = await saveConfiguration(configuration);
    reconcileSavedConfiguration(configurationId, savedConfiguration);
  }

  function queueConfigurationSave(configurationId: string | null): void {
    pendingConfigurationSaveId = configurationId;
    if (configurationSaveTimer) {
      clearTimeout(configurationSaveTimer);
    }

    configurationSaveTimer = setTimeout(() => {
      const targetId = pendingConfigurationSaveId;
      configurationSaveTimer = null;
      pendingConfigurationSaveId = null;
      void persistConfigurationDraftById(targetId).catch((error) => {
        setError(error instanceof Error ? error.message : String(error));
      });
    }, autosaveDebounceMs);
  }

  async function persistQueuedPlaylistDrafts(): Promise<void> {
    const playlistIds = [...pendingPlaylistSaveIds];
    pendingPlaylistSaveIds.clear();
    await Promise.all(
      playlistIds.map(async (playlistId) => {
        const playlist = state.playlists.find((item) => item.id === playlistId) ?? null;
        await persistPlaylistDraft(playlist);
      })
    );
  }

  function queuePlaylistSave(playlistId: string | null): void {
    if (!playlistId) {
      return;
    }

    pendingPlaylistSaveIds.add(playlistId);
    if (playlistSaveTimer) {
      clearTimeout(playlistSaveTimer);
    }

    playlistSaveTimer = setTimeout(() => {
      playlistSaveTimer = null;
      void persistQueuedPlaylistDrafts().catch((error) => {
        setError(error instanceof Error ? error.message : String(error));
      });
    }, autosaveDebounceMs);
  }

  function reconcileSavedConfiguration(previousId: string, savedConfiguration: ConfigurationRecord): void {
    const previousSelectedMonitorKey = state.selectedConfigurationMonitorKey;

    state.configurations = sortByName([
      savedConfiguration,
      ...state.configurations.filter((item) => item.id !== previousId)
    ]);

    if (savedConfiguration.id === previousId) {
      return;
    }

    const affectedPlaylistIds: string[] = [];
    for (const playlist of state.playlists) {
      if (playlist.configurationId === previousId) {
        playlist.configurationId = savedConfiguration.id;
        affectedPlaylistIds.push(playlist.id);
      }
    }

    if (state.selectedConfigurationId === previousId) {
      state.selectedConfigurationId = savedConfiguration.id;
      const selectedMonitorStillExists = savedConfiguration.monitors.some(
        (monitor) => monitor.deviceId === previousSelectedMonitorKey
      );
      state.selectedConfigurationMonitorKey = selectedMonitorStillExists
        ? previousSelectedMonitorKey
        : savedConfiguration.monitors[0]?.deviceId ?? null;
    }

    if (
      state.settings.lastSelectedPage === 'configuration' &&
      state.settings.lastSelectedEntityId === previousId
    ) {
      state.settings.lastSelectedEntityId = savedConfiguration.id;
      queueSettingsSave();
    }

    if (state.playback.configurationId === previousId) {
      state.playback.configurationId = savedConfiguration.id;
    }

    if (state.playback.payload?.configurationId === previousId) {
      state.playback.payload = {
        ...state.playback.payload,
        configurationId: savedConfiguration.id
      };
    }

    if (state.configurationPreviewId === previousId) {
      state.configurationPreviewId = savedConfiguration.id;
    }

    affectedPlaylistIds.forEach((playlistId) => queuePlaylistSave(playlistId));
  }

  async function refreshMonitors(): Promise<void> {
    const monitors = await listMonitors();
    const overrides = state.settings.monitorOverrides;
    const mergedMonitors = mergeMonitorHistory({
      currentMonitors: monitors,
      historyMonitors: state.settings.monitorHistory ?? [],
      monitorOverrides: overrides
    });

    state.settings.monitorHistory = mergedMonitors.map((monitor) => ({
      ...monitor,
      connected: false
    }));

    state.monitors = sortByName(mergedMonitors);
    queueSettingsSave();
  }

  async function refreshConfigurations(): Promise<void> {
    const normalized = normalizeConfigurationMirrorModes(await listConfigurations());
    state.configurations = sortByName(normalized.configurations);

    if (normalized.changed) {
      await Promise.all(normalized.configurations.map((configuration) => saveConfiguration(configuration)));
    }
  }

  async function loadPlaylistCandidates(): Promise<void> {
    const folders = state.settings.recentPlaylistFolders ?? [];
    const sidebarCache = getPlaylistSidebarCache(state.settings);
    const playlists = await Promise.all(
      folders.map(async (folder) => {
        const playlist = await readPlaylist(folder);
        const normalizedFolder = folder.replace(/\\/g, '/').replace(/\/+$/g, '');
        const cachedPlaylist = playlist
          ? { ...playlist, id: createPlaylistKey(normalizedFolder), sourceFolder: normalizedFolder }
          : createCachedPlaylistRecord(normalizedFolder);
        const cacheEntry = sidebarCache[normalizedFolder];

        return {
          ...cachedPlaylist,
          favorite: cacheEntry?.favorite === true
        } as PlaylistRecord & { favorite?: boolean };
      })
    );
    state.playlists = sortByName(playlists as PlaylistRecord[]);
  }

  function restoreSavedSelection(): void {
    const savedId = state.settings.lastSelectedEntityId ?? null;
    switch (state.currentPage) {
      case 'monitor':
        state.selectedMonitorId =
          savedId && state.monitors.some((item) => item.deviceId === savedId) ? savedId : null;
        return;
      case 'configuration':
        state.selectedConfigurationId =
          savedId && state.configurations.some((item) => item.id === savedId) ? savedId : null;
        state.selectedConfigurationMonitorKey =
          state.configurations.find((item) => item.id === state.selectedConfigurationId)?.monitors[0]?.deviceId ??
          null;
        return;
      case 'playlist':
      state.selectedPlaylistId =
          savedId &&
          state.playlists.some((item) => item.id === savedId || createPlaylistKey(item.sourceFolder) === savedId)
            ? (state.playlists.find((item) => item.id === savedId || createPlaylistKey(item.sourceFolder) === savedId)
                ?.id ?? null)
            : null;
        return;
      default:
        return;
    }
  }

  function ensureSelection(): void {
    if (state.currentPage === 'monitor' && !selectedMonitor.value && state.monitors[0]) {
      state.selectedMonitorId = state.monitors[0].deviceId;
    }

    if (state.currentPage === 'configuration' && !selectedConfiguration.value && state.configurations[0]) {
      state.selectedConfigurationId = state.configurations[0].id;
      state.selectedConfigurationMonitorKey = state.configurations[0].monitors[0]?.deviceId ?? null;
    }

    if (state.currentPage === 'playlist' && !selectedPlaylist.value && state.playlists[0]) {
      state.selectedPlaylistId = state.playlists[0].id;
    }
  }

  async function bootstrap(): Promise<void> {
    state.loading = true;
    try {
      state.settings = normalizeAppSettings(await loadAppSettings());
      state.sidebarCollapsed = false;
      state.sidebarExpandedWidth = createSidebarWidth(state.sidebarExpandedWidth);
      state.sidebarWidth = state.sidebarExpandedWidth;
      await refreshMonitors();
      await refreshConfigurations();
      await loadPlaylistCandidates();
      state.currentPage = (state.settings.lastSelectedPage as WorkbenchPage | undefined) ?? 'settings';
      restoreSavedSelection();
      ensureSelection();
      setStatus(t('workbench.status.ready'));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      state.loading = false;
    }
  }

  async function persistSettings(): Promise<void> {
    await persistSettingsNow();
  }

  function updateMonitorStripHeightGamma(value: number): void {
    const normalized = normalizeMonitorStripHeightGamma(value);
    if (normalized === state.settings.monitorStripHeightGamma) {
      return;
    }

    state.settings.monitorStripHeightGamma = normalized;
    queueSettingsSave();
    void syncConfigurationPreviewIfNeeded();
  }

  function updateThemeMode(value: ThemeMode): void {
    if (state.settings.themeMode === value) {
      return;
    }

    state.settings.themeMode = value;
    queueSettingsSave();
  }

  function selectPage(page: WorkbenchPage): void {
    if (page !== 'configuration') {
      void stopConfigurationPreviewIfNeeded();
    }
    state.currentPage = page;
    state.settings.lastSelectedPage = page;
    ensureSelection();
    queueSettingsSave();
  }

  function selectMonitor(deviceId: string): void {
    void stopConfigurationPreviewIfNeeded();
    state.currentPage = 'monitor';
    state.selectedMonitorId = deviceId;
    state.settings.lastSelectedPage = 'monitor';
    state.settings.lastSelectedEntityId = deviceId;
    queueSettingsSave();
  }

  function selectConfiguration(id: string): void {
    if (state.configurationPreviewActive && state.configurationPreviewId && state.configurationPreviewId !== id) {
      void stopConfigurationPreviewIfNeeded();
    }
    state.currentPage = 'configuration';
    state.selectedConfigurationId = id;
    state.selectedConfigurationMonitorKey =
      state.configurations.find((configuration) => configuration.id === id)?.monitors[0]?.deviceId ?? null;
    state.settings.lastSelectedPage = 'configuration';
    state.settings.lastSelectedEntityId = id;
    queueSettingsSave();
  }

  function selectConfigurationMonitor(deviceId: string): void {
    state.selectedConfigurationMonitorKey = deviceId;
    void syncConfigurationPreviewIfNeeded();
  }

  function selectPlaylist(id: string): void {
    void stopConfigurationPreviewIfNeeded();
    state.currentPage = 'playlist';
    state.selectedPlaylistId = id;
    state.settings.lastSelectedPage = 'playlist';
    state.settings.lastSelectedEntityId = id;
    queueSettingsSave();
  }

  async function updateMonitorFriendlyName(value: string): Promise<void> {
    const monitor = selectedMonitor.value;
    if (!monitor) {
      return;
    }

    monitor.friendlyName = value;
    state.settings.monitorOverrides[monitor.deviceId] = { friendlyName: value };
    queueSettingsSave();
    setStatus(t('workbench.status.monitorLabelSaved'));
  }

  function forgetMonitor(deviceId: string): void {
    const monitor = state.monitors.find((item) => item.deviceId === deviceId);
    if (!monitor || monitor.connected) {
      return;
    }

    state.monitors = state.monitors.filter((item) => item.deviceId !== deviceId);
    state.settings.monitorHistory = (state.settings.monitorHistory ?? []).filter(
      (item) => item.deviceId !== deviceId
    );
    delete state.settings.monitorOverrides[deviceId];

    if (state.selectedMonitorId === deviceId) {
      state.selectedMonitorId = state.monitors[0]?.deviceId ?? null;
    }

    queueSettingsSave();
    ensureSelection();
    setStatus(t('workbench.status.monitorForgotten'));
  }

  function updateSelectedConfigurationName(value: string): void {
    mutateSelectedConfiguration((configuration) => {
      configuration.name = value;
    });
    queueConfigurationSave(state.selectedConfigurationId);
  }

  function updateSelectedConfigurationDescription(value: string): void {
    mutateSelectedConfiguration((configuration) => {
      configuration.description = value;
    });
    queueConfigurationSave(state.selectedConfigurationId);
  }

  function mutateSelectedConfiguration(mutator: (configuration: ConfigurationRecord) => void): void {
    const configuration = selectedConfiguration.value;
    if (!configuration) {
      return;
    }

    mutator(configuration);
  }

  function createConfiguration(): void {
    const configuration = createConfigurationDraft();
    configuration.name = `${t('domain.defaultConfigurationName')} ${state.configurations.length + 1}`;
    state.configurations.unshift(configuration);
    selectConfiguration(configuration.id);
    queueConfigurationSave(configuration.id);
  }

  async function saveSelectedConfiguration(): Promise<void> {
    const configuration = selectedConfiguration.value;
    if (!configuration) {
      return;
    }

    if (configurationSaveTimer) {
      clearTimeout(configurationSaveTimer);
      configurationSaveTimer = null;
    }
    pendingConfigurationSaveId = null;
    await persistConfigurationDraftById(configuration.id);
    await syncActivePresentationIfNeeded();
    setStatus(t('workbench.status.configurationSaved'));
  }

  async function toggleConfigurationFavorite(id: string): Promise<void> {
    const configuration = state.configurations.find((item) => item.id === id);
    if (!configuration) {
      return;
    }

    configuration.favorite = !configuration.favorite;
    state.configurations = sortByName(state.configurations);
    queueConfigurationSave(configuration.id);
    setStatus(configuration.favorite ? t('workbench.status.configurationFavorited') : t('workbench.status.configurationUnfavorited'));
  }

  async function deleteConfigurationById(id: string): Promise<void> {
    await deleteConfiguration(id);
    state.configurations = state.configurations.filter((item) => item.id !== id);
    state.selectedConfigurationId = state.configurations[0]?.id ?? null;
    state.selectedConfigurationMonitorKey = state.configurations[0]?.monitors[0]?.deviceId ?? null;
    setStatus(t('workbench.status.configurationDeleted'));
  }

  function duplicateSelectedConfiguration(): void {
    const configuration = selectedConfiguration.value;
    if (!configuration) {
      return;
    }

    const duplicated = duplicateConfigurationRecord(configuration);
    state.configurations = sortByName([duplicated, ...state.configurations]);
    selectConfiguration(duplicated.id);
    queueConfigurationSave(duplicated.id);
    setStatus(t('workbench.status.configurationDuplicated'));
  }

  function addMonitorToSelectedConfiguration(deviceId: string): void {
    if (!deviceId) {
      return;
    }

    mutateSelectedConfiguration((configuration) => {
      if (configuration.monitors.some((monitor) => monitor.deviceId === deviceId)) {
        return;
      }

      configuration.monitors = [
        ...configuration.monitors,
        createConfigurationMonitor(deviceId, configuration.monitors.length)
      ];
      configuration.monitors = renumberConfigurationMonitors(configuration.monitors);
      state.selectedConfigurationMonitorKey = deviceId;
    });
    queueConfigurationSave(state.selectedConfigurationId);
    void syncActivePresentationIfNeeded();
  }

  function removeMonitorFromSelectedConfiguration(deviceId: string): void {
    mutateSelectedConfiguration((configuration) => {
      configuration.monitors = renumberConfigurationMonitors(
        configuration.monitors.filter((monitor) => monitor.deviceId !== deviceId)
      );
      state.selectedConfigurationMonitorKey = configuration.monitors[0]?.deviceId ?? null;
    });
    queueConfigurationSave(state.selectedConfigurationId);
    void syncActivePresentationIfNeeded();
  }

  function updateSelectedConfigurationMonitor(
    deviceId: string,
    mutator: (monitor: ConfigurationMonitor) => void
  ): void {
    mutateSelectedConfiguration((configuration) => {
      const target = configuration.monitors.find((monitor) => monitor.deviceId === deviceId);
      if (!target) {
        return;
      }

      mutator(target);
    });
    queueConfigurationSave(state.selectedConfigurationId);
    void syncActivePresentationIfNeeded();
  }

  function updateConfigurationMappingValue(
    field: 'rotation' | 'mirror' | 'scaleX' | 'scaleY' | 'offsetX' | 'offsetY',
    value: Rotation | MirrorMode | number,
    deviceId: string,
    syncAll = false
  ): void {
    mutateSelectedConfiguration((configuration) => {
      const targets = syncAll
        ? configuration.monitors
        : configuration.monitors.filter((monitor) => monitor.deviceId === deviceId);

      for (const monitor of targets) {
        switch (field) {
          case 'rotation':
            monitor.mapping.rotation = value as Rotation;
            break;
          case 'mirror':
            monitor.mapping.mirror = value as MirrorMode;
            break;
          case 'scaleX':
            monitor.mapping.scaleX = value as number;
            break;
          case 'scaleY':
            monitor.mapping.scaleY = value as number;
            break;
          case 'offsetX':
            monitor.mapping.offsetX = value as number;
            break;
          case 'offsetY':
            monitor.mapping.offsetY = value as number;
            break;
        }
      }
    });
    queueConfigurationSave(state.selectedConfigurationId);
    void syncActivePresentationIfNeeded();
  }

  function reorderSelectedConfigurationMonitors(orderedDeviceIds: string[]): void {
    mutateSelectedConfiguration((configuration) => {
      const byId = new Map(configuration.monitors.map((monitor) => [monitor.deviceId, monitor]));
      const reordered = orderedDeviceIds
        .map((deviceId) => byId.get(deviceId))
        .filter((monitor): monitor is ConfigurationMonitor => Boolean(monitor))
        .map((monitor, index) => ({
          ...monitor,
          order: index
        }));

      if (reordered.length !== configuration.monitors.length) {
        return;
      }

      configuration.monitors = reordered;
    });
    queueConfigurationSave(state.selectedConfigurationId);
    void syncActivePresentationIfNeeded();
  }

  function createPlaylist(): PlaylistRecord {
    const playlist = createPlaylistDraft();
    playlist.name = `${t('shell.page.playlists')} ${state.playlists.length + 1}`;
    state.playlists.unshift(playlist);
    selectPlaylist(playlist.id);
    return playlist;
  }

  function ensureEditablePlaylist(): PlaylistRecord {
    return selectedPlaylist.value ?? createPlaylist();
  }

  function isTransientPlaylistDraft(playlist: PlaylistRecord | null): boolean {
    return Boolean(playlist && !playlist.sourceFolder.trim());
  }

  async function persistPlaylistDraft(playlist: PlaylistRecord | null): Promise<void> {
    if (!playlist?.sourceFolder.trim()) {
      return;
    }

    playlist.id = createPlaylistKey(playlist.sourceFolder);
    playlist.playlistFilePath = `${playlist.sourceFolder.replace(/\\/g, '/').replace(/\/+$/g, '')}/playlist.json`;
    await savePlaylist(playlist);
  }

  async function updateSelectedPlaylistName(value: string): Promise<void> {
    const playlist = selectedPlaylist.value;
    if (!playlist) {
      return;
    }

    playlist.name = value;
    queuePlaylistSave(playlist.id);
  }

  async function updateSelectedPlaylistConfiguration(configurationId: string): Promise<void> {
    const playlist = selectedPlaylist.value;
    if (!playlist) {
      return;
    }

    playlist.configurationId = configurationId;
    await regeneratePlaylist(playlist);
  }

  async function updateSelectedPlaylistEntryVisibility(
    fileName: string,
    visibility: boolean
  ): Promise<void> {
    const playlist = selectedPlaylist.value;
    const entry = playlist?.entries.find((item) => item.fileName === fileName);
    if (!playlist || !entry) {
      return;
    }

    entry.visibility = visibility;
    queuePlaylistSave(playlist.id);
    setStatus(t('workbench.status.playlistItemVisibilityUpdated'));
  }

  function getConfigurationById(id: string | null | undefined): ConfigurationRecord | null {
    return state.configurations.find((item) => item.id === id) ?? null;
  }

  function buildPlaybackContextFromSelection(): PlaybackContext | null {
    const playlist = selectedPlaylist.value;
    const configuration = getConfigurationById(playlist?.configurationId);
    if (!playlist || !configuration) {
      return null;
    }

    return {
      playlist,
      configuration,
      monitors: state.monitors
    };
  }

  function buildPlaybackContextFromSession(): PlaybackContext | null {
    const playlist = state.playlists.find((item) => item.id === state.playback.playlistId) ?? null;
    const configuration = getConfigurationById(state.playback.configurationId);
    if (!playlist || !configuration) {
      return null;
    }

    return {
      playlist,
      configuration,
      monitors: state.monitors
    };
  }

  function buildMonitorFramesByDeviceId(): Record<
    string,
    { width: number; height: number; scaleFactor?: number }
  > {
    return Object.fromEntries(
      state.monitors.map((monitor) => [
        monitor.deviceId,
        {
          width: monitor.size.width,
          height: monitor.size.height,
          scaleFactor: monitor.scaleFactor
        }
      ])
    );
  }

  async function choosePlaylistSourceFolder(): Promise<void> {
    const folder = await choosePlaylistFolder();
    if (!folder) {
      return;
    }

    const normalizedFolder = normalizePlaylistFolder(folder);
    const existingPlaylist = findPlaylistBySourceFolder(state.playlists, normalizedFolder);
    if (existingPlaylist) {
      selectPlaylist(existingPlaylist.id);
      setStatus(t('workbench.status.playlistFolderOpened'));
      return;
    }

    const persistedPlaylist = await readPlaylist(normalizedFolder);
    const basePlaylist =
      persistedPlaylist ??
      (isTransientPlaylistDraft(selectedPlaylist.value)
        ? selectedPlaylist.value
        : createCachedPlaylistRecord(normalizedFolder));
    const playlist = {
      ...basePlaylist,
      id: createPlaylistKey(normalizedFolder),
      sourceFolder: normalizedFolder,
      playlistFilePath: `${normalizedFolder}/playlist.json`
    } as PlaylistRecord;

    state.playlists = sortByName(upsertPlaylistRecord(state.playlists, playlist));
    state.settings.recentPlaylistFolders = upsertRecentPlaylistFolder(
      state.settings.recentPlaylistFolders,
      normalizedFolder
    );
    queueSettingsSave();
    selectPlaylist(playlist.id);
    await regenerateSelectedPlaylist();
  }

  async function regeneratePlaylist(playlist: PlaylistRecord | null): Promise<void> {
    if (!playlist) {
      return;
    }

    const configuration = getConfigurationById(playlist.configurationId);
    const monitors = configuration?.monitors ?? [];
    if (!playlist.sourceFolder.trim()) {
      playlist.entries = [];
      return;
    }

    if (monitors.length === 0) {
      playlist.entries = [];
      queuePlaylistSave(playlist.id);
      setStatus(t('workbench.status.selectConfigurationToGenerateEntries'));
      return;
    }

    playlist.entries = await scanPlaylistFolder(playlist.sourceFolder, monitors, playlist.entries);
    queuePlaylistSave(playlist.id);
    setStatus(t('workbench.status.playlistRegenerated'));
  }

  async function regenerateSelectedPlaylist(): Promise<void> {
    await regeneratePlaylist(selectedPlaylist.value);
  }

  async function rescanPlaylistById(id: string): Promise<void> {
    const playlist = state.playlists.find((item) => item.id === id) ?? null;
    if (playlist) {
      selectPlaylist(id);
      await regeneratePlaylist(playlist);
    }
  }

  async function saveSelectedPlaylist(): Promise<void> {
    const playlist = selectedPlaylist.value;
    if (!playlist) {
      return;
    }

    if (playlistSaveTimer) {
      clearTimeout(playlistSaveTimer);
      playlistSaveTimer = null;
    }
    pendingPlaylistSaveIds.delete(playlist.id);
    await persistPlaylistDraft(playlist);
    state.settings.recentPlaylistFolders = upsertRecentPlaylistFolder(
      state.settings.recentPlaylistFolders,
      playlist.sourceFolder
    );
    queueSettingsSave();
    await loadPlaylistCandidates();
    selectPlaylist(createPlaylistKey(playlist.sourceFolder));
    setStatus(t('workbench.status.playlistSaved'));
  }

  async function togglePlaylistFavorite(id: string): Promise<void> {
    const playlist = state.playlists.find((item) => item.id === id);
    if (!playlist) {
      return;
    }

    const folder = playlist.sourceFolder.replace(/\\/g, '/').replace(/\/+$/g, '');
    const cache = getPlaylistSidebarCache(state.settings);
    cache[folder] = {
      favorite: !Boolean((playlist as PlaylistRecord & { favorite?: boolean }).favorite)
    };
    setPlaylistSidebarCache(state.settings, cache);
    (playlist as PlaylistRecord & { favorite?: boolean }).favorite = cache[folder]?.favorite === true;
    state.playlists = sortByName(state.playlists);
    queueSettingsSave();
    setStatus(cache[folder]?.favorite ? t('workbench.status.playlistFavorited') : t('workbench.status.playlistUnfavorited'));
  }

  async function removePlaylistFromSidebar(id: string): Promise<void> {
    const playlist = state.playlists.find((item) => item.id === id);
    if (!playlist) {
      return;
    }

    const folder = playlist.sourceFolder;
    state.settings.recentPlaylistFolders = removeRecentPlaylistFolder(
      state.settings.recentPlaylistFolders,
      folder
    );
    const cache = getPlaylistSidebarCache(state.settings);
    delete cache[folder.replace(/\\/g, '/').replace(/\/+$/g, '')];
    setPlaylistSidebarCache(state.settings, cache);
    queueSettingsSave();
    state.playlists = state.playlists.filter((item) => item.id !== id);
    if (state.selectedPlaylistId === id) {
      state.selectedPlaylistId = state.playlists[0]?.id ?? null;
    }
    setStatus(t('workbench.status.playlistRemovedFromSidebar'));
  }

  async function playSelectedPlaylist(): Promise<void> {
    await flushPendingPersistence();
    const context = buildPlaybackContextFromSelection();
    if (!context) {
      setError(t('workbench.error.selectPlaylistAndConfigurationFirst'));
      return;
    }

    const connectedMonitorIds = new Set(state.monitors.filter((item) => item.connected).map((item) => item.deviceId));
    const errors = validatePlaylist(context.playlist, context.configuration, connectedMonitorIds);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    state.selectedConfigurationId = context.configuration.id;
    state.selectedConfigurationMonitorKey =
      context.configuration.monitors[0]?.deviceId ?? state.selectedConfigurationMonitorKey;
    const payload = await startPlayback(state.playback, context, 0);
    setStatus(t('workbench.status.presentationStarted', { fileName: payload.fileName }));
  }

  async function previewSelectedConfiguration(): Promise<void> {
    const configuration = selectedConfiguration.value;
    if (!configuration) {
      setError(t('workbench.error.selectConfigurationFirst'));
      return;
    }

    const errors = validateConfiguration(configuration);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    const connectedMonitorIds = new Set(state.monitors.filter((item) => item.connected).map((item) => item.deviceId));
    for (const monitor of configuration.monitors) {
      if (!connectedMonitorIds.has(monitor.deviceId)) {
        setError(t('domain.validation.configurationMonitorNotConnected', { shortName: monitor.shortName }));
        return;
      }
    }

    if (state.configurationPreviewActive && state.configurationPreviewId === configuration.id) {
      await stopConfigurationPreviewIfNeeded();
      return;
    }

    const payload = buildConfigurationPreviewPayload(
      configuration,
      state.selectedConfigurationMonitorKey,
      buildMonitorFramesByDeviceId()
    );
    if (state.playback.active) {
      await stopPlayback(state.playback).catch(() => undefined);
    }
    await startPresentation(payload);
    await openPresentationWindows(payload, state.monitors);
    await syncPresentation(payload);
    state.playback.active = true;
    state.playback.playlistId = null;
    state.playback.configurationId = configuration.id;
    state.playback.currentIndex = 0;
    state.playback.payload = payload;
    state.configurationPreviewActive = true;
    state.configurationPreviewId = configuration.id;
    setStatus(t('workbench.status.configurationPreviewStarted'));
  }

  async function stepActivePlayback(delta: number): Promise<void> {
    if (!state.playback.active) {
      return;
    }

    if (isConfigurationPreviewPayload(state.playback.payload)) {
      return;
    }

    const context = buildPlaybackContextFromSession();
    if (!context) {
      await stopActivePlayback();
      return;
    }

    const payload = await stepPlayback(state.playback, context, delta);
    if (payload) {
      setStatus(t('workbench.status.showing', { fileName: payload.fileName }));
    }
  }

  async function stopActivePlayback(): Promise<void> {
    if (!state.playback.active) {
      return;
    }

    await stopPlayback(state.playback);
    state.configurationPreviewActive = false;
    state.configurationPreviewId = null;
    setStatus(t('workbench.status.presentationStopped'));
  }

  async function stopConfigurationPreviewIfNeeded(): Promise<void> {
    if (!state.configurationPreviewActive) {
      return;
    }

    await stopActivePlayback();
  }

  async function syncConfigurationPreviewIfNeeded(): Promise<void> {
    if (!state.configurationPreviewActive) {
      return;
    }

    const configuration = selectedConfiguration.value;
    if (!configuration || state.configurationPreviewId !== configuration.id) {
      await stopConfigurationPreviewIfNeeded();
      return;
    }

    const errors = validateConfiguration(configuration);
    if (errors.length > 0) {
      return;
    }

    const connectedMonitorIds = new Set(state.monitors.filter((item) => item.connected).map((item) => item.deviceId));
    if (configuration.monitors.some((monitor) => !connectedMonitorIds.has(monitor.deviceId))) {
      return;
    }

    const payload = buildConfigurationPreviewPayload(
      configuration,
      state.selectedConfigurationMonitorKey,
      buildMonitorFramesByDeviceId()
    );
    await syncPresentation(payload);
    state.playback.payload = payload;
    state.playback.configurationId = configuration.id;
    state.playback.currentIndex = 0;
  }

  async function syncActivePresentationIfNeeded(): Promise<void> {
    if (!state.playback.active) {
      return;
    }

    if (state.configurationPreviewActive) {
      await syncConfigurationPreviewIfNeeded();
      return;
    }

    const context = buildPlaybackContextFromSession();
    if (!context) {
      return;
    }

    const nextPayload = buildPlaybackPayload(context, state.playback.currentIndex);
    const currentLabels = new Set(state.playback.payload?.displays.map((display) => display.windowLabel) ?? []);
    const nextLabels = new Set(nextPayload.displays.map((display) => display.windowLabel));
    const topologyChanged =
      currentLabels.size !== nextLabels.size ||
      [...nextLabels].some((label) => !currentLabels.has(label));

    if (topologyChanged) {
      const currentIndex = state.playback.currentIndex;
      await stopPlayback(state.playback);
      await startPlayback(state.playback, context, currentIndex);
      return;
    }

    await syncPresentation(nextPayload);
    state.playback.payload = nextPayload;
    state.playback.configurationId = context.configuration.id;
  }

  function syncPlaybackState(payload: PresentationPayload | null): void {
    if (!payload?.active) {
      state.playback.active = false;
      state.playback.playlistId = null;
      state.playback.configurationId = null;
      state.playback.currentIndex = 0;
      state.playback.payload = null;
      state.configurationPreviewActive = false;
      state.configurationPreviewId = null;
      setStatus(t('workbench.status.presentationStopped'));
      return;
    }

    state.playback.active = true;
    state.playback.playlistId = payload.playlistId;
    state.playback.configurationId = payload.configurationId;
    state.playback.currentIndex = payload.index;
    state.playback.payload = payload;
    state.configurationPreviewActive = isConfigurationPreviewPayload(payload);
    state.configurationPreviewId = state.configurationPreviewActive ? payload.configurationId : null;
    if (payload.configurationId) {
      state.selectedConfigurationId = payload.configurationId;
      const syncedConfiguration = state.configurations.find((item) => item.id === payload.configurationId) ?? null;
      const selectedMonitorStillExists = syncedConfiguration?.monitors.some(
        (monitor) => monitor.deviceId === state.selectedConfigurationMonitorKey
      );
      if (!selectedMonitorStillExists) {
        state.selectedConfigurationMonitorKey =
          syncedConfiguration?.monitors[0]?.deviceId ?? state.selectedConfigurationMonitorKey;
      }
    }
    if (payload.playlistId) {
      state.selectedPlaylistId = payload.playlistId;
    }
    setStatus(t('workbench.status.presentationLive', { fileName: payload.fileName }));
  }

  async function refreshPlaylists(): Promise<void> {
    await loadPlaylistCandidates();
    ensureSelection();
    setStatus(t('workbench.status.playlistsReloaded'));
  }

  function toggleSidebar(): void {
    if (state.sidebarCollapsed) {
      state.sidebarCollapsed = false;
      state.sidebarWidth = state.sidebarExpandedWidth;
      return;
    }

    state.sidebarCollapsed = true;
    state.sidebarWidth = SIDEBAR_COLLAPSED_WIDTH;
  }

  function setSidebarWidth(width: number): void {
    const collapsed = getSidebarCollapseState(width);
    state.sidebarCollapsed = collapsed;

    if (collapsed) {
      state.sidebarWidth = SIDEBAR_COLLAPSED_WIDTH;
      return;
    }

    state.sidebarExpandedWidth = createSidebarWidth(width);
    state.sidebarWidth = state.sidebarExpandedWidth;
  }

  function openSettings(): void {
    void stopConfigurationPreviewIfNeeded();
    state.currentPage = 'settings';
    state.settings.lastSelectedPage = 'settings';
    queueSettingsSave();
  }

  async function flushPendingPersistence(): Promise<void> {
    if (settingsSaveTimer) {
      clearTimeout(settingsSaveTimer);
      settingsSaveTimer = null;
      await persistSettingsNow();
    }

    if (configurationSaveTimer) {
      clearTimeout(configurationSaveTimer);
      const targetId = pendingConfigurationSaveId;
      configurationSaveTimer = null;
      pendingConfigurationSaveId = null;
      await persistConfigurationDraftById(targetId);
    }

    if (playlistSaveTimer) {
      clearTimeout(playlistSaveTimer);
      playlistSaveTimer = null;
      await persistQueuedPlaylistDrafts();
    }
  }

  function handleSidebarSelection(listKey: string, itemKey: string): void {
    switch (listKey) {
      case 'monitors':
        selectMonitor(itemKey);
        return;
      case 'configurations':
        selectConfiguration(itemKey);
        return;
      case 'playlists':
        selectPlaylist(itemKey);
        return;
      default:
        openSettings();
        return;
    }
  }

  async function handleSidebarListAction(
    listKey: string,
    itemKey: string | null,
    actionKey: string
  ): Promise<void> {
    if (listKey === 'configurations' && actionKey === 'new') {
      createConfiguration();
      return;
    }

    if (listKey === 'configurations' && actionKey === 'refresh') {
      await refreshConfigurations();
      ensureSelection();
      setStatus(t('workbench.status.configurationsRefreshed'));
      return;
    }

    if (listKey === 'configurations' && itemKey && actionKey === 'delete') {
      await deleteConfigurationById(itemKey);
      return;
    }

    if (listKey === 'configurations' && itemKey && actionKey === 'duplicate') {
      const configuration = state.configurations.find((item) => item.id === itemKey);
      if (!configuration) {
        return;
      }
      const duplicated = duplicateConfigurationRecord(configuration);
      state.configurations = sortByName([duplicated, ...state.configurations]);
      selectConfiguration(duplicated.id);
      queueConfigurationSave(duplicated.id);
      setStatus(t('workbench.status.configurationDuplicated'));
      return;
    }

    if (listKey === 'configurations' && itemKey && actionKey === 'favorite') {
      await toggleConfigurationFavorite(itemKey);
      return;
    }

    if (listKey === 'playlists' && actionKey === 'open') {
      await choosePlaylistSourceFolder();
      return;
    }

    if (listKey === 'playlists' && actionKey === 'refresh') {
      await refreshPlaylists();
      return;
    }

    if (listKey === 'playlists' && itemKey && actionKey === 'favorite') {
      await togglePlaylistFavorite(itemKey);
      return;
    }

    if (listKey === 'playlists' && itemKey && actionKey === 'remove') {
      await removePlaylistFromSidebar(itemKey);
      return;
    }

    if (listKey === 'playlists' && itemKey && actionKey === 'scan') {
      await rescanPlaylistById(itemKey);
      return;
    }

    if (listKey === 'monitors' && actionKey === 'refresh') {
      await refreshMonitors();
      setStatus(t('workbench.status.monitorsRefreshed'));
      return;
    }

    if (listKey === 'monitors' && itemKey && actionKey === 'forget') {
      forgetMonitor(itemKey);
      return;
    }

    await handleMenuCommand(actionKey);
  }

  async function handleMenuCommand(actionKey: string): Promise<void> {
    switch (actionKey) {
      case 'new-config':
        createConfiguration();
        return;
      case 'new-playlist':
        createPlaylist();
        return;
      case 'open-playlist-folder':
        await choosePlaylistSourceFolder();
        return;
      case 'refresh-monitors':
        await refreshMonitors();
        return;
      case 'forget-monitor':
        if (state.selectedMonitorId) {
          forgetMonitor(state.selectedMonitorId);
        }
        return;
      case 'refresh-configurations':
        await refreshConfigurations();
        setStatus(t('workbench.status.configurationsRefreshed'));
        return;
      case 'refresh-playlists':
        await refreshPlaylists();
        return;
      case 'about':
        state.currentPage = 'about';
        state.settings.lastSelectedPage = 'about';
        queueSettingsSave();
        return;
      default:
        return;
    }
  }

  async function handleWorkspaceAction(actionKey: string): Promise<void> {
    switch (actionKey) {
      case 'presentation-previous':
        await stepActivePlayback(-1);
        return;
      case 'presentation-stop':
        await stopActivePlayback();
        return;
      case 'presentation-next':
        await stepActivePlayback(1);
        return;
      case 'preview-configuration':
        await previewSelectedConfiguration();
        return;
      case 'duplicate-configuration':
        duplicateSelectedConfiguration();
        return;
      case 'save-configuration':
        await saveSelectedConfiguration();
        return;
      case 'save-playlist':
        await saveSelectedPlaylist();
        return;
      case 'play-playlist':
        await playSelectedPlaylist();
        return;
      default:
        return;
    }
  }

  return {
    state,
    selectedMonitor,
    selectedConfiguration,
    selectedPlaylist,
    sidebarModel,
    workspaceTitle,
    workspaceActions,
    bootstrap,
    selectPage,
    selectMonitor,
    selectConfiguration,
    selectConfigurationMonitor,
    selectPlaylist,
    updateMonitorFriendlyName,
    updateSelectedConfigurationName,
    updateSelectedConfigurationDescription,
    createConfiguration,
    duplicateSelectedConfiguration,
    saveSelectedConfiguration,
    deleteConfigurationById,
    addMonitorToSelectedConfiguration,
    removeMonitorFromSelectedConfiguration,
    updateSelectedConfigurationMonitor,
    updateConfigurationMappingValue,
    reorderSelectedConfigurationMonitors,
    createPlaylist,
    choosePlaylistSourceFolder,
    updateSelectedPlaylistName,
    updateSelectedPlaylistConfiguration,
    updateSelectedPlaylistEntryVisibility,
    regenerateSelectedPlaylist,
    rescanPlaylistById,
    saveSelectedPlaylist,
    playSelectedPlaylist,
    previewSelectedConfiguration,
    stepActivePlayback,
    stopActivePlayback,
    syncPlaybackState,
    refreshPlaylists,
    toggleSidebar,
    setSidebarWidth,
    openSettings,
    updateMonitorStripHeightGamma,
    updateThemeMode,
    handleSidebarSelection,
    handleSidebarListAction,
    handleMenuCommand,
    handleWorkspaceAction,
    setStatus,
    setError,
    flushPendingPersistence
  };
}
