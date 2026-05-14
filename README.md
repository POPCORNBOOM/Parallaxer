# Parallaxer

[English](./README.md) | [简体中文](./docs/README_zhCN.md)

<p align="center">
  <img src="./app-icon.png" alt="Parallaxer icon" width="132" height="132">
</p>

<p align="center">
  <a href="https://vuejs.org/">
    <img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vue.js&logoColor=white">
  </a>
  <a href="https://tauri.app/">
    <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  </a>
  <a href="https://www.typescriptlang.org/">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white">
  </a>
  <img alt="Windows" src="https://img.shields.io/badge/Windows-supported-0078D6?style=flat-square&logo=windows&logoColor=white">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-supported-111111?style=flat-square&logo=apple&logoColor=white">
  <img alt="Linux" src="https://img.shields.io/badge/Linux-supported-FCC624?style=flat-square&logo=linux&logoColor=111111">
  <img alt="Desktop" src="https://img.shields.io/badge/Desktop-Multi--Display-3a3f47?style=flat-square">
  <img alt="Monitor ID" src="https://img.shields.io/badge/Monitor%20ID-EDID--first-4b5563?style=flat-square">
</p>
<div align="center">
  <img src="https://skillicons.dev/icons?i=vscode,codex" />
</div>
<p align="center">
  <a href="https://github.com/POPCORNBOOM/Parallaxer/stargazers">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/POPCORNBOOM/Parallaxer?style=social">
  </a>
</p>

Parallaxer is a desktop app for mapping images and videos across one or more displays, previewing the result in real time, and playing synchronized multi-screen content.

It is built with:

- Vue 3
- Vite
- TypeScript
- Tauri 2

![Parallaxer playlist page](./docs/assets/playlist_page.webp)

## What It Does

Parallaxer is designed for multi-display visual setups where:

- one image or video should be automatically split and shown across multiple displays at the same time
- a group of same-named assets should be mapped to different displays at the same time
- display order, orientation, and calibration must be controlled precisely before playback

It lets you:

- discover active and previously connected monitors
- assign friendly names to monitors
- build reusable display configurations
- reorder monitors inside a configuration
- adjust per-monitor mapping:
  - rotation
  - mirror
  - scale X / scale Y
  - offset X / offset Y
- preview calibration graphics on the real target displays
- create playlists from a media folder
- play synchronized fullscreen content across multiple displays

## Media Mapping Model

Each playlist is bound to:

- one source folder
- one configuration

Parallaxer supports two content sources inside that folder:

1. Shared media in the source folder root

- Images and videos placed directly in the playlist folder root are treated as shared media.
- Shared media is automatically divided horizontally by the number of monitors in the selected configuration.
- Slices are mapped from left to right using the monitor order defined in the configuration.
- This means one image or one video can be automatically split and shown across multiple displays at the same time.

2. Per-monitor overrides using short-name folders

- Each monitor in a configuration has a `shortName`.
- If a subfolder matching that `shortName` exists, files inside that subfolder override the shared slice for that monitor.
- A set of same-named assets can therefore live in different folders and be mapped to different displays at the same time.
- This allows one playlist item to mix shared assets and per-monitor assets.

### Guide Screens

Step `00` selects the configuration used by the playlist:

![Playlist guide step 00](./docs/assets/playlist_WSID_00.webp)

Step `01` demonstrates automatic horizontal splitting from the source folder root:

![Playlist guide step 01](./docs/assets/playlist_WSID_01.webp)

Step `02` demonstrates per-monitor overrides using short-name folders:

![Playlist guide step 02](./docs/assets/playlist_WSID_02.webp)

## Main Concepts

### Monitor

A monitor record contains:

- a stable device identifier
- system name
- friendly name
- geometry and scale information
- connection state
- last seen time

Windows uses EDID-first monitor identity resolution. Linux and macOS also have non-stub monitor ID paths, but Windows currently has the most complete implementation.

![Monitor page](./docs/assets/monitor_page.webp)

### Configuration

A configuration defines:

- which monitors participate
- monitor order
- each monitor's `shortName`
- each monitor's mapping values

The configuration file name is treated as the configuration's unique identifier. The display name stored in JSON can be edited without renaming the file.

![Configuration page](./docs/assets/configuration_page.webp)

### Playlist

A playlist represents one source folder and stores:

- playlist name
- selected configuration
- generated entries
- entry visibility

Each playlist persists beside its source folder as `playlist.json`.

![Playlist page](./docs/assets/playlist_page.webp)

## Storage

Parallaxer writes application data outside the project directory.

Application data root:

- `~/.parallaxer`

Current storage layout:

- `~/.parallaxer/.parallaxer`
  - app settings
  - monitor history
  - cached playlist folders
  - UI preferences
- `~/.parallaxer/configurations/*.json`
  - saved configurations
- `<playlist-folder>/playlist.json`
  - playlist data stored beside the source media

## Playback

Parallaxer supports two related runtime modes:

1. Configuration preview

- opens calibration surfaces on the mapped displays
- shows grid / corners / center reference marks
- helps tune mapping values before playback

2. Playlist playback

- opens fullscreen presentation windows on the configured displays
- keeps images and videos synchronized
- supports keyboard controls in presentation focus
- plays audio from the first available video source

## Current Status

The project is actively evolving and currently focuses on:

- Windows-first multi-display workflows
- calibration-heavy setups
- real-time multi-screen media mapping

The Linux and macOS monitor identity paths are wired up, but Windows remains the most mature platform for display identification.

## Development

### Requirements

You need:

- Node.js
- npm
- Rust toolchain
- Tauri 2 prerequisites for your platform

For Tauri setup instructions:

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install

```bash
npm install
```

### Run the app in development

```bash
npm run tauri dev
```

### Run the web dev server only

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## Project Structure

```text
src/                 Vue UI, stores, view models, mapping logic
src-tauri/           Tauri host, monitor discovery, filesystem, playback windows
docs/                Project docs
original_prompt.md   Original product direction prompt
```

## Notes

- The main window uses a custom title bar and shell layout.
- Configuration and playlist editing are auto-saved with debounce.
- Historical monitors remain available in the monitor list even when disconnected.

## Theme

Parallaxer includes:

- dark mode
- light mode
- follow-system mode

![Settings page in light mode](./docs/assets/setting_page_light_mode.webp)

## License

No license file is currently included in this repository.
