# Parallaxer Multi-Monitor Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current fixed stereo Parallaxer app with a frameless Codex-style shell that manages monitors, configurations, playlists, and settings; persists data under `~/.parallaxer` and playlist folders; and plays synchronized media across one or more monitor windows using configuration `shortName/fileName` mapping.

**Architecture:** Keep Tauri as the OS/runtime boundary and Vue as the shell/workbench boundary. Replace the old `left/right` model with configuration-scoped monitor bindings, centralize UI orchestration in a workbench store/composable, and generalize presentation state from stereo fields into per-monitor display entries keyed by `shortName`.

**Tech Stack:** Vue 3, TypeScript, Tauri 2, Rust, Vitest, Material Design Icons

---

## File Structure

### Frontend

- Replace: `src/types.ts`
- Replace: `src/App.vue`
- Replace: `src/styles.css`
- Replace: `src/lib/tauri.ts`
- Replace: `src/lib/presentation.ts`
- Replace: `src/lib/project.ts`
- Replace: `src/lib/ui.ts`
- Create: `src/lib/domain.ts`
- Create: `src/lib/domain.test.ts`
- Create: `src/lib/sidebar.ts`
- Create: `src/lib/sidebar.test.ts`
- Create: `src/lib/window.ts`
- Create: `src/stores/workbench.ts`
- Create: `src/components/shell/TitleBar.vue`
- Create: `src/components/shell/Sidebar.vue`
- Create: `src/components/shell/WorkspaceFrame.vue`
- Create: `src/components/workbench/MonitorDetail.vue`
- Create: `src/components/workbench/ConfigurationEditor.vue`
- Create: `src/components/workbench/PlaylistEditor.vue`
- Create: `src/components/workbench/SettingsView.vue`

### Backend

- Modify: `src-tauri/Cargo.toml`
- Replace: `src-tauri/src/main.rs`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/app-default.json`

### Tests / cleanup

- Replace or delete obsolete tests:
  - `src/lib/project.test.ts`
  - `src/lib/presentation.test.ts`
  - `src/lib/ui.test.ts`
  - `src/lib/tauri-config.test.ts`
  - `src/lib/tauri-capabilities.test.ts`
  - `src/lib/presentation-styles.test.ts`

## Constraints

- This directory is **not a git repository**, so do not include commit steps while executing.
- Prefer implementation speed over broad test coverage.
- Keep only high-value pure-function tests plus final smoke checks:
  - `npm test`
  - `npm run build`
  - `cargo test`
- Do not preserve the old stereo data model for compatibility.

### Task 1: Replace The Domain Model And Frontend Runtime Contracts

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/project.ts`
- Modify: `src/lib/presentation.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/lib/ui.ts`
- Create: `src/lib/domain.ts`
- Create: `src/lib/domain.test.ts`
- Create: `src/lib/sidebar.ts`
- Create: `src/lib/sidebar.test.ts`
- Delete/replace: old stereo-oriented tests under `src/lib/*.test.ts`

- [ ] **Step 1: Replace the old shared types with the new domain model**

Create a new `src/types.ts` centered on monitors, configurations, playlists, settings, and generalized playback:

```ts
export type Rotation = 0 | 90 | 180 | 270;
export type MirrorMode = 'none' | 'horizontal' | 'vertical' | 'both';
export type MappingMode = 'same-name-separated-by-shortname';

export interface MonitorRecord {
  deviceId: string;
  systemName: string;
  friendlyName: string;
  connected: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  refreshRate?: number;
  manufacturer?: string;
  productCode?: string;
  serialNumber?: string;
  edid?: string;
  lastSeenAt: string;
}

export interface MonitorMapping {
  rotation: Rotation;
  mirror: MirrorMode;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface ConfigurationMonitor {
  deviceId: string;
  shortName: string;
  order: number;
  mapping: MonitorMapping;
}

export interface ConfigurationRecord {
  id: string;
  name: string;
  description: string;
  monitors: ConfigurationMonitor[];
}

export interface PlaylistMonitorEntry {
  exists: boolean;
  relativePath: string;
  info?: string;
}

export interface PlaylistEntry {
  fileName: string;
  visibility: boolean;
  status: 'ready' | 'partial-missing' | 'missing-all';
  message: string;
  perMonitor: Record<string, PlaylistMonitorEntry>;
}

export interface PlaylistRecord {
  id: string;
  name: string;
  sourceFolder: string;
  configurationId: string;
  mappingMode: MappingMode;
  entries: PlaylistEntry[];
  playlistFilePath: string;
}

export interface AppSettings {
  monitorOverrides: Record<string, { friendlyName: string }>;
  recentPlaylistFolders: string[];
  cache: Record<string, unknown>;
  lastSelectedPage?: string;
  lastSelectedEntityId?: string;
}

export interface PresentationDisplayPayload {
  shortName: string;
  windowLabel: string;
  deviceId: string;
  assetPath: string;
  relativePath: string;
  mapping: MonitorMapping;
}

export interface PresentationPayload {
  active: boolean;
  playlistId: string;
  configurationId: string;
  index: number;
  total: number;
  fileName: string;
  displays: PresentationDisplayPayload[];
}
```

- [ ] **Step 2: Add pure domain helpers and remove stereo assumptions**

Move domain logic into `src/lib/domain.ts`. Include constructors, validation helpers, playlist row utilities, selection helpers, and presentation helpers. Keep the file focused and stateless.

Implement helpers similar to:

```ts
export function createEmptySettings(): AppSettings;
export function createConfigurationDraft(): ConfigurationRecord;
export function createPlaylistDraft(): PlaylistRecord;
export function createDefaultMonitorMapping(): MonitorMapping;
export function sortConfigurationMonitors(monitors: ConfigurationMonitor[]): ConfigurationMonitor[];
export function validateConfiguration(config: ConfigurationRecord): string[];
export function validatePlaylist(
  playlist: PlaylistRecord,
  configuration: ConfigurationRecord | null,
  connectedMonitorIds: Set<string>
): string[];
export function getPlayableEntryIndices(entries: PlaylistEntry[]): number[];
export function resolvePlayableIndex(entries: PlaylistEntry[], preferred: number): number;
export function stepPlayableIndex(entries: PlaylistEntry[], current: number, delta: number): number;
export function buildPresentationPayload(args: {
  playlist: PlaylistRecord;
  configuration: ConfigurationRecord;
  index: number;
}): PresentationPayload;
```

Rules:

- `visibility=true` and `status='ready'` define playability.
- `buildPresentationPayload` must emit one display payload per configuration monitor.
- Do not keep `left/right` helper paths or stereo entry labels.

- [ ] **Step 3: Add only the minimum worthwhile tests for pure logic**

Replace the old stereo tests with compact tests that protect the new core rules:

```ts
test('configuration validation rejects duplicate short names', () => {
  expect(validateConfiguration(config)).toContain('shortName must be unique');
});

test('playlist validation rejects disconnected monitors', () => {
  expect(validatePlaylist(playlist, config, new Set())).toContain('not connected');
});

test('playable indices skip hidden and incomplete entries', () => {
  expect(getPlayableEntryIndices(entries)).toEqual([1, 3]);
});

test('presentation payload resolves one display per configuration monitor', () => {
  expect(payload.displays.map((item) => item.shortName)).toEqual(['left', 'right', 'top']);
});
```

Run: `npm test`
Expected: pass with only the new domain-oriented suite and any still-relevant config tests.

- [ ] **Step 4: Replace the Tauri client contract**

Rewrite `src/lib/tauri.ts` so frontend code talks in terms of settings/configurations/playlists and generalized playback. Remove obsolete file-picker-only stereo helpers where they no longer fit.

Target API shape:

```ts
export async function listMonitors(): Promise<MonitorRecord[]>;
export async function loadAppSettings(): Promise<AppSettings>;
export async function saveAppSettings(settings: AppSettings): Promise<void>;
export async function listConfigurations(): Promise<ConfigurationRecord[]>;
export async function readConfiguration(id: string): Promise<ConfigurationRecord>;
export async function saveConfiguration(config: ConfigurationRecord): Promise<void>;
export async function deleteConfiguration(id: string): Promise<void>;
export async function choosePlaylistFolder(): Promise<string | null>;
export async function readPlaylist(path: string): Promise<PlaylistRecord | null>;
export async function savePlaylist(playlist: PlaylistRecord): Promise<void>;
export async function scanPlaylistFolder(
  sourceFolder: string,
  shortNames: string[],
  previousEntries: PlaylistEntry[]
): Promise<PlaylistEntry[]>;
export async function startPresentation(payload: PresentationPayload): Promise<void>;
export async function syncPresentation(payload: PresentationPayload): Promise<void>;
export async function stopPresentation(): Promise<void>;
```

Keep presentation window creation helpers in TS if that is faster than moving them to Rust.

- [ ] **Step 5: Replace formatting helpers for the new UI**

Rewrite `src/lib/ui.ts` and add `src/lib/sidebar.ts` to support:

- monitor labels
- compact display info
- playlist row messages
- sidebar item mapping
- list action mapping

Example helper surface:

```ts
export function formatMonitorTitle(monitor: MonitorRecord): string;
export function formatMonitorTail(monitor: MonitorRecord): string;
export function formatPlaylistEntryMessage(entry: PlaylistEntry): string;
export function formatWorkspaceTitle(...): string;
```

### Task 2: Replace The Rust Backend With App Storage, Generalized Playlist Scanning, And Generalized Playback State

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Replace: `src-tauri/src/main.rs`
- Modify: `src-tauri/capabilities/app-default.json`

- [ ] **Step 1: Add the backend dependencies needed for app storage and Windows monitor enrichment**

Update `src-tauri/Cargo.toml` with the minimum extra crates needed. Keep cross-platform fallbacks simple.

Use a dependency set along these lines:

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = ["protocol-asset"] }
rfd = "0.15"
dirs = "6"

[target.'cfg(windows)'.dependencies]
wmi = "0.14"
```

If `wmi` proves too awkward, use a Windows-only command fallback that still returns stable-ish monitor metadata, but keep the public JSON shape the same.

- [ ] **Step 2: Replace the backend data structs and storage helpers**

Create backend structs mirroring the new frontend contracts. Add helpers for:

- app root resolution: `~/.parallaxer`
- settings file path: `~/.parallaxer/.parallaxer`
- configurations dir: `~/.parallaxer/configurations`
- playlist file path: `<folder>/playlist.json`

Implement storage helpers similar to:

```rust
fn app_root_dir() -> Result<PathBuf, String>;
fn settings_file_path() -> Result<PathBuf, String>;
fn configurations_dir() -> Result<PathBuf, String>;
fn configuration_file_path(id: &str) -> Result<PathBuf, String>;
fn playlist_file_path(source_folder: &str) -> PathBuf;
fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, String>;
fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String>;
```

- [ ] **Step 3: Implement monitor enumeration with Windows-first stable IDs**

Replace the old `list_monitors` command. Requirements:

- enumerate current displays from Tauri for geometry
- on Windows, enrich with WMI/EDID-like metadata if available
- emit `deviceId`, `friendlyName`, `connected`, geometry, and metadata fields
- keep non-Windows implementations compiling by using geometry/system fallback

Implementation target:

```rust
#[tauri::command]
fn list_monitors(app: AppHandle) -> Result<Vec<MonitorRecord>, String> { ... }
```

Priority order for `deviceId`:

1. Windows stable identity if confidently available
2. serial/product tuple if available
3. geometry fallback

The result does not have to solve every Windows edge case perfectly, but it must be consistent and usable for first-pass persistence.

- [ ] **Step 4: Implement settings/configuration/playlist commands**

Replace file-picker project commands with app-storage commands:

```rust
#[tauri::command]
fn load_app_settings() -> Result<AppSettings, String>;

#[tauri::command]
fn save_app_settings(settings: AppSettings) -> Result<(), String>;

#[tauri::command]
fn list_configurations() -> Result<Vec<ConfigurationRecord>, String>;

#[tauri::command]
fn read_configuration(id: String) -> Result<ConfigurationRecord, String>;

#[tauri::command]
fn save_configuration(config: ConfigurationRecord) -> Result<(), String>;

#[tauri::command]
fn delete_configuration(id: String) -> Result<(), String>;

#[tauri::command]
fn read_playlist(source_folder: String) -> Result<Option<PlaylistRecord>, String>;

#[tauri::command]
fn save_playlist(playlist: PlaylistRecord) -> Result<(), String>;
```

Keep the folder picker command:

```rust
#[tauri::command]
fn choose_playlist_folder() -> Option<String>;
```

- [ ] **Step 5: Replace playlist scanning with shortName-based generation**

Implement a generalized scan command:

```rust
#[tauri::command]
fn scan_playlist_folder(
  source_folder: String,
  short_names: Vec<String>,
  previous_entries: Vec<PlaylistEntry>
) -> Result<Vec<PlaylistEntry>, String>;
```

Rules:

- scan one subfolder per `shortName`
- union all discovered filenames
- build `perMonitor`
- compute `status` and `message`
- merge previous `visibility` by `fileName`
- default new rows to visible only when fully ready

- [ ] **Step 6: Replace presentation state with per-display payloads**

Remove stereo-only state and commands. Replace them with generalized playback state:

```rust
#[derive(Default)]
struct PresentationState {
    active: bool,
    payload: Option<PresentationPayload>,
}

#[tauri::command]
fn start_presentation(
  app: AppHandle,
  state: State<'_, Mutex<PresentationState>>,
  payload: PresentationPayload
) -> Result<(), String>;

#[tauri::command]
fn sync_presentation(
  app: AppHandle,
  state: State<'_, Mutex<PresentationState>>,
  payload: PresentationPayload
) -> Result<(), String>;

#[tauri::command]
fn get_presentation_state(
  state: State<'_, Mutex<PresentationState>>
) -> Result<Option<PresentationPayload>, String>;

#[tauri::command]
fn stop_presentation(
  app: AppHandle,
  state: State<'_, Mutex<PresentationState>>
) -> Result<(), String>;
```

Do not keep `left_asset_path`, `right_asset_path`, or `left_mapping`, `right_mapping`.

- [ ] **Step 7: Update permissions and run backend verification**

Update `src-tauri/capabilities/app-default.json` to include:

```json
[
  "core:default",
  "core:window:allow-create",
  "core:window:allow-close",
  "core:window:allow-minimize",
  "core:window:allow-toggle-maximize",
  "core:window:allow-start-dragging",
  "core:webview:allow-create-webview-window"
]
```

Run: `cargo test`
Expected: pass backend unit tests and compile the new command surface.

### Task 3: Build The Frameless Shell And Reusable Sidebar System

**Files:**
- Create: `src/components/shell/TitleBar.vue`
- Create: `src/components/shell/Sidebar.vue`
- Create: `src/components/shell/WorkspaceFrame.vue`
- Create: `src/lib/window.ts`
- Modify: `src/styles.css`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Enable the frameless main window**

Update `src-tauri/tauri.conf.json` main window configuration to use a custom-drawn shell:

```json
{
  "label": "main",
  "title": "Parallaxer",
  "width": 1420,
  "height": 920,
  "resizable": true,
  "center": true,
  "visible": true,
  "decorations": false
}
```

Keep asset protocol settings intact.

- [ ] **Step 2: Add a small window helper module**

Create `src/lib/window.ts` for window actions:

```ts
import { getCurrentWindow } from '@tauri-apps/api/window';

export async function minimizeWindow(): Promise<void> {
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  await getCurrentWindow().toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  await getCurrentWindow().close();
}
```

- [ ] **Step 3: Build the custom title bar**

Create `TitleBar.vue` with:

- sidebar collapse/expand button
- `File`, `Edit`, `Help` dropdown triggers
- drag region across the center
- minimize, maximize/restore, close buttons

Requirements:

- use `data-tauri-drag-region`
- menu buttons must not drag the window
- actions are emitted upward rather than owning business logic

Suggested prop/event shape:

```ts
defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  toggleSidebar: [];
  command: [menu: 'file' | 'edit' | 'help', actionKey: string];
}>();
```

- [ ] **Step 4: Build the declarative sidebar core**

Create `Sidebar.vue` around the requested generic protocol. Use a practical grouped item shape while preserving the four conceptual prop families:

```ts
export interface SidebarAction {
  key?: string;
  hoverTip?: string;
  icon: string;
}

export interface SidebarButton {
  icon?: string;
  title: string;
  hoverTip: string;
  key: string;
}

export interface SidebarList {
  title: string;
  emptyHint: string;
  key: string;
  actions: SidebarAction[];
}

export interface SidebarItem {
  key: string;
  selected: boolean;
  head?: SidebarAction;
  hoverHead?: SidebarAction;
  title: string;
  tail: string | SidebarAction;
  hoverTail: string | SidebarAction[];
}
```

Recommended prop surface:

```ts
defineProps<{
  collapsed: boolean;
  width: number;
  headButtons: SidebarButton[];
  bodyLists: SidebarList[];
  tailButtons: SidebarButton[];
  listItems: Record<string, SidebarItem[]>;
}>();
```

Emits:

- `head-button-clicked`
- `list-button-clicked`
- `list-selection-changed`
- `tail-button-clicked`
- `resize`

- [ ] **Step 5: Build the workspace frame and shell styling**

Create `WorkspaceFrame.vue` with:

- `title` prop
- `actions` prop
- slot for content
- rounded left corners

Rebuild `src/styles.css` around the new desktop shell:

- dark workspace tone
- custom title bar
- codex-like sidebar
- subtle gradients and panels
- resizable sidebar presentation
- collapsed animation via `opacity + translateX`

Aim for an intentional desktop look, not a plain form layout.

### Task 4: Build The Workbench Store And The Four Editor Views

**Files:**
- Create: `src/stores/workbench.ts`
- Create: `src/components/workbench/MonitorDetail.vue`
- Create: `src/components/workbench/ConfigurationEditor.vue`
- Create: `src/components/workbench/PlaylistEditor.vue`
- Create: `src/components/workbench/SettingsView.vue`
- Reuse/modify: `src/lib/domain.ts`, `src/lib/sidebar.ts`, `src/lib/ui.ts`

- [ ] **Step 1: Create the centralized workbench store**

Build a plain Vue composable/store without introducing Pinia. It should own:

- loaded monitors
- loaded settings
- loaded configurations
- loaded playlists
- current page
- selected IDs
- selected configuration monitor card
- sidebar width/collapsed state
- menu command handlers
- save/refresh/play actions

Suggested state shape:

```ts
export interface WorkbenchState {
  monitors: MonitorRecord[];
  configurations: ConfigurationRecord[];
  playlists: PlaylistRecord[];
  settings: AppSettings;
  currentPage: 'monitor' | 'configuration' | 'playlist' | 'settings';
  selectedMonitorId: string | null;
  selectedConfigurationId: string | null;
  selectedPlaylistId: string | null;
  selectedConfigurationMonitorKey: string | null;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  statusMessage: string;
  errorMessage: string;
}
```

The store must expose computed mappings for:

- sidebar props
- workspace title
- workspace actions
- current view model

- [ ] **Step 2: Build the monitor detail view**

Create `MonitorDetail.vue` with:

- editable friendly name field
- readonly identity and geometry info
- optional EDID/manufacturer/serial info
- connected/history indicator

This component edits the selected monitor override in store state, then persists through settings save.

- [ ] **Step 3: Build the configuration editor**

Create `ConfigurationEditor.vue` with:

- name input
- description textarea
- horizontal monitor card strip
- special 9:16 `Add Monitor` card
- monitor selection popover/list
- selection of one configuration monitor card
- shortName editing
- rotation buttons
- mirror buttons

Keep the first pass focused:

- add monitor
- remove monitor
- pick selected monitor card
- edit `shortName`
- edit mapping

Do not overbuild drag-and-drop reordering or advanced transforms.

- [ ] **Step 4: Build the playlist editor**

Create `PlaylistEditor.vue` with:

- playlist name
- source folder chooser
- configuration dropdown
- mapping mode dropdown
- immediate regeneration when folder/config changes
- generated entry table with file name, message, visibility
- `Save` and `Play` actions controlled by the workspace frame/store

When regenerating:

- call `scanPlaylistFolder`
- replace `entries`
- update `playlistFilePath`

- [ ] **Step 5: Build the settings view**

Create `SettingsView.vue` with only first-pass essentials:

- app root path display
- recent playlist folders
- short explanatory text for storage locations

Keep this view intentionally light.

### Task 5: Integrate The App, Generalize Presentation Windows, Remove Old Stereo Flow, And Run Smoke Verification

**Files:**
- Modify: `src/App.vue`
- Modify: `src/main.ts` only if needed
- Modify: `src/lib/tauri.ts`
- Modify: `src/lib/domain.ts`
- Modify: `src/lib/window.ts`
- Modify: `src/styles.css`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Replace `App.vue` with shell-driven composition**

`src/App.vue` should become a thin coordinator that:

- detects whether the current window is the main workbench or a presentation window
- mounts the custom shell and current workbench view in main mode
- mounts a generalized presentation renderer in presentation mode

Recommended shape:

```vue
<template>
  <main v-if="isPresentationWindow">...</main>
  <main v-else class="app-shell">
    <TitleBar ... />
    <section class="main-layout">
      <Sidebar ... />
      <WorkspaceFrame ...>
        <MonitorDetail v-if="currentPage === 'monitor'" ... />
        <ConfigurationEditor v-else-if="currentPage === 'configuration'" ... />
        <PlaylistEditor v-else-if="currentPage === 'playlist'" ... />
        <SettingsView v-else ... />
      </WorkspaceFrame>
    </section>
  </main>
</template>
```

- [ ] **Step 2: Generalize presentation windows to one window per configuration monitor**

Replace the old left/right creation flow. When `Play` is triggered:

- resolve the selected playlist and configuration
- build a `PresentationPayload`
- open one window per `payload.displays`
- use a unique `windowLabel`, for example `presentation-${shortName}`
- point the URL at `index.html?view=presentation&shortName=${shortName}`
- push payload to the runtime state

Presentation window rendering rules:

- resolve the correct display entry using the current window query or label
- render image or video based on the resolved asset path
- apply rotation and mirror transform from the display entry mapping

- [ ] **Step 3: Replace keyboard navigation with generalized playable stepping**

Main window keyboard behavior:

- `Escape` stops playback
- `ArrowLeft` steps to previous playable row
- `ArrowRight` steps to next playable row

Presentation windows should forward these keys back to the main window, as the current app already does, but without stereo-specific labels.

- [ ] **Step 4: Remove obsolete stereo code and obsolete tests**

Delete or replace:

- stereo-only labels/constants
- `leftDisplay`/`rightDisplay`
- stereo playlist scanning
- stereo preview components
- tests asserting `left/right` data contracts

Do not leave dead compatibility helpers behind.

- [ ] **Step 5: Run the final smoke verification**

Run these commands in order:

Run: `npm test`
Expected: pass the reduced high-value frontend test suite

Run: `npm run build`
Expected: TypeScript and Vite build succeed

Run: `cargo test`
Expected: backend test/compile check succeeds

If something fails, fix only what is needed to restore a clean smoke pass. Do not add broad new testing scope.
