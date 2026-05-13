import { computed, reactive } from 'vue';
import type {
  AppSettings,
  ConfigurationMonitor,
  ConfigurationRecord,
  MirrorMode,
  MonitorRecord,
  PlaylistRecord,
  PresentationPayload,
  Rotation
} from '../types';
import {
  buildConfigurationPreviewPayload,
  createConfigurationDraft,
  createConfigurationMonitor,
  createEmptySettings,
  createPlaylistDraft,
  isConfigurationPreviewPayload,
  normalizeConfigurationMonitorShortName,
  renumberConfigurationMonitors,
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

function sortByName<T extends { name?: string; friendlyName?: string; systemName?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) =>
    String(left.name ?? left.friendlyName ?? left.systemName ?? '').localeCompare(
      String(right.name ?? right.friendlyName ?? right.systemName ?? '')
    )
  );
}

export function useWorkbench() {
  const defaultSidebarWidth = 264;

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
    statusMessage: 'Ready',
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
      return 'Presentation Mode';
    }

    if (state.currentPage === 'monitor') {
      return selectedMonitor.value ? formatMonitorTitle(selectedMonitor.value) : 'Monitors';
    }

    if (state.currentPage === 'configuration') {
      return selectedConfiguration.value?.name || 'Configurations';
    }

    if (state.currentPage === 'playlist') {
      return (
        formatWorkspaceTitle({
          playlist: selectedPlaylist.value,
          configuration: selectedPlaylistConfiguration.value
        }) || 'Playlists'
      );
    }

    return 'Settings';
  });

  const workspaceActions = computed<SidebarAction[]>(() => {
    if (state.playback.active && !state.configurationPreviewActive) {
      return [];
    }

    if (state.currentPage === 'configuration' && selectedConfiguration.value) {
      return [
        {
          key: 'preview-configuration',
          hoverTip: state.configurationPreviewActive ? 'Stop preview' : 'Preview configuration',
          icon: state.configurationPreviewActive ? 'mdi-eye-off-outline' : 'mdi-monitor-eye'
        },
        { key: 'save-configuration', hoverTip: 'Save configuration', icon: 'mdi-content-save-outline' }
      ];
    }

    if (state.currentPage === 'playlist' && selectedPlaylist.value) {
      return [
        { key: 'save-playlist', hoverTip: 'Save playlist', icon: 'mdi-content-save-outline' },
        { key: 'play-playlist', hoverTip: 'Play playlist', icon: 'mdi-play-outline' }
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

  async function refreshMonitors(): Promise<void> {
    const monitors = await listMonitors();
    const overrides = state.settings.monitorOverrides;
    state.monitors = sortByName(
      monitors.map((monitor) => ({
        ...monitor,
        friendlyName: overrides[monitor.deviceId]?.friendlyName || monitor.friendlyName
      }))
    );
  }

  async function refreshConfigurations(): Promise<void> {
    state.configurations = sortByName(await listConfigurations());
  }

  async function loadPlaylistCandidates(): Promise<void> {
    const folders = state.settings.recentPlaylistFolders ?? [];
    const playlists = await Promise.all(folders.map((folder) => readPlaylist(folder)));
    state.playlists = sortByName(playlists.filter(Boolean) as PlaylistRecord[]);
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
          savedId && state.playlists.some((item) => item.id === savedId) ? savedId : null;
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
      state.settings = await loadAppSettings();
      state.sidebarCollapsed = false;
      state.sidebarExpandedWidth = createSidebarWidth(state.sidebarExpandedWidth);
      state.sidebarWidth = state.sidebarExpandedWidth;
      await refreshMonitors();
      await refreshConfigurations();
      await loadPlaylistCandidates();
      state.currentPage = (state.settings.lastSelectedPage as WorkbenchPage | undefined) ?? 'settings';
      restoreSavedSelection();
      ensureSelection();
      setStatus('Workbench ready');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      state.loading = false;
    }
  }

  async function persistSettings(): Promise<void> {
    await saveAppSettings(state.settings);
  }

  function selectPage(page: WorkbenchPage): void {
    if (page !== 'configuration') {
      void stopConfigurationPreviewIfNeeded();
    }
    state.currentPage = page;
    state.settings.lastSelectedPage = page;
    ensureSelection();
  }

  function selectMonitor(deviceId: string): void {
    void stopConfigurationPreviewIfNeeded();
    state.currentPage = 'monitor';
    state.selectedMonitorId = deviceId;
    state.settings.lastSelectedPage = 'monitor';
    state.settings.lastSelectedEntityId = deviceId;
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
  }

  async function updateMonitorFriendlyName(value: string): Promise<void> {
    const monitor = selectedMonitor.value;
    if (!monitor) {
      return;
    }

    monitor.friendlyName = value;
    state.settings.monitorOverrides[monitor.deviceId] = { friendlyName: value };
    await persistSettings();
    setStatus('Monitor label saved');
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
    configuration.name = `Configuration ${state.configurations.length + 1}`;
    state.configurations.unshift(configuration);
    selectConfiguration(configuration.id);
  }

  async function saveSelectedConfiguration(): Promise<void> {
    const configuration = selectedConfiguration.value;
    if (!configuration) {
      return;
    }

    const errors = validateConfiguration(configuration);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    await saveConfiguration(configuration);
    await refreshConfigurations();
    selectConfiguration(configuration.id);
    await syncConfigurationPreviewIfNeeded();
    setStatus('Configuration saved');
  }

  async function deleteConfigurationById(id: string): Promise<void> {
    await deleteConfiguration(id);
    state.configurations = state.configurations.filter((item) => item.id !== id);
    state.selectedConfigurationId = state.configurations[0]?.id ?? null;
    state.selectedConfigurationMonitorKey = state.configurations[0]?.monitors[0]?.deviceId ?? null;
    setStatus('Configuration deleted');
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
    void syncConfigurationPreviewIfNeeded();
  }

  function removeMonitorFromSelectedConfiguration(deviceId: string): void {
    mutateSelectedConfiguration((configuration) => {
      configuration.monitors = renumberConfigurationMonitors(
        configuration.monitors.filter((monitor) => monitor.deviceId !== deviceId)
      );
      state.selectedConfigurationMonitorKey = configuration.monitors[0]?.deviceId ?? null;
    });
    void syncConfigurationPreviewIfNeeded();
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
    void syncConfigurationPreviewIfNeeded();
  }

  function createPlaylist(): PlaylistRecord {
    const playlist = createPlaylistDraft();
    playlist.name = `Playlist ${state.playlists.length + 1}`;
    state.playlists.unshift(playlist);
    selectPlaylist(playlist.id);
    return playlist;
  }

  function ensureEditablePlaylist(): PlaylistRecord {
    return selectedPlaylist.value ?? createPlaylist();
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
    const playlist = ensureEditablePlaylist();

    const folder = await choosePlaylistFolder();
    if (!folder) {
      return;
    }

    playlist.sourceFolder = folder;
    playlist.playlistFilePath = `${folder.replace(/\\/g, '/')}/playlist.json`;
    state.settings.recentPlaylistFolders = upsertRecentPlaylistFolder(state.settings.recentPlaylistFolders, folder);
    await persistSettings();
    await regenerateSelectedPlaylist();
  }

  async function regeneratePlaylist(playlist: PlaylistRecord | null): Promise<void> {
    if (!playlist) {
      return;
    }

    const configuration = getConfigurationById(playlist.configurationId);
    const shortNames = configuration?.monitors.map((monitor) => monitor.shortName) ?? [];
    if (!playlist.sourceFolder.trim()) {
      playlist.entries = [];
      return;
    }

    if (shortNames.length === 0) {
      playlist.entries = [];
      setStatus('Select a configuration with at least one monitor to generate entries');
      return;
    }

    playlist.entries = await scanPlaylistFolder(playlist.sourceFolder, shortNames, playlist.entries);
    setStatus('Playlist regenerated');
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

    const configuration = getConfigurationById(playlist.configurationId);
    const connectedMonitorIds = new Set(state.monitors.filter((item) => item.connected).map((item) => item.deviceId));
    const errors = validatePlaylist(playlist, configuration, connectedMonitorIds);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    await savePlaylist(playlist);
    state.settings.recentPlaylistFolders = upsertRecentPlaylistFolder(
      state.settings.recentPlaylistFolders,
      playlist.sourceFolder
    );
    await persistSettings();
    await loadPlaylistCandidates();
    selectPlaylist(playlist.id);
    setStatus('Playlist saved');
  }

  async function playSelectedPlaylist(): Promise<void> {
    const context = buildPlaybackContextFromSelection();
    if (!context) {
      setError('Select a playlist and configuration first');
      return;
    }

    const connectedMonitorIds = new Set(state.monitors.filter((item) => item.connected).map((item) => item.deviceId));
    const errors = validatePlaylist(context.playlist, context.configuration, connectedMonitorIds);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    const payload = await startPlayback(state.playback, context, 0);
    setStatus(`Presentation started: ${payload.fileName}`);
  }

  async function previewSelectedConfiguration(): Promise<void> {
    const configuration = selectedConfiguration.value;
    if (!configuration) {
      setError('Select a configuration first');
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
        setError(`Configuration monitor ${monitor.shortName} is not connected`);
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
    setStatus('Configuration preview started');
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
      setStatus(`Showing ${payload.fileName}`);
    }
  }

  async function stopActivePlayback(): Promise<void> {
    if (!state.playback.active) {
      return;
    }

    await stopPlayback(state.playback);
    state.configurationPreviewActive = false;
    state.configurationPreviewId = null;
    setStatus('Presentation stopped');
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

  function syncPlaybackState(payload: PresentationPayload | null): void {
    if (!payload?.active) {
      state.playback.active = false;
      state.playback.playlistId = null;
      state.playback.configurationId = null;
      state.playback.currentIndex = 0;
      state.playback.payload = null;
      state.configurationPreviewActive = false;
      state.configurationPreviewId = null;
      setStatus('Presentation stopped');
      return;
    }

    state.playback.active = true;
    state.playback.playlistId = payload.playlistId;
    state.playback.configurationId = payload.configurationId;
    state.playback.currentIndex = payload.index;
    state.playback.payload = payload;
    state.configurationPreviewActive = isConfigurationPreviewPayload(payload);
    state.configurationPreviewId = state.configurationPreviewActive ? payload.configurationId : null;
    setStatus(`Presentation live: ${payload.fileName}`);
  }

  async function refreshPlaylists(): Promise<void> {
    await loadPlaylistCandidates();
    ensureSelection();
    setStatus('Playlists reloaded');
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

    if (listKey === 'configurations' && itemKey && actionKey === 'delete') {
      await deleteConfigurationById(itemKey);
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

    if (listKey === 'playlists' && itemKey && actionKey === 'scan') {
      await rescanPlaylistById(itemKey);
      return;
    }

    if (listKey === 'monitors' && actionKey === 'refresh') {
      await refreshMonitors();
      setStatus('Monitors refreshed');
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
      case 'refresh-configurations':
        await refreshConfigurations();
        setStatus('Configurations refreshed');
        return;
      case 'refresh-playlists':
        await refreshPlaylists();
        return;
      case 'about':
        setStatus('Parallaxer multi-monitor shell in progress');
        return;
      default:
        return;
    }
  }

  async function handleWorkspaceAction(actionKey: string): Promise<void> {
    switch (actionKey) {
      case 'preview-configuration':
        await previewSelectedConfiguration();
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
    createConfiguration,
    saveSelectedConfiguration,
    deleteConfigurationById,
    addMonitorToSelectedConfiguration,
    removeMonitorFromSelectedConfiguration,
    updateSelectedConfigurationMonitor,
    createPlaylist,
    choosePlaylistSourceFolder,
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
    handleSidebarSelection,
    handleSidebarListAction,
    handleMenuCommand,
    handleWorkspaceAction,
    setStatus,
    setError
  };
}
