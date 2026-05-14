import { createI18n } from 'vue-i18n';

export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const FALLBACK_LOCALE: AppLocale = 'en';
const LOCALE_STORAGE_KEY = 'parallaxer.locale';

function isAppLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function normalizeLocale(value: string | null | undefined): AppLocale | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }

  if (normalized.startsWith('en')) {
    return 'en';
  }

  return isAppLocale(value) ? value : null;
}

function readStoredLocale(): AppLocale | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return normalizeLocale(stored);
}

function detectBrowserLocale(): AppLocale | null {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const languages = navigator.languages ?? [];
  for (const language of languages) {
    const normalized = normalizeLocale(language);
    if (normalized) {
      return normalized;
    }
  }

  return normalizeLocale(navigator.language);
}

function resolveInitialLocale(): AppLocale {
  return readStoredLocale() ?? detectBrowserLocale() ?? FALLBACK_LOCALE;
}

export const messages = {
  en: {
    common: {
      appName: 'Parallaxer',
      ready: 'Ready',
      language: 'Language',
      english: 'English',
      chineseSimplified: 'Chinese (Simplified)',
      graph: 'Graph',
      add: 'Add',
      remove: 'Remove',
      browse: 'Browse',
      file: 'File',
      info: 'Info',
      visible: 'Visible',
      allMonitorsAdded: 'All monitors added',
      addMonitor: 'Add monitor',
      selectConfiguration: 'Select configuration',
      untitledConfiguration: 'Untitled configuration',
      untitledPlaylist: 'Untitled playlist',
      unknown: 'Unknown'
    },
    titlebar: {
      file: 'File',
      edit: 'Edit',
      help: 'Help',
      newConfig: 'New Config',
      newPlaylist: 'New Playlist',
      openPlaylistFolder: 'Open Playlist Folder',
      refreshMonitors: 'Refresh Monitors',
      refreshConfigurations: 'Refresh Configurations',
      refreshPlaylists: 'Refresh Playlists',
      about: 'About Parallaxer'
    },
    shell: {
      page: {
        monitors: 'Monitors',
        configurations: 'Configurations',
        playlists: 'Playlists',
        settings: 'Settings'
      },
      sidebar: {
        live: 'live',
        history: 'history',
        noMonitorsFound: 'No monitors found',
        noConfigurationsYet: 'No configurations yet',
        noPlaylistsYet: 'No playlists yet',
        monitorCount: '{count} monitors',
        itemCount: '{count} items'
      },
      workspace: {
        presentationMode: 'Presentation Mode',
        presentationModeWithPlaylist: 'Presentation Mode - {name}',
        fallbackTitle: 'Parallaxer'
      },
      action: {
        previous: 'Previous',
        stop: 'Stop',
        next: 'Next',
        forgetMonitor: 'Forget monitor',
        stopPreview: 'Stop preview',
        previewConfiguration: 'Preview configuration',
        duplicateConfiguration: 'Duplicate configuration',
        saveConfiguration: 'Save configuration',
        savePlaylist: 'Save playlist',
        playPlaylist: 'Play playlist',
        createConfiguration: 'Create a configuration',
        createPlaylist: 'Create a playlist',
        refreshMonitors: 'Refresh monitors',
        reloadConfigurations: 'Reload configurations',
        createConfigurationShort: 'Create configuration',
        reloadPlaylists: 'Reload playlists',
        openPlaylistFolder: 'Open playlist folder',
        openSettings: 'Open settings',
        unfavoriteConfiguration: 'Unfavorite configuration',
        favoriteConfiguration: 'Favorite configuration',
        deleteConfiguration: 'Delete configuration',
        unfavoritePlaylist: 'Unfavorite playlist',
        favoritePlaylist: 'Favorite playlist',
        rescanFolder: 'Rescan folder',
        removeFromSidebar: 'Remove from sidebar'
      }
    },
    presentation: {
      modeLabel: 'Presentation mode',
      liveTitle: 'Presentation live',
      previousSlide: 'Previous',
      stop: 'Stop',
      nextSlide: 'Next',
      collapse: 'Collapse',
      configuration: 'Configuration',
      currentConfiguration: 'Current configuration'
    },
    settings: {
      appRoot: 'App Root',
      storageHint:
        'Settings and monitor labels are stored in ~/.parallaxer, while each playlist persists beside its source folder as playlist.json.',
      recentPlaylistFolders: 'Recent Playlist Folders',
      noRecentPlaylistFolders: 'No recent playlist folders yet.'
    },
    playlist: {
      name: 'Playlist Name',
      namePlaceholder: 'Playlist name',
      sourceFolder: 'Source Folder',
      configuration: 'Configuration',
      selectConfiguration: 'Select configuration',
      empty: 'Select or create a playlist.'
    },
    monitor: {
      friendlyName: 'Friendly Name',
      friendlyNamePlaceholder: 'Monitor label',
      status: 'Status',
      lastLive: 'Last Live',
      deviceId: 'Device ID',
      systemName: 'System Name',
      geometry: 'Geometry',
      refreshRate: 'Refresh Rate',
      manufacturer: 'Manufacturer',
      productCode: 'Product Code',
      serialNumber: 'Serial Number',
      edid: 'EDID',
      forgetMonitor: 'Forget Monitor',
      empty: 'Select a monitor from the sidebar.',
      connectedNow: 'Connected now',
      seenBefore: 'Seen before · {time}'
    },
    configuration: {
      name: 'Configuration name',
      namePlaceholder: 'Configuration name',
      description: 'Description',
      descriptionPlaceholder: 'Describe this monitor mapping',
      layoutTitle: 'Monitor layout',
      layoutCopy: 'Physical scale stays relative to the widest display in this configuration.',
      remove: 'Remove',
      shortName: 'Short name',
      shortNamePlaceholder: 'display-a',
      rotation: 'Rotation',
      mirror: 'Mirror',
      fit: 'Fit',
      scale: 'Scale',
      offsetX: 'Offset X (px)',
      offsetY: 'Offset Y (px)',
      empty: 'Select or create a configuration.',
      option: {
        none: 'none',
        horizontal: 'horizontal',
        vertical: 'vertical',
        both: 'both',
        contain: 'contain',
        cover: 'cover',
        fill: 'fill'
      }
    },
    ui: {
      playlistEntry: {
        ready: 'Ready',
        partialMissing: 'Missing assets on some monitors',
        missingAll: 'Missing assets on all monitors'
      },
      appRootPath: '~/.parallaxer'
    },
    domain: {
      defaultConfigurationName: 'Configuration',
      defaultPlaylistName: 'Untitled playlist',
      configurationPreviewFileName: 'Configuration Preview',
      validation: {
        configurationNameRequired: 'Configuration name is required',
        configurationAtLeastOneMonitor: 'At least one monitor is required',
        deviceIdRequired: 'deviceId is required',
        deviceIdUnique: 'deviceId must be unique',
        shortNameRequired: 'shortName is required',
        orderUnique: 'order must be unique',
        playlistNameRequired: 'Playlist name is required',
        playlistSourceFolderRequired: 'Playlist sourceFolder is required',
        playlistConfigurationIdRequired: 'Playlist configurationId is required',
        playlistConfigurationNotFound: 'Playlist configuration was not found',
        playlistConfigurationMismatch: 'Playlist configurationId does not match the selected configuration',
        playlistConfigurationNeedsMonitors: 'Playlist configuration must include at least one monitor',
        configurationMonitorNotConnected: 'Configuration monitor {shortName} is not connected',
        entryMissingMonitor: 'Entry {fileName} is missing monitor {shortName}',
        entryNotReadyForMonitor: 'Entry {fileName} is not ready for monitor {shortName}',
        playlistNeedsPlayableEntry: 'Playlist must include at least one visible ready entry'
      }
    },
    workbench: {
      status: {
        ready: 'Workbench ready',
        monitorLabelSaved: 'Monitor label saved',
        monitorForgotten: 'Monitor forgotten',
        configurationSaved: 'Configuration saved',
        configurationFavorited: 'Configuration favorited',
        configurationUnfavorited: 'Configuration unfavorited',
        configurationDeleted: 'Configuration deleted',
        configurationDuplicated: 'Configuration duplicated',
        playlistItemVisibilityUpdated: 'Playlist item visibility updated',
        playlistFolderOpened: 'Playlist folder opened',
        selectConfigurationToGenerateEntries: 'Select a configuration with at least one monitor to generate entries',
        playlistRegenerated: 'Playlist regenerated',
        playlistSaved: 'Playlist saved',
        playlistFavorited: 'Playlist favorited',
        playlistUnfavorited: 'Playlist unfavorited',
        playlistRemovedFromSidebar: 'Playlist removed from sidebar',
        presentationStarted: 'Presentation started: {fileName}',
        configurationPreviewStarted: 'Configuration preview started',
        showing: 'Showing {fileName}',
        presentationStopped: 'Presentation stopped',
        presentationLive: 'Presentation live: {fileName}',
        playlistsReloaded: 'Playlists reloaded',
        configurationsRefreshed: 'Configurations refreshed',
        monitorsRefreshed: 'Monitors refreshed',
        about: 'Parallaxer multi-monitor shell in progress'
      },
      error: {
        selectPlaylistAndConfigurationFirst: 'Select a playlist and configuration first',
        selectConfigurationFirst: 'Select a configuration first'
      }
    }
  },
  'zh-CN': {
    common: {
      appName: 'Parallaxer',
      ready: '就绪',
      language: '语言',
      english: 'English',
      chineseSimplified: '简体中文',
      graph: 'Graph',
      add: '添加',
      remove: '移除',
      browse: '浏览',
      file: '文件',
      info: '信息',
      visible: '可见',
      allMonitorsAdded: '已添加全部显示器',
      addMonitor: '添加显示器',
      selectConfiguration: '选择配置',
      untitledConfiguration: '未命名配置',
      untitledPlaylist: '未命名播放列表',
      unknown: '未知'
    },
    titlebar: {
      file: '文件',
      edit: '编辑',
      help: '帮助',
      newConfig: '新建配置',
      newPlaylist: '新建播放列表',
      openPlaylistFolder: '打开播放列表目录',
      refreshMonitors: '刷新显示器',
      refreshConfigurations: '刷新配置',
      refreshPlaylists: '刷新播放列表',
      about: '关于 Parallaxer'
    },
    shell: {
      page: {
        monitors: '显示器',
        configurations: '配置',
        playlists: '播放列表',
        settings: '设置'
      },
      sidebar: {
        live: '在线',
        history: '历史',
        noMonitorsFound: '未找到显示器',
        noConfigurationsYet: '暂无配置',
        noPlaylistsYet: '暂无播放列表',
        monitorCount: '{count} 台显示器',
        itemCount: '{count} 项'
      },
      workspace: {
        presentationMode: '展示模式',
        presentationModeWithPlaylist: '展示模式 - {name}',
        fallbackTitle: 'Parallaxer'
      },
      action: {
        previous: '上一张',
        stop: '停止',
        next: '下一张',
        forgetMonitor: '忘记显示器',
        stopPreview: '停止预览',
        previewConfiguration: '预览配置',
        duplicateConfiguration: '复制配置',
        saveConfiguration: '保存配置',
        savePlaylist: '保存播放列表',
        playPlaylist: '播放播放列表',
        createConfiguration: '创建配置',
        createPlaylist: '创建播放列表',
        refreshMonitors: '刷新显示器',
        reloadConfigurations: '重新加载配置',
        createConfigurationShort: '创建配置',
        reloadPlaylists: '重新加载播放列表',
        openPlaylistFolder: '打开播放列表目录',
        openSettings: '打开设置',
        unfavoriteConfiguration: '取消配置收藏',
        favoriteConfiguration: '收藏配置',
        deleteConfiguration: '删除配置',
        unfavoritePlaylist: '取消播放列表收藏',
        favoritePlaylist: '收藏播放列表',
        rescanFolder: '重新扫描目录',
        removeFromSidebar: '从侧边栏移除'
      }
    },
    presentation: {
      modeLabel: '展示模式',
      liveTitle: '演示进行中',
      previousSlide: '上一张',
      stop: '停止',
      nextSlide: '下一张',
      collapse: '收起',
      configuration: '配置',
      currentConfiguration: '当前配置'
    },
    settings: {
      appRoot: '应用根目录',
      storageHint: '设置和显示器标签保存在 ~/.parallaxer；每个播放列表会在其源目录旁以 playlist.json 持久化。',
      recentPlaylistFolders: '最近播放列表目录',
      noRecentPlaylistFolders: '暂无最近播放列表目录。'
    },
    playlist: {
      name: '播放列表名称',
      namePlaceholder: '播放列表名称',
      sourceFolder: '源目录',
      configuration: '配置',
      selectConfiguration: '选择配置',
      empty: '请从侧边栏选择或创建播放列表。'
    },
    monitor: {
      friendlyName: '友好名称',
      friendlyNamePlaceholder: '显示器标签',
      status: '状态',
      lastLive: '最近在线',
      deviceId: '设备 ID',
      systemName: '系统名称',
      geometry: '几何信息',
      refreshRate: '刷新率',
      manufacturer: '厂商',
      productCode: '产品编码',
      serialNumber: '序列号',
      edid: 'EDID',
      forgetMonitor: '忘记显示器',
      empty: '请从侧边栏选择一个显示器。',
      connectedNow: '当前已连接',
      seenBefore: '曾连接 · {time}'
    },
    configuration: {
      name: '配置名称',
      namePlaceholder: '配置名称',
      description: '描述',
      descriptionPlaceholder: '描述该显示器映射',
      layoutTitle: '显示器布局',
      layoutCopy: '物理比例会相对当前配置中最宽的显示器保持一致。',
      remove: '移除',
      shortName: '短名称',
      shortNamePlaceholder: 'display-a',
      rotation: '旋转',
      mirror: '镜像',
      fit: '适配',
      scale: '缩放',
      offsetX: 'X 偏移 (px)',
      offsetY: 'Y 偏移 (px)',
      empty: '请先选择或创建配置。',
      option: {
        none: '无',
        horizontal: '水平',
        vertical: '垂直',
        both: '双向',
        contain: '包含',
        cover: '覆盖',
        fill: '拉伸填充'
      }
    },
    ui: {
      playlistEntry: {
        ready: '就绪',
        partialMissing: '部分显示器资源缺失',
        missingAll: '所有显示器资源缺失'
      },
      appRootPath: '~/.parallaxer'
    },
    domain: {
      defaultConfigurationName: '配置',
      defaultPlaylistName: '未命名播放列表',
      configurationPreviewFileName: '配置预览',
      validation: {
        configurationNameRequired: '配置名称不能为空',
        configurationAtLeastOneMonitor: '至少需要一个显示器',
        deviceIdRequired: 'deviceId 不能为空',
        deviceIdUnique: 'deviceId 必须唯一',
        shortNameRequired: 'shortName 不能为空',
        orderUnique: 'order 必须唯一',
        playlistNameRequired: '播放列表名称不能为空',
        playlistSourceFolderRequired: '播放列表 sourceFolder 不能为空',
        playlistConfigurationIdRequired: '播放列表 configurationId 不能为空',
        playlistConfigurationNotFound: '未找到播放列表对应配置',
        playlistConfigurationMismatch: '播放列表 configurationId 与当前选中配置不一致',
        playlistConfigurationNeedsMonitors: '播放列表配置至少需要一个显示器',
        configurationMonitorNotConnected: '配置显示器 {shortName} 未连接',
        entryMissingMonitor: '条目 {fileName} 缺少显示器 {shortName} 的资源',
        entryNotReadyForMonitor: '条目 {fileName} 在显示器 {shortName} 上未就绪',
        playlistNeedsPlayableEntry: '播放列表至少需要一个可见且就绪的条目'
      }
    },
    workbench: {
      status: {
        ready: '工作台已就绪',
        monitorLabelSaved: '显示器标签已保存',
        monitorForgotten: '已忘记显示器',
        configurationSaved: '配置已保存',
        configurationFavorited: '已收藏配置',
        configurationUnfavorited: '已取消配置收藏',
        configurationDeleted: '配置已删除',
        configurationDuplicated: '配置已复制',
        playlistItemVisibilityUpdated: '播放列表条目可见性已更新',
        playlistFolderOpened: '已打开播放列表目录',
        selectConfigurationToGenerateEntries: '请选择至少包含一个显示器的配置以生成条目',
        playlistRegenerated: '播放列表已重新生成',
        playlistSaved: '播放列表已保存',
        playlistFavorited: '已收藏播放列表',
        playlistUnfavorited: '已取消播放列表收藏',
        playlistRemovedFromSidebar: '播放列表已从侧边栏移除',
        presentationStarted: '已开始展示：{fileName}',
        configurationPreviewStarted: '配置预览已开始',
        showing: '正在显示 {fileName}',
        presentationStopped: '展示已停止',
        presentationLive: '展示中：{fileName}',
        playlistsReloaded: '播放列表已刷新',
        configurationsRefreshed: '配置已刷新',
        monitorsRefreshed: '显示器已刷新',
        about: 'Parallaxer 多显示器外壳开发中'
      },
      error: {
        selectPlaylistAndConfigurationFirst: '请先选择播放列表和配置',
        selectConfigurationFirst: '请先选择配置'
      }
    }
  }
} as const;

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: resolveInitialLocale(),
  fallbackLocale: FALLBACK_LOCALE,
  messages
});

export function getLocale(): AppLocale {
  return i18n.global.locale.value as AppLocale;
}

export function setLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
}

export function t(key: string, params?: Record<string, string | number>): string {
  return i18n.global.t(key, params ?? {}) as string;
}
