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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct AppSettings {
    monitor_overrides: BTreeMap<String, MonitorOverride>,
    monitor_history: Vec<MonitorRecord>,
    recent_playlist_folders: Vec<String>,
    cache: BTreeMap<String, Value>,
    #[serde(default = "default_monitor_strip_height_gamma")]
    monitor_strip_height_gamma: f64,
    last_selected_page: Option<String>,
    last_selected_entity_id: Option<String>,
}

fn default_monitor_strip_height_gamma() -> f64 {
    2.6
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            monitor_overrides: BTreeMap::new(),
            monitor_history: Vec::new(),
            recent_playlist_folders: Vec::new(),
            cache: BTreeMap::new(),
            monitor_strip_height_gamma: default_monitor_strip_height_gamma(),
            last_selected_page: None,
            last_selected_entity_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct MonitorMapping {
    rotation: u16,
    mirror: String,
    fit: Option<String>,
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
    favorite: Option<bool>,
    monitors: Vec<ConfigurationMonitor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PlaylistMonitorEntry {
    exists: bool,
    relative_path: String,
    info: Option<String>,
    shared_slice: Option<bool>,
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
    slice: Option<PresentationSlice>,
    frame: Option<Size>,
    mapping: MonitorMapping,
    selected: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PresentationSlice {
    axis: String,
    index: usize,
    total: usize,
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
    instance_key: Option<String>,
    system_name: Option<String>,
    friendly_name: Option<String>,
    refresh_rate: Option<u32>,
    manufacturer: Option<String>,
    product_code: Option<String>,
    serial_number: Option<String>,
    edid: Option<String>,
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

fn normalize_monitor_instance_key(value: &str) -> String {
    let value = value.trim().replace('/', "\\").to_ascii_uppercase();
    let value = value
        .trim_start_matches("\\\\?\\")
        .replace('#', "\\")
        .replace("{", "\\{");
    let value = value
        .split("\\{")
        .next()
        .unwrap_or(&value)
        .trim_end_matches('\\')
        .to_string();

    if let Some((prefix, suffix)) = value.rsplit_once('_') {
        if suffix.chars().all(|character| character.is_ascii_digit()) {
            return prefix.to_string();
        }
    }

    value
}

fn normalize_display_name_key(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("\\\\.\\")
        .to_ascii_uppercase()
}

fn build_monitor_geometry_lookup_key(
    position_x: i32,
    position_y: i32,
    width: u32,
    height: u32,
) -> String {
    format!("{position_x}:{position_y}:{width}:{height}")
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

fn build_device_instance_suffix(instance_key: &str) -> Option<String> {
    let normalized = normalize_monitor_instance_key(instance_key);
    let suffix = normalized
        .rsplit('\\')
        .next()
        .filter(|value| !value.trim().is_empty())?;
    Some(normalize_identity_segment(suffix))
}

fn disambiguate_device_id(
    base_device_id: &str,
    metadata: &PlatformMonitorMetadata,
    position: &Position,
    size: &Size,
) -> String {
    if let Some(instance_key) = metadata.instance_key.as_deref() {
        if let Some(instance_suffix) = build_device_instance_suffix(instance_key) {
            return format!("{base_device_id}@{instance_suffix}");
        }
    }

    format!(
        "{base_device_id}@{}",
        normalize_identity_segment(&format!(
            "{}-{}-{}-{}",
            position.x, position.y, size.width, size.height
        ))
    )
}

fn parse_edid_manufacturer_id(raw: u16) -> Option<String> {
    let first = ((raw >> 10) & 0x1f) as u8;
    let second = ((raw >> 5) & 0x1f) as u8;
    let third = (raw & 0x1f) as u8;
    let letters = [first, second, third]
        .into_iter()
        .map(|value| {
            if (1..=26).contains(&value) {
                Some((b'A' + value - 1) as char)
            } else {
                None
            }
        })
        .collect::<Option<Vec<_>>>()?;

    Some(letters.into_iter().collect())
}

fn encode_edid_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

fn parse_edid_identity(bytes: &[u8]) -> Option<(String, String, String)> {
    if bytes.len() < 128 {
        return None;
    }

    let header = [0x00_u8, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00];
    if bytes[..8] != header {
        return None;
    }

    let manufacturer_raw = u16::from_be_bytes([bytes[8], bytes[9]]);
    let manufacturer = parse_edid_manufacturer_id(manufacturer_raw)?;
    let product_code = format!("{:04x}", u16::from_le_bytes([bytes[10], bytes[11]]));
    let serial = u32::from_le_bytes([bytes[12], bytes[13], bytes[14], bytes[15]]);
    let serial_number = if serial == 0 {
        encode_edid_hex(&bytes[12..16])
    } else {
        serial.to_string()
    };

    Some((manufacturer, product_code, serial_number))
}

fn build_edid_device_id_from_bytes(bytes: &[u8]) -> Option<String> {
    let (manufacturer, product_code, serial_number) = parse_edid_identity(bytes)?;

    Some(format!(
        "edid:{}:{}:{}",
        normalize_identity_segment(&manufacturer),
        normalize_identity_segment(&product_code),
        normalize_identity_segment(&serial_number)
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

fn collect_media_files(base: &Path) -> Result<BTreeMap<String, String>, String> {
    let mut files = BTreeMap::new();
    let entries = fs::read_dir(base).map_err(|error| error.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() || !is_supported_media_file(&path) {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        files.insert(file_name.to_string(), file_name.to_string());
    }

    Ok(files)
}

fn collect_media_files_for_short_name(
    base: &Path,
    short_name: &str,
) -> Result<BTreeMap<String, String>, String> {
    let target = base.join(short_name);
    if !target.exists() {
        return Ok(BTreeMap::new());
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

    Ok(files)
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
                "No monitors configured".to_string()
            } else {
                format!("Missing on all monitors: {}", missing.join(", "))
            }
        }
    }
}

fn build_playlist_entries(
    source_folder: &str,
    mapping_mode: &str,
    monitors: &[ConfigurationMonitor],
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

    let (discovered_names, per_monitor_files, shared_root_files) = if mapping_mode
        == "same-folder-shared-files"
    {
        let scanned_files = collect_media_files(&base)?;
        let discovered_names = scanned_files.keys().cloned().collect::<Vec<_>>();
        let per_monitor_files = monitors
            .iter()
            .map(|monitor| (monitor.device_id.clone(), scanned_files.clone()))
            .collect::<BTreeMap<_, _>>();
        (
            discovered_names,
            per_monitor_files,
            scanned_files
                .iter()
                .map(|(file_name, relative_path)| (file_name.clone(), relative_path.clone()))
                .collect::<BTreeMap<_, _>>(),
        )
    } else {
        let mut discovered_names = BTreeSet::new();
        let mut per_monitor_files = BTreeMap::new();
        let shared_root_files = collect_media_files(&base)?;

        for monitor in monitors {
            let scanned_files = collect_media_files_for_short_name(&base, &monitor.short_name)?;
            for file_name in scanned_files.keys() {
                discovered_names.insert(file_name.clone());
            }
            per_monitor_files.insert(monitor.device_id.clone(), scanned_files);
        }

        for file_name in shared_root_files.keys() {
            discovered_names.insert(file_name.clone());
        }

        (
            discovered_names.into_iter().collect::<Vec<_>>(),
            per_monitor_files,
            shared_root_files,
        )
    };

    let previous_visibility = previous_entries
        .iter()
        .map(|entry| (entry.file_name.clone(), entry.visibility))
        .collect::<BTreeMap<_, _>>();

    let mut entries = Vec::with_capacity(discovered_names.len());

    for file_name in discovered_names {
        let mut per_monitor = BTreeMap::new();
        let mut missing_monitors = Vec::new();
        for monitor in monitors {
            let dedicated_relative_path = per_monitor_files
                .get(&monitor.device_id)
                .and_then(|files| files.get(&file_name))
                .cloned()
                .unwrap_or_default();
            let shared_relative_path = shared_root_files.get(&file_name).cloned().unwrap_or_default();
            let (relative_path, shared_slice) = if !dedicated_relative_path.is_empty() {
                (dedicated_relative_path, false)
            } else if !shared_relative_path.is_empty() {
                (shared_relative_path, true)
            } else {
                (String::new(), false)
            };
            let exists = !relative_path.is_empty();
            if exists {
                per_monitor.insert(
                    monitor.device_id.clone(),
                    PlaylistMonitorEntry {
                        exists: true,
                        relative_path: relative_path.clone(),
                        info: if shared_slice {
                            Some("shared-horizontal-slice".to_string())
                        } else {
                            None
                        },
                        shared_slice: if shared_slice { Some(true) } else { None },
                    },
                );
                continue;
            }

            missing_monitors.push(monitor.short_name.clone());
            per_monitor.insert(
                monitor.device_id.clone(),
                PlaylistMonitorEntry {
                    exists: false,
                    relative_path: String::new(),
                    info: Some(format!("File not found: {file_name}")),
                    shared_slice: None,
                },
            );
        }

        let ready_count = per_monitor.values().filter(|entry| entry.exists).count();
        let status = if monitors.is_empty() || ready_count == 0 {
            PlaylistEntryStatus::MissingAll
        } else if ready_count == monitors.len() {
            PlaylistEntryStatus::Ready
        } else {
            PlaylistEntryStatus::PartialMissing
        };

        let message = build_playlist_message(&status, &missing_monitors, monitors.len());
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
    let mut base_device_ids = Vec::with_capacity(monitors.len());
    let mut duplicate_counts = BTreeMap::<String, usize>::new();

    for (index, monitor) in monitors.iter().enumerate() {
        let position = *monitor.position();
        let size = *monitor.size();
        let metadata = metadata.get(index).cloned().unwrap_or_default();
        let base_device_id = metadata
            .stable_device_id
            .clone()
            .or_else(|| build_edid_device_id(&metadata))
            .or_else(|| build_serial_product_device_id(&metadata))
            .unwrap_or_else(|| build_geometry_device_id(&position, &size));
        *duplicate_counts.entry(base_device_id.clone()).or_default() += 1;
        base_device_ids.push(base_device_id);
    }

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
        let base_device_id = base_device_ids
            .get(index)
            .cloned()
            .unwrap_or_else(|| build_geometry_device_id(&position, &size));
        let device_id = if duplicate_counts.get(&base_device_id).copied().unwrap_or(0) > 1 {
            disambiguate_device_id(
                &base_device_id,
                &metadata,
                &Position {
                    x: position.x,
                    y: position.y,
                },
                &Size {
                    width: size.width,
                    height: size.height,
                },
            )
        } else {
            base_device_id
        };

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
    use std::collections::HashMap;
    use std::mem;

    use windows::Win32::Devices::Display::{
        DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME, DISPLAYCONFIG_DEVICE_INFO_HEADER,
        DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_MODE_INFO,
        DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE, DISPLAYCONFIG_PATH_INFO,
        DISPLAYCONFIG_SOURCE_DEVICE_NAME, DISPLAYCONFIG_TARGET_DEVICE_NAME,
        DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes, QDC_ONLY_ACTIVE_PATHS,
        QDC_VIRTUAL_MODE_AWARE, QueryDisplayConfig,
    };
    use windows::Win32::Foundation::{RPC_E_CHANGED_MODE, WIN32_ERROR};
    use windows::Win32::Graphics::Gdi::{DISPLAY_DEVICEW, EnumDisplayDevicesW};
    use windows::Win32::UI::WindowsAndMessaging::EDD_GET_DEVICE_INTERFACE_NAME;
    use windows::core::PCWSTR;
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

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct WmiDescriptorMethodRow {
        __path: String,
        instance_name: Option<String>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct WmiGetMonitorRawEEdidV1BlockOutput {
        block_content: Option<Vec<u8>>,
        return_value: u32,
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

    fn decode_utf16_null_terminated(values: &[u16]) -> Option<String> {
        let end = values.iter().position(|value| *value == 0).unwrap_or(values.len());
        let decoded = String::from_utf16_lossy(&values[..end]).trim().to_string();
        if decoded.is_empty() {
            None
        } else {
            Some(decoded)
        }
    }

    fn build_active_path_geometry_pnp_maps(
    ) -> (
        BTreeMap<String, String>,
        BTreeMap<String, String>,
    ) {
        let mut by_display_name = read_active_pnp_keys_by_enum_display_devices();
        let mut by_geometry = BTreeMap::new();
        let mut path_count = 0_u32;
        let mut mode_count = 0_u32;
        let flags = QDC_ONLY_ACTIVE_PATHS | QDC_VIRTUAL_MODE_AWARE;
        if unsafe { GetDisplayConfigBufferSizes(flags, &mut path_count, &mut mode_count) }
            != WIN32_ERROR(0)
        {
            return (by_display_name, by_geometry);
        }

        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); path_count as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); mode_count as usize];
        if unsafe {
            QueryDisplayConfig(
                flags,
                &mut path_count,
                paths.as_mut_ptr(),
                &mut mode_count,
                modes.as_mut_ptr(),
                None,
            )
        } != WIN32_ERROR(0)
        {
            return (by_display_name, by_geometry);
        }

        paths.truncate(path_count as usize);
        modes.truncate(mode_count as usize);

        let source_modes = modes
            .iter()
            .filter(|mode| mode.infoType == DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE)
            .map(|mode| {
                (
                    (mode.adapterId.LowPart, mode.adapterId.HighPart, mode.id),
                    unsafe { mode.Anonymous.sourceMode },
                )
            })
            .collect::<BTreeMap<_, _>>();

        for path in paths {
            let source_key = (
                path.sourceInfo.adapterId.LowPart,
                path.sourceInfo.adapterId.HighPart,
                path.sourceInfo.id,
            );
            let Some(source_mode) = source_modes.get(&source_key) else {
                continue;
            };

            let mut source_name = DISPLAYCONFIG_SOURCE_DEVICE_NAME {
                header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
                    r#type: DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
                    size: std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32,
                    adapterId: path.sourceInfo.adapterId,
                    id: path.sourceInfo.id,
                },
                ..Default::default()
            };

            if unsafe { DisplayConfigGetDeviceInfo(&mut source_name.header) } != 0 {
                continue;
            }

            let Some(view_gdi_device_name) =
                decode_utf16_null_terminated(&source_name.viewGdiDeviceName)
            else {
                continue;
            };

            let mut target_name = DISPLAYCONFIG_TARGET_DEVICE_NAME {
                header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
                    r#type: DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
                    size: std::mem::size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32,
                    adapterId: path.targetInfo.adapterId,
                    id: path.targetInfo.id,
                },
                ..Default::default()
            };

            if unsafe { DisplayConfigGetDeviceInfo(&mut target_name.header) } != 0 {
                continue;
            }

            let Some(monitor_device_path) =
                decode_utf16_null_terminated(&target_name.monitorDevicePath)
            else {
                continue;
            };

            let normalized = normalize_monitor_instance_key(&monitor_device_path);
            let normalized_display_name = normalize_display_name_key(&view_gdi_device_name);
            by_display_name.insert(normalized_display_name, normalized.clone());

            let geometry_key = build_monitor_geometry_lookup_key(
                source_mode.position.x,
                source_mode.position.y,
                source_mode.width,
                source_mode.height,
            );
            by_geometry.insert(geometry_key, normalized);
        }

        (by_display_name, by_geometry)
    }

    fn read_active_pnp_keys_by_enum_display_devices() -> BTreeMap<String, String> {
        let mut result = BTreeMap::new();
        let mut adapter_index = 0_u32;

        loop {
            let mut adapter = DISPLAY_DEVICEW {
                cb: mem::size_of::<DISPLAY_DEVICEW>() as u32,
                ..Default::default()
            };

            if !unsafe { EnumDisplayDevicesW(PCWSTR::null(), adapter_index, &mut adapter, 0) }
                .as_bool()
            {
                break;
            }

            let Some(adapter_name) = decode_utf16_null_terminated(&adapter.DeviceName) else {
                adapter_index += 1;
                continue;
            };

            let mut monitor_index = 0_u32;
            loop {
                let mut monitor = DISPLAY_DEVICEW {
                    cb: mem::size_of::<DISPLAY_DEVICEW>() as u32,
                    ..Default::default()
                };

                if !unsafe {
                    EnumDisplayDevicesW(
                        PCWSTR(adapter.DeviceName.as_ptr()),
                        monitor_index,
                        &mut monitor,
                        EDD_GET_DEVICE_INTERFACE_NAME,
                    )
                }
                .as_bool()
                {
                    break;
                }

                let monitor_key = decode_utf16_null_terminated(&monitor.DeviceID)
                    .or_else(|| decode_utf16_null_terminated(&monitor.DeviceKey))
                    .map(|value| normalize_monitor_instance_key(&value));

                if let Some(monitor_key) = monitor_key {
                    result.insert(normalize_display_name_key(&adapter_name), monitor_key);
                }

                monitor_index += 1;
            }

            adapter_index += 1;
        }

        result
    }

    fn read_edid_bytes_by_instance(root_wmi: &WMIConnection) -> BTreeMap<String, Vec<u8>> {
        let descriptor_rows = root_wmi
            .raw_query::<WmiDescriptorMethodRow>(
                "SELECT __PATH, InstanceName FROM WmiMonitorDescriptorMethods",
            )
            .unwrap_or_default();

        let mut edid_by_instance = BTreeMap::new();

        for row in descriptor_rows {
            let Some(instance_name) = row.instance_name.as_deref() else {
                continue;
            };

            let normalized_instance = normalize_monitor_instance_key(instance_name);
            let mut edid = Vec::new();

            for block_id in 0_u8..=3 {
                let Ok(output) = root_wmi.exec_method_native_wrapper(
                    "WmiMonitorDescriptorMethods",
                    &row.__path,
                    "WmiGetMonitorRawEEdidV1Block",
                    HashMap::from([(
                        "BlockId".to_string(),
                        wmi::Variant::UI1(block_id),
                    )]),
                ) else {
                    break;
                };

                let Some(output) = output else {
                    break;
                };

                let Ok(output) = output.into_desr::<WmiGetMonitorRawEEdidV1BlockOutput>() else {
                    break;
                };

                if output.return_value != 0 {
                    break;
                }

                let Some(block_content) = output.block_content else {
                    break;
                };

                if block_content.len() != 128 {
                    break;
                }

                edid.extend(block_content);
            }

            if !edid.is_empty() {
                edid_by_instance.insert(normalized_instance, edid);
            }
        }

        edid_by_instance
    }

    let mut fallback = vec![PlatformMonitorMetadata::default(); monitors.len()];
    let com_library = match COMLibrary::new() {
        Ok(com_library) => com_library,
        Err(wmi::WMIError::HResultError { hres }) if hres == RPC_E_CHANGED_MODE.0 => unsafe {
            COMLibrary::assume_initialized()
        },
        Err(_) => return fallback,
    };
    let Ok(cimv2) = WMIConnection::new(com_library) else {
        return fallback;
    };
    let Ok(root_wmi) = WMIConnection::with_namespace_path("ROOT\\WMI", com_library) else {
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
    let edid_by_instance = read_edid_bytes_by_instance(&root_wmi);
    let (active_pnp_by_display_name, active_pnp_by_geometry) =
        build_active_path_geometry_pnp_maps();

    let mut ids_by_pnp = BTreeMap::new();
    for row in wmi_rows {
        if let Some(instance_name) = row.instance_name.as_deref() {
            ids_by_pnp.insert(
                normalize_monitor_instance_key(instance_name),
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
        let normalized_pnp = row
            .pnp_device_id
            .as_deref()
            .map(normalize_monitor_instance_key);
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
        let edid_bytes = normalized_pnp
            .as_ref()
            .and_then(|key| edid_by_instance.get(key))
            .cloned();
        let stable_device_id = {
            let edid_device_id = edid_bytes
                .as_deref()
                .and_then(build_edid_device_id_from_bytes);
            let edid_like = PlatformMonitorMetadata {
                stable_device_id: None,
                instance_key: normalized_pnp.clone(),
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
                edid: edid_bytes.as_deref().map(encode_edid_hex).or_else(|| row.device_id.clone()),
            };

            edid_device_id.or_else(|| build_edid_device_id(&edid_like)).or_else(|| {
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
                instance_key: normalized_pnp,
                system_name,
                friendly_name,
                refresh_rate: None,
                manufacturer,
                product_code: identity.1,
                serial_number: identity.2,
                edid: edid_bytes.as_deref().map(encode_edid_hex).or(row.device_id),
            },
        });
    }

    let mut assignments = vec![PlatformMonitorMetadata::default(); monitors.len()];
    let mut used_candidates = BTreeSet::new();

    for (index, monitor) in monitors.iter().enumerate() {
        let position = monitor.position();
        let size = monitor.size();
        let monitor_display_name = monitor
            .name()
            .map(|value| normalize_display_name_key(value))
            .unwrap_or_default();
        let geometry_key =
            build_monitor_geometry_lookup_key(position.x, position.y, size.width, size.height);
        let matched_display_name_pnp =
            active_pnp_by_display_name.get(&monitor_display_name).cloned();
        let matched_geometry_pnp = active_pnp_by_geometry.get(&geometry_key).cloned();
        let matched_pnp_key = matched_display_name_pnp
            .as_ref()
            .or(matched_geometry_pnp.as_ref())
            .cloned();
        if let Some(pnp_key) = matched_pnp_key.as_ref() {
            if let Some(identity) = ids_by_pnp.get(pnp_key) {
                let edid_bytes = edid_by_instance.get(pnp_key).cloned();
                let manufacturer = identity.0.clone().filter(|value| !value.trim().is_empty());
                let product_code = identity.1.clone().filter(|value| !value.trim().is_empty());
                let serial_number = identity.2.clone().filter(|value| !value.trim().is_empty());
                let stable_device_id = edid_bytes
                    .as_deref()
                    .and_then(build_edid_device_id_from_bytes)
                    .or_else(|| {
                        build_edid_device_id(&PlatformMonitorMetadata {
                            manufacturer: manufacturer.clone(),
                            product_code: product_code.clone(),
                            serial_number: serial_number.clone(),
                            ..Default::default()
                        })
                    })
                    .or_else(|| Some(format!("windows:pnp:{}", pnp_key.to_ascii_lowercase())));

                assignments[index] = PlatformMonitorMetadata {
                    stable_device_id,
                    instance_key: Some(pnp_key.clone()),
                    system_name: monitor.name().cloned(),
                    friendly_name: identity.3.clone().filter(|value| !value.trim().is_empty()),
                    refresh_rate: None,
                    manufacturer,
                    product_code,
                    serial_number,
                    edid: edid_bytes.as_deref().map(encode_edid_hex),
                };
                continue;
            }
        }

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

        let mut record = read_json::<ConfigurationRecord>(&path).map_err(|error| {
            format!(
                "Failed to read configuration {}: {error}",
                normalize_path(&path)
            )
        })?;
        if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
            record.id = stem.to_string();
        }
        records.push(record);
    }

    records.sort_by(|left, right| left.name.cmp(&right.name).then(left.id.cmp(&right.id)));
    Ok(records)
}

#[tauri::command]
fn read_configuration(id: String) -> Result<ConfigurationRecord, String> {
    let path = configuration_file_path(&id)?;
    let mut record = read_json::<ConfigurationRecord>(&path)?;
    record.id = validate_identifier(&id)?;
    Ok(record)
}

#[tauri::command]
fn save_configuration(config: ConfigurationRecord) -> Result<ConfigurationRecord, String> {
    let storage_id = validate_identifier(&config.id)?;
    let path = configuration_file_path(&storage_id)?;
    let mut to_save = config;
    to_save.id = storage_id.clone();
    write_json(&path, &to_save)?;

    Ok(to_save)
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
    monitors: Vec<ConfigurationMonitor>,
    previous_entries: Vec<PlaylistEntry>,
) -> Result<Vec<PlaylistEntry>, String> {
    build_playlist_entries(
        &source_folder,
        "same-name-separated-by-shortname",
        &monitors,
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
            fit: Some("contain".to_string()),
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
                    slice: None,
                    frame: Some(Size {
                        width: 1920,
                        height: 1080,
                    }),
                    mapping: sample_mapping(),
                    selected: Some(true),
                },
                PresentationDisplayPayload {
                    short_name: "right".to_string(),
                    window_label: "presentation-right".to_string(),
                    device_id: "monitor-right".to_string(),
                    asset_path: "D:/Playlist/right/scene-02.jpg".to_string(),
                    relative_path: "right/scene-02.jpg".to_string(),
                    slice: None,
                    frame: Some(Size {
                        width: 1920,
                        height: 1080,
                    }),
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
    fn raw_edid_identity_is_parsed_into_device_id() {
        let mut edid = vec![0_u8; 128];
        edid[..8].copy_from_slice(&[0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00]);
        edid[8] = 0x10;
        edid[9] = 0xac;
        edid[10] = 0xb2;
        edid[11] = 0xa1;
        edid[12] = 0x78;
        edid[13] = 0x56;
        edid[14] = 0x34;
        edid[15] = 0x12;

        assert_eq!(
            build_edid_device_id_from_bytes(&edid).as_deref(),
            Some("edid:del:a1b2:305419896")
        );
    }

    #[test]
    fn raw_edid_zero_serial_falls_back_to_hex() {
        let mut edid = vec![0_u8; 128];
        edid[..8].copy_from_slice(&[0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00]);
        edid[8] = 0x10;
        edid[9] = 0xac;
        edid[10] = 0xb2;
        edid[11] = 0xa1;

        assert_eq!(
            build_edid_device_id_from_bytes(&edid).as_deref(),
            Some("edid:del:a1b2:00000000")
        );
    }

    #[test]
    fn normalize_pnp_key_accepts_displayconfig_monitor_device_path() {
        assert_eq!(
            normalize_monitor_instance_key(r"\\?\DISPLAY#AUOD2A2#5&1a15d4d8&3&UID256#{E6F07B5F-EE97-4A90-B076-33F57BF4EAA7}"),
            r"DISPLAY\AUOD2A2\5&1A15D4D8&3&UID256"
        );
    }

    #[test]
    fn normalize_pnp_key_accepts_display_interface_device_id() {
        assert_eq!(
            normalize_monitor_instance_key(
                r"MONITOR\AUOD2A2\{4d36e96e-e325-11ce-bfc1-08002be10318}\0001"
            ),
            r"MONITOR\AUOD2A2"
        );
    }

    #[test]
    fn normalize_display_name_key_strips_windows_prefix() {
        assert_eq!(normalize_display_name_key(r"\\.\DISPLAY66"), "DISPLAY66");
        assert_eq!(normalize_display_name_key("DISPLAY66"), "DISPLAY66");
    }

    #[test]
    fn duplicate_edid_device_ids_are_disambiguated_by_instance_key() {
        let metadata = PlatformMonitorMetadata {
            instance_key: Some(r"DISPLAY\TDO5448\9&252835&0&UID257".to_string()),
            ..Default::default()
        };
        let position = Position { x: 3440, y: 0 };
        let size = Size {
            width: 720,
            height: 720,
        };

        assert_eq!(
            disambiguate_device_id("edid:tdo:5448:54", &metadata, &position, &size),
            "edid:tdo:5448:54@9-252835-0-uid257"
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
    fn scan_playlist_folder_merges_previous_visibility_and_shared_file_entries() {
        let temp_dir = unique_temp_dir("scan");
        fs::create_dir_all(&temp_dir).expect("temp dir should exist");
        fs::write(temp_dir.join("scene-01.jpg"), []).expect("scene should be created");
        fs::write(temp_dir.join("scene-02.jpg"), []).expect("scene should be created");
        fs::write(temp_dir.join("scene-03.jpg"), []).expect("scene should be created");

        let previous_entries = vec![PlaylistEntry {
            file_name: "scene-01.jpg".to_string(),
            visibility: false,
            status: PlaylistEntryStatus::Ready,
            message: "Ready".to_string(),
            per_monitor: BTreeMap::new(),
        }];

        let result = build_playlist_entries(
            &normalize_path(&temp_dir),
            "same-folder-shared-files",
            &[
                ConfigurationMonitor {
                    device_id: "monitor-left".to_string(),
                    short_name: "dup".to_string(),
                    order: 0,
                    mapping: MonitorMapping {
                        rotation: 0,
                        mirror: "none".to_string(),
                        fit: Some("contain".to_string()),
                        scale: Some(1.0),
                        offset_x: Some(0.0),
                        offset_y: Some(0.0),
                    },
                },
                ConfigurationMonitor {
                    device_id: "monitor-right".to_string(),
                    short_name: "dup".to_string(),
                    order: 1,
                    mapping: MonitorMapping {
                        rotation: 0,
                        mirror: "none".to_string(),
                        fit: Some("contain".to_string()),
                        scale: Some(1.0),
                        offset_x: Some(0.0),
                        offset_y: Some(0.0),
                    },
                },
            ],
            &previous_entries,
        )
        .expect("scan should succeed");

        assert_eq!(result.len(), 3);
        assert_eq!(result[0].file_name, "scene-01.jpg");
        assert!(!result[0].visibility);
        assert_eq!(result[0].status, PlaylistEntryStatus::Ready);
        assert_eq!(result[1].file_name, "scene-02.jpg");
        assert!(result[1].visibility);
        assert_eq!(result[1].status, PlaylistEntryStatus::Ready);
        assert_eq!(
            result[1]
                .per_monitor
                .get("monitor-right")
                .expect("right monitor entry should exist")
                .exists,
            true
        );
        assert_eq!(result[2].file_name, "scene-03.jpg");
        assert!(result[2].visibility);
        assert_eq!(result[2].status, PlaylistEntryStatus::Ready);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn scan_playlist_folder_supports_short_name_subfolders_and_missing_detection() {
        let temp_dir = unique_temp_dir("scan-shortname");
        fs::create_dir_all(temp_dir.join("left")).expect("left dir should exist");
        fs::create_dir_all(temp_dir.join("right")).expect("right dir should exist");
        fs::write(temp_dir.join("left").join("scene-01.jpg"), []).expect("scene should be created");
        fs::write(temp_dir.join("right").join("scene-01.jpg"), []).expect("scene should be created");
        fs::write(temp_dir.join("left").join("scene-02.jpg"), []).expect("scene should be created");

        let result = build_playlist_entries(
            &normalize_path(&temp_dir),
            "same-name-separated-by-shortname",
            &[
                ConfigurationMonitor {
                    device_id: "monitor-left".to_string(),
                    short_name: "left".to_string(),
                    order: 0,
                    mapping: MonitorMapping {
                        rotation: 0,
                        mirror: "none".to_string(),
                        fit: Some("contain".to_string()),
                        scale: Some(1.0),
                        offset_x: Some(0.0),
                        offset_y: Some(0.0),
                    },
                },
                ConfigurationMonitor {
                    device_id: "monitor-right".to_string(),
                    short_name: "right".to_string(),
                    order: 1,
                    mapping: MonitorMapping {
                        rotation: 0,
                        mirror: "none".to_string(),
                        fit: Some("contain".to_string()),
                        scale: Some(1.0),
                        offset_x: Some(0.0),
                        offset_y: Some(0.0),
                    },
                },
            ],
            &[],
        )
        .expect("scan should succeed");

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].file_name, "scene-01.jpg");
        assert_eq!(result[0].status, PlaylistEntryStatus::Ready);
        assert_eq!(result[1].file_name, "scene-02.jpg");
        assert_eq!(result[1].status, PlaylistEntryStatus::PartialMissing);
        assert_eq!(
            result[1]
                .per_monitor
                .get("monitor-right")
                .expect("right monitor entry should exist")
                .exists,
            false
        );
        assert!(
            result[1]
                .message
                .contains("right"),
            "missing message should mention the shortName"
        );

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn scan_playlist_folder_preserves_existing_visibility_in_short_name_mode() {
        let temp_dir = unique_temp_dir("scan-shortname-visibility");
        fs::create_dir_all(temp_dir.join("left")).expect("left dir should exist");
        fs::create_dir_all(temp_dir.join("right")).expect("right dir should exist");
        fs::write(temp_dir.join("left").join("scene-01.jpg"), []).expect("scene should be created");
        fs::write(temp_dir.join("right").join("scene-01.jpg"), []).expect("scene should be created");

        let previous_entries = vec![PlaylistEntry {
            file_name: "scene-01.jpg".to_string(),
            visibility: false,
            status: PlaylistEntryStatus::Ready,
            message: "Ready".to_string(),
            per_monitor: BTreeMap::new(),
        }];

        let result = build_playlist_entries(
            &normalize_path(&temp_dir),
            "same-name-separated-by-shortname",
            &[
                ConfigurationMonitor {
                    device_id: "monitor-left".to_string(),
                    short_name: "left".to_string(),
                    order: 0,
                    mapping: sample_mapping(),
                },
                ConfigurationMonitor {
                    device_id: "monitor-right".to_string(),
                    short_name: "right".to_string(),
                    order: 1,
                    mapping: sample_mapping(),
                },
            ],
            &previous_entries,
        )
        .expect("scan should succeed");

        assert_eq!(result.len(), 1);
        assert!(!result[0].visibility);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn scan_playlist_folder_includes_root_media_as_shared_slices() {
        let temp_dir = unique_temp_dir("scan-shared-root");
        fs::create_dir_all(temp_dir.join("left")).expect("left dir should exist");
        fs::create_dir_all(temp_dir.join("right")).expect("right dir should exist");
        fs::write(temp_dir.join("left").join("scene-01.jpg"), []).expect("scene should be created");
        fs::write(temp_dir.join("right").join("scene-01.jpg"), []).expect("scene should be created");
        fs::write(temp_dir.join("trailer.mp4"), []).expect("shared video should be created");

        let result = build_playlist_entries(
            &normalize_path(&temp_dir),
            "same-name-separated-by-shortname",
            &[
                ConfigurationMonitor {
                    device_id: "monitor-left".to_string(),
                    short_name: "left".to_string(),
                    order: 0,
                    mapping: sample_mapping(),
                },
                ConfigurationMonitor {
                    device_id: "monitor-right".to_string(),
                    short_name: "right".to_string(),
                    order: 1,
                    mapping: sample_mapping(),
                },
            ],
            &[],
        )
        .expect("scan should succeed");

        assert_eq!(result.len(), 2);
        let shared_entry = result
            .iter()
            .find(|entry| entry.file_name == "trailer.mp4")
            .expect("shared root media should be included");
        assert_eq!(shared_entry.status, PlaylistEntryStatus::Ready);
        assert_eq!(
            shared_entry
                .per_monitor
                .get("monitor-left")
                .expect("left shared entry should exist")
                .relative_path,
            "trailer.mp4"
        );
        assert_eq!(
            shared_entry
                .per_monitor
                .get("monitor-right")
                .expect("right shared entry should exist")
                .relative_path,
            "trailer.mp4"
        );
        assert_eq!(
            shared_entry
                .per_monitor
                .get("monitor-left")
                .and_then(|entry| entry.info.as_deref()),
            Some("shared-horizontal-slice")
        );

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn playlist_path_is_always_folder_local() {
        let path = playlist_file_path("D:/Playlist");
        assert_eq!(path, PathBuf::from("D:/Playlist").join("playlist.json"));
    }

}
