use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use dirs::home_dir;
use rfd::FileDialog;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State};

const APP_DIR_NAME: &str = ".parallaxer";
const SETTINGS_FILE_NAME: &str = ".parallaxer.json";
const CONFIGURATIONS_DIR_NAME: &str = "configurations";
const PLAYLIST_FILE_NAME: &str = "playlist.json";
const PRESENTATION_EVENT: &str = "presentation:sync";
const PRESENTATION_WINDOW_PREFIX: &str = "presentation-";

#[derive(Default)]
struct PresentationState {
    active: bool,
    payload: Option<PresentationPayload>,
}

impl PresentationState {
    fn start(&mut self, payload: PresentationPayload) {
        self.active = true;
        self.payload = Some(payload);
    }

    fn sync(&mut self, payload: PresentationPayload) {
        self.payload = Some(payload);
    }

    fn stop(&mut self) -> Option<PresentationPayload> {
        let previous = self.payload.clone();
        self.active = false;
        self.payload = None;
        previous
    }

    fn snapshot(&self) -> Option<PresentationPayload> {
        if self.active {
            self.payload.clone()
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct Position {
    x: i32,
    y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct Size {
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct MonitorRecord {
    device_id: String,
    system_name: String,
    friendly_name: String,
    connected: bool,
    position: Position,
    size: Size,
    scale_factor: Option<f64>,
    refresh_rate: Option<u32>,
    manufacturer: Option<String>,
    product_code: Option<String>,
    serial_number: Option<String>,
    edid: Option<String>,
    last_seen_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
struct MonitorOverride {
    friendly_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    monitor_overrides: BTreeMap<String, MonitorOverride>,
    recent_playlist_folders: Vec<String>,
    cache: BTreeMap<String, Value>,
    last_selected_page: Option<String>,
    last_selected_entity_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct MonitorMapping {
    rotation: u16,
    mirror: String,
    scale: Option<f64>,
    offset_x: Option<f64>,
    offset_y: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ConfigurationMonitor {
    device_id: String,
    short_name: String,
    order: i32,
    mapping: MonitorMapping,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ConfigurationRecord {
    id: String,
    name: String,
    description: String,
    monitors: Vec<ConfigurationMonitor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PlaylistMonitorEntry {
    exists: bool,
    relative_path: String,
    info: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum PlaylistEntryStatus {
    Ready,
    PartialMissing,
    MissingAll,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PlaylistEntry {
    file_name: String,
    visibility: bool,
    status: PlaylistEntryStatus,
    message: String,
    per_monitor: BTreeMap<String, PlaylistMonitorEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PlaylistRecord {
    id: String,
    name: String,
    source_folder: String,
    configuration_id: String,
    mapping_mode: String,
    entries: Vec<PlaylistEntry>,
    playlist_file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PresentationDisplayPayload {
    short_name: String,
    window_label: String,
    device_id: String,
    asset_path: String,
    relative_path: String,
    frame: Option<Size>,
    mapping: MonitorMapping,
    selected: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PresentationPayload {
    active: bool,
    playlist_id: String,
    configuration_id: String,
    index: usize,
    total: usize,
    file_name: String,
    displays: Vec<PresentationDisplayPayload>,
}

#[derive(Debug, Clone, Default)]
struct PlatformMonitorMetadata {
    stable_device_id: Option<String>,
    system_name: Option<String>,
    friendly_name: Option<String>,
    refresh_rate: Option<u32>,
    manufacturer: Option<String>,
    product_code: Option<String>,
    serial_number: Option<String>,
    edid: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct ScannedFolder {
    folder_exists: bool,
    files: BTreeMap<String, String>,
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn current_timestamp_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn default_system_name(index: usize) -> String {
    format!("Display {}", index + 1)
}

fn build_geometry_device_id(position: &PhysicalPosition<i32>, size: &PhysicalSize<u32>) -> String {
    format!(
        "geometry:{}:{}:{}:{}",
        position.x, position.y, size.width, size.height
    )
}

fn normalize_identity_segment(value: &str) -> String {
    let normalized = value
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();

    let collapsed = normalized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if collapsed.is_empty() {
        "unknown".to_string()
    } else {
        collapsed
    }
}

fn build_serial_product_device_id(metadata: &PlatformMonitorMetadata) -> Option<String> {
    let product_code = metadata.product_code.as_deref()?.trim();
    let serial_number = metadata.serial_number.as_deref()?.trim();
    if product_code.is_empty() || serial_number.is_empty() {
        return None;
    }

    let manufacturer = metadata
        .manufacturer
        .as_deref()
        .map(normalize_identity_segment)
        .unwrap_or_else(|| "unknown".to_string());

    Some(format!(
        "monitor:{}:{}:{}",
        manufacturer,
        normalize_identity_segment(product_code),
        normalize_identity_segment(serial_number)
    ))
}

fn build_edid_device_id(metadata: &PlatformMonitorMetadata) -> Option<String> {
    let manufacturer = metadata.manufacturer.as_deref()?.trim();
    let product_code = metadata.product_code.as_deref()?.trim();
    let serial_number = metadata.serial_number.as_deref()?.trim();
    if manufacturer.is_empty() || product_code.is_empty() || serial_number.is_empty() {
        return None;
    }

    Some(format!(
        "edid:{}:{}:{}",
        normalize_identity_segment(manufacturer),
        normalize_identity_segment(product_code),
        normalize_identity_segment(serial_number)
    ))
}

fn supported_media_extensions() -> &'static [&'static str] {
    &[
        "png", "jpg", "jpeg", "bmp", "gif", "webp", "avif", "mp4", "webm", "mov", "mkv", "avi",
        "m4v",
    ]
}

fn is_supported_media_file(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    matches!(extension.as_deref(), Some(value) if supported_media_extensions().contains(&value))
}

fn app_root_dir_from(home: &Path) -> PathBuf {
    home.join(APP_DIR_NAME)
}

fn app_root_dir() -> Result<PathBuf, String> {
    let home =
        home_dir().ok_or_else(|| "Unable to resolve the user home directory.".to_string())?;
    Ok(app_root_dir_from(&home))
}

fn settings_file_path() -> Result<PathBuf, String> {
    Ok(app_root_dir()?.join(SETTINGS_FILE_NAME))
}

fn configurations_dir() -> Result<PathBuf, String> {
    Ok(app_root_dir()?.join(CONFIGURATIONS_DIR_NAME))
}

fn validate_identifier(id: &str) -> Result<String, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err("Identifier cannot be empty.".to_string());
    }

    if trimmed == "." || trimmed == ".." || trimmed.contains('/') || trimmed.contains('\\') {
        return Err(format!("Invalid identifier: {trimmed}"));
    }

    Ok(trimmed.to_string())
}

fn configuration_file_path(id: &str) -> Result<PathBuf, String> {
    Ok(configurations_dir()?.join(format!("{}.json", validate_identifier(id)?)))
}

fn playlist_file_path(source_folder: &str) -> PathBuf {
    PathBuf::from(source_folder.trim()).join(PLAYLIST_FILE_NAME)
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    ensure_parent_dir(path)?;
    let content = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn collect_media_files(base: &Path, short_name: &str) -> Result<ScannedFolder, String> {
    let target = base.join(short_name);
    if !target.exists() {
        return Ok(ScannedFolder::default());
    }

    if !target.is_dir() {
        return Err(format!("Expected a folder for shortName '{short_name}'."));
    }

    let mut files = BTreeMap::new();
    let entries = fs::read_dir(&target).map_err(|error| error.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() || !is_supported_media_file(&path) {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        files.insert(file_name.to_string(), format!("{short_name}/{file_name}"));
    }

    Ok(ScannedFolder {
        folder_exists: true,
        files,
    })
}

fn unique_short_names(short_names: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = BTreeSet::new();

    for short_name in short_names {
        let trimmed = short_name.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }

        result.push(trimmed.to_string());
    }

    result
}

fn build_playlist_message(
    status: &PlaylistEntryStatus,
    missing: &[String],
    monitor_count: usize,
) -> String {
    match status {
        PlaylistEntryStatus::Ready => {
            if monitor_count == 1 {
                "Ready on 1 monitor".to_string()
            } else {
                format!("Ready on all {monitor_count} monitors")
            }
        }
        PlaylistEntryStatus::PartialMissing => format!("Missing on: {}", missing.join(", ")),
        PlaylistEntryStatus::MissingAll => {
            if monitor_count == 0 {
                "No monitor folders configured".to_string()
            } else {
                format!("Missing on all monitors: {}", missing.join(", "))
            }
        }
    }
}

fn build_playlist_entries(
    source_folder: &str,
    short_names: &[String],
    previous_entries: &[PlaylistEntry],
) -> Result<Vec<PlaylistEntry>, String> {
    let trimmed_source_folder = source_folder.trim();
    if trimmed_source_folder.is_empty() {
        return Ok(Vec::new());
    }

    let base = PathBuf::from(trimmed_source_folder);
    if !base.exists() {
        return Err(format!(
            "Playlist folder does not exist: {trimmed_source_folder}"
        ));
    }

    if !base.is_dir() {
        return Err(format!(
            "Playlist source is not a folder: {trimmed_source_folder}"
        ));
    }

    let mut scanned_by_monitor = BTreeMap::new();
    let mut discovered_names = BTreeSet::new();

    for short_name in short_names {
        let scanned = collect_media_files(&base, short_name)?;
        for file_name in scanned.files.keys() {
            discovered_names.insert(file_name.clone());
        }
        scanned_by_monitor.insert(short_name.clone(), scanned);
    }

    let previous_visibility = previous_entries
        .iter()
        .map(|entry| (entry.file_name.clone(), entry.visibility))
        .collect::<BTreeMap<_, _>>();

    let mut entries = Vec::with_capacity(discovered_names.len());

    for file_name in discovered_names {
        let mut per_monitor = BTreeMap::new();
        let mut ready_count = 0usize;
        let mut missing_monitors = Vec::new();

        for short_name in short_names {
            let scanned = scanned_by_monitor
                .get(short_name)
                .expect("shortName must exist");
            if let Some(relative_path) = scanned.files.get(&file_name) {
                ready_count += 1;
                per_monitor.insert(
                    short_name.clone(),
                    PlaylistMonitorEntry {
                        exists: true,
                        relative_path: relative_path.clone(),
                        info: None,
                    },
                );
            } else {
                missing_monitors.push(short_name.clone());
                per_monitor.insert(
                    short_name.clone(),
                    PlaylistMonitorEntry {
                        exists: false,
                        relative_path: String::new(),
                        info: Some(if scanned.folder_exists {
                            format!("File not found in {short_name}")
                        } else {
                            format!("Folder not found: {short_name}")
                        }),
                    },
                );
            }
        }

        let status = if short_names.is_empty() || ready_count == 0 {
            PlaylistEntryStatus::MissingAll
        } else if ready_count == short_names.len() {
            PlaylistEntryStatus::Ready
        } else {
            PlaylistEntryStatus::PartialMissing
        };

        let message = build_playlist_message(&status, &missing_monitors, short_names.len());
        let visibility = previous_visibility
            .get(&file_name)
            .copied()
            .unwrap_or(matches!(status, PlaylistEntryStatus::Ready));

        entries.push(PlaylistEntry {
            file_name,
            visibility,
            status,
            message,
            per_monitor,
        });
    }

    Ok(entries)
}

fn inactive_presentation_payload(previous: Option<PresentationPayload>) -> PresentationPayload {
    if let Some(mut payload) = previous {
        payload.active = false;
        return payload;
    }

    PresentationPayload {
        active: false,
        playlist_id: String::new(),
        configuration_id: String::new(),
        index: 0,
        total: 0,
        file_name: String::new(),
        displays: Vec::new(),
    }
}

fn emit_presentation_state(app: &AppHandle, payload: &PresentationPayload) -> Result<(), String> {
    app.emit(PRESENTATION_EVENT, payload)
        .map_err(|error| error.to_string())
}

fn close_presentation_windows(app: &AppHandle, payload: Option<&PresentationPayload>) {
    let mut labels = BTreeSet::new();
    if let Some(payload) = payload {
        for display in &payload.displays {
            let label = display.window_label.trim();
            if !label.is_empty() {
                labels.insert(label.to_string());
            }
        }
    }

    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }

    for (label, window) in app.webview_windows() {
        if label.starts_with(PRESENTATION_WINDOW_PREFIX) {
            let _ = window.close();
        }
    }
}

fn validate_presentation_payload(
    app: &AppHandle,
    payload: &PresentationPayload,
) -> Result<(), String> {
    if payload.displays.is_empty() {
        return Err("Presentation payload must include at least one display.".to_string());
    }

    let mut seen_device_ids = BTreeSet::new();
    let mut seen_window_labels = BTreeSet::new();
    for display in &payload.displays {
        if display.device_id.trim().is_empty() {
            return Err("Presentation display is missing deviceId.".to_string());
        }

        if display.window_label.trim().is_empty() {
            return Err("Presentation display is missing windowLabel.".to_string());
        }

        if !seen_device_ids.insert(display.device_id.clone()) {
            return Err(format!(
                "Duplicate deviceId in presentation payload: {}",
                display.device_id
            ));
        }

        if !seen_window_labels.insert(display.window_label.clone()) {
            return Err(format!(
                "Duplicate windowLabel in presentation payload: {}",
                display.window_label
            ));
        }
    }

    let connected_monitor_ids = list_monitor_records(app)?
        .into_iter()
        .map(|monitor| monitor.device_id)
        .collect::<BTreeSet<_>>();

    for display in &payload.displays {
        if !connected_monitor_ids.contains(&display.device_id) {
            return Err(format!("Monitor is not connected: {}", display.device_id));
        }
    }

    Ok(())
}

fn list_monitor_records(app: &AppHandle) -> Result<Vec<MonitorRecord>, String> {
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let metadata = platform_monitor_metadata(&monitors);
    let last_seen_at = current_timestamp_string();
    let mut result = Vec::with_capacity(monitors.len());

    for (index, monitor) in monitors.iter().enumerate() {
        let position = *monitor.position();
        let size = *monitor.size();
        let metadata = metadata.get(index).cloned().unwrap_or_default();
        let system_name = monitor
            .name()
            .cloned()
            .or(metadata.system_name.clone())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| default_system_name(index));
        let friendly_name = metadata
            .friendly_name
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| system_name.clone());
        let device_id = metadata
            .stable_device_id
            .clone()
            .or_else(|| build_edid_device_id(&metadata))
            .or_else(|| build_serial_product_device_id(&metadata))
            .unwrap_or_else(|| build_geometry_device_id(&position, &size));

        result.push(MonitorRecord {
            device_id,
            system_name,
            friendly_name,
            connected: true,
            position: Position {
                x: position.x,
                y: position.y,
            },
            size: Size {
                width: size.width,
                height: size.height,
            },
            scale_factor: Some(monitor.scale_factor()),
            refresh_rate: metadata.refresh_rate,
            manufacturer: metadata.manufacturer,
            product_code: metadata.product_code,
            serial_number: metadata.serial_number,
            edid: metadata.edid,
            last_seen_at: last_seen_at.clone(),
        });
    }

    Ok(result)
}

fn platform_monitor_metadata(monitors: &[tauri::Monitor]) -> Vec<PlatformMonitorMetadata> {
    platform_monitor_metadata_impl(monitors)
}

#[cfg(target_os = "macos")]
fn platform_monitor_metadata_impl(monitors: &[tauri::Monitor]) -> Vec<PlatformMonitorMetadata> {
    vec![PlatformMonitorMetadata::default(); monitors.len()]
}

#[cfg(target_os = "linux")]
fn platform_monitor_metadata_impl(monitors: &[tauri::Monitor]) -> Vec<PlatformMonitorMetadata> {
    vec![PlatformMonitorMetadata::default(); monitors.len()]
}

#[cfg(all(not(windows), not(target_os = "macos"), not(target_os = "linux")))]
fn platform_monitor_metadata_impl(monitors: &[tauri::Monitor]) -> Vec<PlatformMonitorMetadata> {
    vec![PlatformMonitorMetadata::default(); monitors.len()]
}

#[cfg(windows)]
fn platform_monitor_metadata_impl(monitors: &[tauri::Monitor]) -> Vec<PlatformMonitorMetadata> {
    use wmi::{COMLibrary, WMIConnection};

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct DesktopMonitorRow {
        device_id: Option<String>,
        pnp_device_id: Option<String>,
        name: Option<String>,
        monitor_manufacturer: Option<String>,
        monitor_type: Option<String>,
        screen_width: Option<u32>,
        screen_height: Option<u32>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct WmiMonitorIdRow {
        instance_name: Option<String>,
        manufacturer_name: Option<Vec<u16>>,
        product_code_id: Option<Vec<u16>>,
        serial_number_id: Option<Vec<u16>>,
        user_friendly_name: Option<Vec<u16>>,
    }

    fn decode_monitor_string(values: Option<Vec<u16>>) -> Option<String> {
        let values = values?;
        let mut output = String::new();

        for value in values.into_iter().take_while(|value| *value != 0) {
            if let Some(character) = char::from_u32(value as u32) {
                output.push(character);
            }
        }

        let trimmed = output.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    }

    fn normalize_pnp_key(value: &str) -> String {
        let value = value.trim().replace('/', "\\").to_ascii_uppercase();
        if let Some((prefix, suffix)) = value.rsplit_once('_') {
            if suffix.chars().all(|character| character.is_ascii_digit()) {
                return prefix.to_string();
            }
        }
        value
    }

    let mut fallback = vec![PlatformMonitorMetadata::default(); monitors.len()];
    let Ok(com_library) = COMLibrary::new() else {
        return fallback;
    };
    let Ok(cimv2) = WMIConnection::new(com_library) else {
        return fallback;
    };
    let Ok(root_wmi) = WMIConnection::with_namespace_path("ROOT\\WMI", unsafe {
        COMLibrary::assume_initialized()
    }) else {
        return fallback;
    };

    let desktop_rows = cimv2
        .raw_query::<DesktopMonitorRow>(
            "SELECT DeviceID, PNPDeviceID, Name, MonitorManufacturer, MonitorType, ScreenWidth, ScreenHeight FROM Win32_DesktopMonitor",
        )
        .unwrap_or_default();
    let wmi_rows = root_wmi
        .raw_query::<WmiMonitorIdRow>(
            "SELECT InstanceName, ManufacturerName, ProductCodeID, SerialNumberID, UserFriendlyName FROM WmiMonitorID",
        )
        .unwrap_or_default();

    let mut ids_by_pnp = BTreeMap::new();
    for row in wmi_rows {
        if let Some(instance_name) = row.instance_name.as_deref() {
            ids_by_pnp.insert(
                normalize_pnp_key(instance_name),
                (
                    decode_monitor_string(row.manufacturer_name),
                    decode_monitor_string(row.product_code_id),
                    decode_monitor_string(row.serial_number_id),
                    decode_monitor_string(row.user_friendly_name),
                ),
            );
        }
    }

    #[derive(Debug, Clone)]
    struct Candidate {
        width: Option<u32>,
        height: Option<u32>,
        metadata: PlatformMonitorMetadata,
    }

    let mut candidates = Vec::new();
    for row in desktop_rows {
        let normalized_pnp = row.pnp_device_id.as_deref().map(normalize_pnp_key);
        let identity = normalized_pnp
            .as_ref()
            .and_then(|key| ids_by_pnp.get(key))
            .cloned()
            .unwrap_or((None, None, None, None));

        let manufacturer = identity
            .0
            .clone()
            .or_else(|| row.monitor_manufacturer.clone())
            .filter(|value| !value.trim().is_empty());
        let friendly_name = identity
            .3
            .clone()
            .or_else(|| row.name.clone())
            .or_else(|| row.monitor_type.clone())
            .filter(|value| !value.trim().is_empty());
        let system_name = row.name.clone().filter(|value| !value.trim().is_empty());
        let stable_device_id = {
            let edid_like = PlatformMonitorMetadata {
                stable_device_id: None,
                system_name: row.name.clone().filter(|value| !value.trim().is_empty()),
                friendly_name: identity
                    .3
                    .clone()
                    .or_else(|| row.name.clone())
                    .or_else(|| row.monitor_type.clone())
                    .filter(|value| !value.trim().is_empty()),
                refresh_rate: None,
                manufacturer: identity
                    .0
                    .clone()
                    .or_else(|| row.monitor_manufacturer.clone())
                    .filter(|value| !value.trim().is_empty()),
                product_code: identity.1.clone(),
                serial_number: identity.2.clone(),
                edid: row.device_id.clone(),
            };

            build_edid_device_id(&edid_like).or_else(|| {
                normalized_pnp
                    .as_ref()
                    .map(|value| format!("windows:pnp:{}", value.to_ascii_lowercase()))
            })
        };

        candidates.push(Candidate {
            width: row.screen_width,
            height: row.screen_height,
            metadata: PlatformMonitorMetadata {
                stable_device_id,
                system_name,
                friendly_name,
                refresh_rate: None,
                manufacturer,
                product_code: identity.1,
                serial_number: identity.2,
                edid: row.device_id,
            },
        });
    }

    let mut assignments = vec![PlatformMonitorMetadata::default(); monitors.len()];
    let mut used_candidates = BTreeSet::new();

    for (index, monitor) in monitors.iter().enumerate() {
        let size = monitor.size();
        let matching_indices = candidates
            .iter()
            .enumerate()
            .filter(|(candidate_index, candidate)| {
                !used_candidates.contains(candidate_index)
                    && candidate.width == Some(size.width)
                    && candidate.height == Some(size.height)
            })
            .map(|(candidate_index, _)| candidate_index)
            .collect::<Vec<_>>();

        let selected_index = if monitors.len() == 1 && candidates.len() == 1 {
            Some(0)
        } else if matching_indices.len() == 1 {
            matching_indices.first().copied()
        } else {
            let monitor_name = monitor
                .name()
                .map(|value| value.to_ascii_lowercase())
                .unwrap_or_default();
            let named_indices = candidates
                .iter()
                .enumerate()
                .filter(|(candidate_index, candidate)| {
                    !used_candidates.contains(candidate_index)
                        && candidate
                            .metadata
                            .system_name
                            .as_ref()
                            .map(|value| {
                                let candidate_name = value.to_ascii_lowercase();
                                !monitor_name.is_empty()
                                    && (candidate_name.contains(&monitor_name)
                                        || monitor_name.contains(&candidate_name))
                            })
                            .unwrap_or(false)
                })
                .map(|(candidate_index, _)| candidate_index)
                .collect::<Vec<_>>();

            if named_indices.len() == 1 {
                named_indices.first().copied()
            } else {
                None
            }
        };

        if let Some(candidate_index) = selected_index {
            used_candidates.insert(candidate_index);
            assignments[index] = candidates[candidate_index].metadata.clone();
        }
    }

    fallback = assignments;
    fallback
}

#[tauri::command]
fn list_monitors(app: AppHandle) -> Result<Vec<MonitorRecord>, String> {
    list_monitor_records(&app)
}

#[tauri::command]
fn load_app_settings() -> Result<AppSettings, String> {
    let path = settings_file_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    read_json(&path)
}

#[tauri::command]
fn save_app_settings(settings: AppSettings) -> Result<(), String> {
    write_json(&settings_file_path()?, &settings)
}

#[tauri::command]
fn list_configurations() -> Result<Vec<ConfigurationRecord>, String> {
    let directory = configurations_dir()?;
    if !directory.exists() {
        return Ok(Vec::new());
    }

    let mut records = Vec::new();
    let entries = fs::read_dir(&directory).map_err(|error| error.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let record = read_json::<ConfigurationRecord>(&path).map_err(|error| {
            format!(
                "Failed to read configuration {}: {error}",
                normalize_path(&path)
            )
        })?;
        records.push(record);
    }

    records.sort_by(|left, right| left.name.cmp(&right.name).then(left.id.cmp(&right.id)));
    Ok(records)
}

#[tauri::command]
fn read_configuration(id: String) -> Result<ConfigurationRecord, String> {
    read_json(&configuration_file_path(&id)?)
}

#[tauri::command]
fn save_configuration(config: ConfigurationRecord) -> Result<(), String> {
    let path = configuration_file_path(&config.id)?;
    write_json(&path, &config)
}

#[tauri::command]
fn delete_configuration(id: String) -> Result<(), String> {
    let path = configuration_file_path(&id)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn choose_playlist_folder() -> Option<String> {
    FileDialog::new()
        .pick_folder()
        .map(|path| normalize_path(&path))
}

#[tauri::command]
fn read_playlist(source_folder: String) -> Result<Option<PlaylistRecord>, String> {
    let trimmed_source_folder = source_folder.trim();
    if trimmed_source_folder.is_empty() {
        return Ok(None);
    }

    let path = playlist_file_path(trimmed_source_folder);
    if !path.exists() {
        return Ok(None);
    }

    let mut playlist = read_json::<PlaylistRecord>(&path)?;
    playlist.source_folder = normalize_path(Path::new(trimmed_source_folder));
    playlist.playlist_file_path = normalize_path(&path);
    Ok(Some(playlist))
}

#[tauri::command]
fn save_playlist(playlist: PlaylistRecord) -> Result<(), String> {
    let trimmed_source_folder = playlist.source_folder.trim().to_string();
    if trimmed_source_folder.is_empty() {
        return Err("Playlist sourceFolder cannot be empty.".to_string());
    }

    let path = playlist_file_path(&trimmed_source_folder);
    let mut to_save = playlist;
    to_save.source_folder = normalize_path(Path::new(&trimmed_source_folder));
    to_save.playlist_file_path = normalize_path(&path);
    write_json(&path, &to_save)
}

#[tauri::command]
fn scan_playlist_folder(
    source_folder: String,
    short_names: Vec<String>,
    previous_entries: Vec<PlaylistEntry>,
) -> Result<Vec<PlaylistEntry>, String> {
    build_playlist_entries(
        &source_folder,
        &unique_short_names(short_names),
        &previous_entries,
    )
}

#[tauri::command]
fn start_presentation(
    app: AppHandle,
    state: State<'_, Mutex<PresentationState>>,
    payload: PresentationPayload,
) -> Result<(), String> {
    let mut payload = payload;
    payload.active = true;
    validate_presentation_payload(&app, &payload)?;

    {
        let mut presentation = state.lock().map_err(|error| error.to_string())?;
        presentation.start(payload.clone());
    }

    emit_presentation_state(&app, &payload)
}

#[tauri::command]
fn sync_presentation(
    app: AppHandle,
    state: State<'_, Mutex<PresentationState>>,
    payload: PresentationPayload,
) -> Result<(), String> {
    let mut payload = payload;
    payload.active = true;

    {
        let mut presentation = state.lock().map_err(|error| error.to_string())?;
        presentation.sync(payload.clone());
    }

    emit_presentation_state(&app, &payload)
}

#[tauri::command]
fn get_presentation_state(
    state: State<'_, Mutex<PresentationState>>,
) -> Result<Option<PresentationPayload>, String> {
    let presentation = state.lock().map_err(|error| error.to_string())?;
    Ok(presentation.snapshot())
}

#[tauri::command]
fn stop_presentation(
    app: AppHandle,
    state: State<'_, Mutex<PresentationState>>,
) -> Result<(), String> {
    let previous_payload = {
        let mut presentation = state.lock().map_err(|error| error.to_string())?;
        presentation.stop()
    };

    close_presentation_windows(&app, previous_payload.as_ref());
    let inactive_payload = inactive_presentation_payload(previous_payload);
    emit_presentation_state(&app, &inactive_payload)
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(PresentationState::default()))
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            load_app_settings,
            save_app_settings,
            list_configurations,
            read_configuration,
            save_configuration,
            delete_configuration,
            choose_playlist_folder,
            read_playlist,
            save_playlist,
            scan_playlist_folder,
            start_presentation,
            sync_presentation,
            get_presentation_state,
            stop_presentation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "parallaxer-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time should be after unix epoch")
                .as_nanos()
        ));

        fs::create_dir_all(&path).expect("temp dir should be created");
        path
    }

    fn sample_mapping() -> MonitorMapping {
        MonitorMapping {
            rotation: 0,
            mirror: "none".to_string(),
            scale: Some(1.0),
            offset_x: Some(0.0),
            offset_y: Some(0.0),
        }
    }

    fn sample_payload() -> PresentationPayload {
        PresentationPayload {
            active: true,
            playlist_id: "playlist-1".to_string(),
            configuration_id: "configuration-1".to_string(),
            index: 1,
            total: 3,
            file_name: "scene-02.jpg".to_string(),
            displays: vec![
                PresentationDisplayPayload {
                    short_name: "left".to_string(),
                    window_label: "presentation-left".to_string(),
                    device_id: "monitor-left".to_string(),
                    asset_path: "D:/Playlist/left/scene-02.jpg".to_string(),
                    relative_path: "left/scene-02.jpg".to_string(),
                    mapping: sample_mapping(),
                    selected: Some(true),
                },
                PresentationDisplayPayload {
                    short_name: "right".to_string(),
                    window_label: "presentation-right".to_string(),
                    device_id: "monitor-right".to_string(),
                    asset_path: "D:/Playlist/right/scene-02.jpg".to_string(),
                    relative_path: "right/scene-02.jpg".to_string(),
                    mapping: sample_mapping(),
                    selected: Some(false),
                },
            ],
        }
    }

    #[test]
    fn app_storage_paths_are_resolved_under_home() {
        let fake_home = PathBuf::from("C:/Users/example");
        let root = app_root_dir_from(&fake_home);

        assert_eq!(root, PathBuf::from("C:/Users/example/.parallaxer"));
        assert_eq!(
            root.join(".parallaxer.json"),
            PathBuf::from("C:/Users/example/.parallaxer/.parallaxer.json")
        );
        assert_eq!(
            root.join("configurations"),
            PathBuf::from("C:/Users/example/.parallaxer/configurations")
        );
    }

    #[test]
    fn edid_device_id_prefers_manufacturer_product_and_serial() {
        let metadata = PlatformMonitorMetadata {
            manufacturer: Some("DEL".to_string()),
            product_code: Some("A1B2".to_string()),
            serial_number: Some("SN123456".to_string()),
            ..Default::default()
        };

        assert_eq!(
            build_edid_device_id(&metadata).as_deref(),
            Some("edid:del:a1b2:sn123456")
        );
    }

    #[test]
    fn json_round_trip_uses_pretty_storage() {
        let temp_dir = unique_temp_dir("json-roundtrip");
        let path = temp_dir.join("settings.json");
        let settings = AppSettings {
            recent_playlist_folders: vec!["D:/Playlist".to_string()],
            ..Default::default()
        };

        write_json(&path, &settings).expect("settings should be saved");
        let restored = read_json::<AppSettings>(&path).expect("settings should be restored");

        assert_eq!(restored, settings);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn snapshot_returns_payload_only_when_active() {
        let mut state = PresentationState::default();
        let payload = sample_payload();

        state.start(payload.clone());
        assert_eq!(state.snapshot(), Some(payload.clone()));

        let inactive = state.stop();
        assert_eq!(inactive, Some(payload));
        assert_eq!(state.snapshot(), None);
    }

    #[test]
    fn scan_playlist_folder_merges_previous_visibility_and_statuses() {
        let temp_dir = unique_temp_dir("scan");
        fs::create_dir_all(temp_dir.join("left")).expect("left dir should exist");
        fs::create_dir_all(temp_dir.join("right")).expect("right dir should exist");
        fs::write(temp_dir.join("left").join("scene-01.jpg"), []).expect("scene should be created");
        fs::write(temp_dir.join("left").join("scene-02.jpg"), []).expect("scene should be created");
        fs::write(temp_dir.join("left").join("scene-03.jpg"), []).expect("scene should be created");
        fs::write(temp_dir.join("right").join("scene-01.jpg"), [])
            .expect("scene should be created");
        fs::write(temp_dir.join("right").join("scene-03.jpg"), [])
            .expect("scene should be created");

        let previous_entries = vec![PlaylistEntry {
            file_name: "scene-01.jpg".to_string(),
            visibility: false,
            status: PlaylistEntryStatus::Ready,
            message: "Ready".to_string(),
            per_monitor: BTreeMap::new(),
        }];

        let result = build_playlist_entries(
            &normalize_path(&temp_dir),
            &["left".to_string(), "right".to_string()],
            &previous_entries,
        )
        .expect("scan should succeed");

        assert_eq!(result.len(), 3);
        assert_eq!(result[0].file_name, "scene-01.jpg");
        assert!(!result[0].visibility);
        assert_eq!(result[0].status, PlaylistEntryStatus::Ready);
        assert_eq!(result[1].file_name, "scene-02.jpg");
        assert!(!result[1].visibility);
        assert_eq!(result[1].status, PlaylistEntryStatus::PartialMissing);
        assert_eq!(
            result[1]
                .per_monitor
                .get("right")
                .expect("right monitor entry should exist")
                .exists,
            false
        );
        assert_eq!(result[2].file_name, "scene-03.jpg");
        assert!(result[2].visibility);
        assert_eq!(result[2].status, PlaylistEntryStatus::Ready);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn playlist_path_is_always_folder_local() {
        let path = playlist_file_path("D:/Playlist");
        assert_eq!(path, PathBuf::from("D:/Playlist").join("playlist.json"));
    }
}
