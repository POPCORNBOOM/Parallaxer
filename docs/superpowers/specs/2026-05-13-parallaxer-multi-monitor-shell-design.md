# Parallaxer Multi-Monitor Shell Design

## Goal

Rebuild Parallaxer from a fixed left/right stereo projector into a desktop app that can manage one or more monitor-to-image mapping groups through a Codex-style shell: custom title bar, collapsible sidebar, and a workbench that switches between monitors, configurations, playlists, and settings without route changes.

## Current State

The current app is a small Vue 3 + Tauri desktop application with most UI and orchestration logic concentrated in [src/App.vue](D:/Projects/Parallaxer/src/App.vue). The data model is hard-coded around two displays and a single playlist source:

- `ProjectConfig` stores `leftDisplay`, `rightDisplay`, and a stereo playlist.
- Presentation windows are opened as `left-display` and `right-display`.
- Playlist scanning assumes `left/` and `right/` folders.
- Persistence is file-picker-driven and centered on a single JSON project file.

This is incompatible with the requested direction:

- N-display configurations instead of fixed left/right bindings
- A reusable declarative sidebar shell
- Playlist generation based on configuration monitor `shortName`
- Application-managed persistence in `~/.parallaxer`
- A workbench model where switching views is controlled by state, not routing

## Product Direction

Parallaxer becomes a monitor-centric workspace application with four primary surfaces:

1. `Monitors`
- Shows currently connected and historically seen monitors
- Lets the user inspect monitor identity and edit a human-friendly name

2. `Configurations`
- Defines a named multi-monitor mapping group
- Each configuration contains one or more monitor bindings
- Each binding stores a configuration-local `shortName` plus mapping settings such as rotation and mirror

3. `Playlists`
- Binds a configuration to a media folder
- Generates entries by scanning `shortName/fileName`
- Stores user visibility toggles and playlist metadata in `playlist.json`

4. `Settings`
- Global application state and preferences
- No route change required; the shell stays the same and only sidebar/workbench state changes

## Shell Architecture

The new shell is built from four layers.

### 1. WindowShell

Responsible for the outer desktop shell:

- Custom frameless main window
- Drag regions
- Collapse/expand sidebar
- Window control buttons
- Top menu bar layout

The shell must use Tauri window customization:

- Main window `decorations: false`
- Drag regions via `data-tauri-drag-region`
- Window actions via `getCurrentWindow().minimize()`, `toggleMaximize()`, and `close()`

The following Tauri window permissions are required:

- `core:window:allow-minimize`
- `core:window:allow-toggle-maximize`
- `core:window:allow-close`
- `core:window:allow-start-dragging`

Menu behavior for this phase:

- `File`, `Edit`, and `Help` are frontend-rendered dropdown menus
- They are not native OS menus
- They trigger app actions such as new config, open playlist folder, save, refresh, and about

### 2. Sidebar System

The sidebar is a generic, declarative UI component. It must not know about monitors, configurations, playlists, or settings as domain concepts.

It is driven only by four props:

- `headButtons`
- `bodyLists`
- `tailButtons`
- `listItems`

And it emits only four intent events:

- `HeadButtonClicked(buttonKey)`
- `ListButtonClicked(listKey, itemKey | null, actionKey)`
- `ListSelectionChanged(listKey, itemKey)`
- `TailButtonClicked(buttonKey)`

This allows future feature pages to reuse the same sidebar by changing props and handling emits in the controller layer.

### 3. Workbench Controller

This is the stateful orchestration layer between reusable shell components and domain state.

Responsibilities:

- Build sidebar props from app state
- Track the active page and selected entity
- Compute workspace title and actions
- Translate sidebar emits into domain actions
- Manage unsaved state and modal/popover visibility
- Validate playlist playability before launching a session

This layer should live outside `App.vue` so the main composition file becomes a thin assembly layer.

### 4. Domain + Runtime

This layer owns:

- Domain models
- Persistence format
- Playlist generation
- Playback session state
- Window synchronization

Vue components must not directly assemble display window labels, resolve monitor folders, or mix persistence concerns into rendering code.

## Data Model

The old fixed stereo model is replaced with the following structures.

### MonitorRecord

Represents a physical or historically known display.

- `deviceId: string`
- `systemName: string`
- `friendlyName: string`
- `connected: boolean`
- `position: { x: number; y: number }`
- `size: { width: number; height: number }`
- `refreshRate?: number`
- `manufacturer?: string`
- `productCode?: string`
- `serialNumber?: string`
- `edid?: string`
- `lastSeenAt: string`

Identity strategy:

- Windows: prefer a stable WMI/EDID-derived identifier
- Other platforms: fall back to geometry/system-derived identity

### Configuration

Represents a named monitor mapping set.

- `id: string`
- `name: string`
- `description: string`
- `monitors: ConfigurationMonitor[]`

### ConfigurationMonitor

Represents one monitor binding inside a configuration.

- `deviceId: string`
- `shortName: string`
- `order: number`
- `mapping: MonitorMapping`

`shortName` is configuration-local and unique within a configuration. The same physical monitor may use different `shortName` values in different configurations.

### MonitorMapping

Initial supported mapping controls:

- `rotation: 0 | 90 | 180 | 270`
- `mirror: 'none' | 'horizontal' | 'vertical' | 'both'`

Reserved for future expansion:

- `scale?: number`
- `offsetX?: number`
- `offsetY?: number`

### Playlist

Represents a generated or persisted playable list for a source folder.

- `id: string`
- `name: string`
- `sourceFolder: string`
- `configurationId: string`
- `mappingMode: 'same-name-separated-by-shortname'`
- `entries: PlaylistEntry[]`
- `playlistFilePath: string`

### PlaylistEntry

Represents one shared filename across all configuration monitors.

- `fileName: string`
- `visibility: boolean`
- `status: 'ready' | 'partial-missing' | 'missing-all'`
- `message: string`
- `perMonitor: Record<string, PlaylistMonitorEntry>`

### PlaylistMonitorEntry

- `exists: boolean`
- `relativePath: string`
- `info?: string`

The `perMonitor` record is keyed by configuration `shortName`.

### AppSettings

Stores application-global persistent state.

- `monitorOverrides: Record<string, { friendlyName: string }>`
- `recentPlaylistFolders: string[]`
- `cache: Record<string, unknown>`
- `lastSelectedPage?: string`
- `lastSelectedEntityId?: string`

### PlaybackSession

Represents the current live presentation runtime.

- `playlistId: string`
- `configurationId: string`
- `currentIndex: number`
- `windowLabelsByShortName: Record<string, string>`
- `active: boolean`
- `startedAt: string`

## Persistence Layout

Application-managed persistence replaces the old single project file workflow.

### App root

- `~/.parallaxer/.parallaxer`

Stores:

- global settings
- monitor cache/history
- recent folders
- shell memory such as last selected page

### Configurations

- `~/.parallaxer/configurations/<configuration-id>.json`

Each configuration is stored as its own file.

### Playlists

- `<playlist source folder>/playlist.json`

Each playlist persists beside its source media folder.

This matches the requirement that the chosen playlist folder itself contains `playlist.json`.

## Monitor Identity Strategy

### Windows

Use a Windows-specific backend for stable monitor identity:

- query WMI monitor classes such as `WmiMonitorID`
- derive a monitor identity from manufacturer, product code, serial number, or another stable EDID-based tuple when available

Collected metadata should be merged with Tauri monitor geometry so the app gets both:

- stable identity for persistence
- position/size for window placement

### Other platforms

Degrade gracefully to currently available monitor data:

- system name
- geometry
- size

The domain model remains the same, but some identity fields may be blank.

## UI Structure

### Top Menu Bar

From left to right:

- sidebar collapse/expand button
- `File`
- `Edit`
- `Help`
- spacer/drag region
- minimize
- maximize/restore
- close

The entire header must feel like one integrated shell, not a browser toolbar inside a system window.

### Sidebar

The sidebar must support:

- top button group
- grouped body lists
- bottom button group
- flexible list item display
- hover actions
- selected state
- collapsed mode
- resizable width

Requested default content mapping:

#### Head buttons

- `new-config`
- `new-playlist`

#### Body lists

- `monitors` with `refresh`
- `configurations` with `refresh` and `new`
- `playlists` with `refresh` and `open`

#### Tail buttons

- `settings`

### Sidebar collapse behavior

When the width is dragged below the collapse threshold:

- sidebar enters collapsed mode
- textual content fades and shifts left
- workspace visually covers the sidebar edge
- icon-only navigation remains visible

This should resemble the Codex desktop feel rather than a simple display-none toggle.

### Workspace Frame

The workspace occupies the remaining horizontal space after the sidebar. It must provide:

- rounded top-left and bottom-left corners
- `title` prop shown on the upper-left
- `actions` prop shown on the upper-right
- slot content for the page body

## Page Behavior

### Monitor workspace

When a monitor is selected:

- workspace title shows the monitor name
- editable friendly name field is shown
- monitor system details are shown read-only
- if available, show EDID-related fields
- indicate whether the monitor is currently connected or only historical

`shortName` does not belong here because it is configuration-local.

### Configuration workspace

When a configuration is selected:

- workspace title shows the configuration name
- workspace actions include `Save`

Main content from top to bottom:

1. Name field
2. Description field
3. Horizontal monitor card strip
4. Divider
5. Mapping controls for the currently selected configuration monitor

Monitor card behavior:

- first card is a special `Add Monitor` card
- it uses a 9:16 visual card with a large plus sign
- clicking it opens a selection popover sourced from known monitors
- existing cards render the monitor aspect ratio while filling the strip height
- card content includes:
  - monitor friendly name
  - stable device ID
  - configuration-local short name
  - size
  - refresh rate if available

Below the divider, the selected configuration monitor shows:

- rotation buttons `0 / 90 / 180 / 270`
- mirror buttons `None / Horizontal / Vertical / Both`

### Playlist workspace

When a playlist is selected:

- workspace title shows the playlist name
- workspace actions include `Save` and `Play`

Main content from top to bottom:

1. Playlist name
2. Source folder picker
3. Configuration dropdown
4. Mapping mode dropdown
5. Generated entry table

Current mapping mode:

- `same-name-separated-by-shortname`

Behavior:

- changing the source folder immediately regenerates the playlist
- changing the configuration immediately regenerates the playlist
- generated rows show:
  - file name
  - information/message
  - visibility checkbox

Example row semantics:

- `parallax_image.png` -> ready
- `missing_image.png` -> `missing at /monitorA,/monitorB`

Only manually visible and ready entries are playable.

### Settings workspace

Selecting settings does not route away. It swaps the workspace content while using the same shell and sidebar component.

This preserves the requested “state-driven page switching” model.

## Playlist Generation Rules

For a playlist bound to a configuration with monitors:

- `display-a` with `shortName = left`
- `display-b` with `shortName = right`
- `display-c` with `shortName = top`

The source folder is scanned using:

- `left/<fileName>`
- `right/<fileName>`
- `top/<fileName>`

An entry exists for each filename seen in any of the short-name folders.

For each filename:

- build a `perMonitor` map
- compute `status`
- compute a user-facing `message`
- default `visibility` to true only when the entry is fully ready

## Playback Semantics

`Play` means “play the whole playlist”.

When the user clicks `Play`:

1. Validate the playlist
2. Load the referenced configuration
3. Resolve every configuration monitor to a currently connected physical monitor
4. Open one fullscreen presentation window per configuration monitor
5. Start at the first ready and visible playlist entry
6. Render the same playlist index across all display windows
7. Resolve each display resource from `shortName/fileName`

Playback mode for this phase is manual only:

- `ArrowLeft` -> previous playable entry
- `ArrowRight` -> next playable entry
- `Escape` -> stop playback and close presentation windows

No automatic timer-based progression is included in this phase.

## Validation Rules

### Configuration validation

- name is required
- at least one monitor binding is required
- `shortName` must be unique within the configuration
- `deviceId` should not be duplicated inside the same configuration

### Playlist validation

- name is required
- `sourceFolder` is required
- `configurationId` is required
- configuration must resolve to at least one monitor binding
- at least one playlist entry must be `visibility = true` and `status = ready`

### Play validation

Before starting playback:

- the playlist must reference an existing configuration
- every configuration monitor must match a currently connected monitor
- there must be at least one ready and visible entry

## Rust / Tauri Responsibilities

Rust owns environment and OS-facing concerns:

- resolve app storage root
- read/write app settings
- read/write configuration files
- read/write playlist files
- scan playlist folders
- enumerate monitors
- enrich Windows monitor identity through WMI/EDID
- open and manage fullscreen playback windows
- broadcast synchronized playback state to presentation windows

Frontend owns shell composition and editing interaction:

- title bar rendering
- sidebar rendering and event handling
- workspace view switching
- form editing
- save/play/refresh triggers
- optimistic UI state

## Presentation Window Generalization

The current presentation implementation is hard-coded to left/right windows and left/right payload fields.

It must be replaced by a generalized model:

- one payload entry per configuration monitor
- one window label per `shortName`
- one presentation window component that reads its own `shortName` or label-scoped state

This removes the stereo assumption from runtime playback.

## Recommended Module Structure

The implementation should move toward smaller focused units:

- `src/components/shell/TitleBar.vue`
- `src/components/shell/Sidebar.vue`
- `src/components/shell/WorkspaceFrame.vue`
- `src/components/workbench/MonitorDetail.vue`
- `src/components/workbench/ConfigurationEditor.vue`
- `src/components/workbench/PlaylistEditor.vue`
- `src/components/workbench/SettingsView.vue`
- `src/stores/workbench.ts`
- `src/stores/library.ts`
- `src/lib/monitors.ts`
- `src/lib/configurations.ts`
- `src/lib/playlists.ts`
- `src/lib/playback.ts`
- `src/lib/window.ts`

Exact filenames may vary, but the responsibility split should follow these boundaries.

## Implementation Sequence

The first implementation pass should proceed in this order:

1. Replace the old stereo domain model with N-monitor types and pure helpers
2. Expand Tauri commands for settings/configuration/playlist IO and generalized playback
3. Implement the frameless shell and required window permissions
4. Build the reusable declarative sidebar and workspace frame
5. Build monitor/configuration/playlist/settings workbench views
6. Introduce a controller/store layer that maps domain state into sidebar props and workspace state
7. Reconnect playback with generalized per-monitor windows and manual navigation keys

## Explicit Non-Goals For This Phase

To keep scope coherent, this phase does not include:

- automatic slideshow timing
- route-based navigation
- native OS menu integration
- cross-platform stable monitor identity parity with Windows
- advanced transforms beyond rotation and mirror

## Risks

### Windows monitor identity matching

Stable ID resolution may not always perfectly align between WMI monitor records and Tauri monitor geometry. A reconciliation strategy will be needed, likely based on joining stable identity metadata with current geometry order.

### Playlist folder ambiguity

If users manually edit folders and `playlist.json`, the app needs deterministic regeneration rules so saved visibility and regenerated entries merge predictably.

### UI density

Configurations with many displays will make horizontal monitor cards dense. The first pass should support scrolling rather than over-optimizing for every monitor count.

## Design Summary

Parallaxer should stop behaving like a two-eye projector editor and become a shell-based multi-monitor media mapping workstation. The core design decisions are:

- replace left/right assumptions with configuration-scoped monitor bindings
- use a declarative sidebar protocol that emits intent instead of owning business logic
- store app state under `~/.parallaxer` and playlist state beside media folders
- use Windows-first stable monitor identity via WMI/EDID, with graceful degradation elsewhere
- play playlists by opening one fullscreen synchronized window per configuration monitor and resolving assets from `shortName/fileName`
