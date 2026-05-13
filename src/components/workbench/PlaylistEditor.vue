<script setup lang="ts">
import type { ConfigurationRecord, MappingMode, PlaylistRecord } from '../../types';
import { formatPlaylistEntryMessage } from '../../lib/ui';

const props = defineProps<{
  playlist: PlaylistRecord | null;
  configurations: ConfigurationRecord[];
}>();

const emit = defineEmits<{
  'name-changed': [value: string];
  'source-folder-picked': [];
  'configuration-changed': [value: string];
  'mapping-mode-changed': [value: MappingMode];
  'visibility-changed': [fileName: string, value: boolean];
}>();
</script>

<template>
  <div v-if="props.playlist" class="detail-stack playlist-editor">
    <section class="detail-stack detail-section">
      <label class="detail-label">Playlist Name</label>
      <input
        class="detail-input"
        :value="props.playlist.name"
        placeholder="Playlist name"
        @input="emit('name-changed', ($event.target as HTMLInputElement).value)"
      />

      <label class="detail-label">Source Folder</label>
      <div class="inline-field">
        <input class="detail-input" :value="props.playlist.sourceFolder" readonly />
        <button class="chip-button" type="button" @click="emit('source-folder-picked')">Browse</button>
      </div>

      <label class="detail-label">Configuration</label>
      <select
        class="detail-select"
        :value="props.playlist.configurationId"
        @change="emit('configuration-changed', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">Select configuration</option>
        <option
          v-for="configuration in props.configurations"
          :key="configuration.id"
          :value="configuration.id"
        >
          {{ configuration.name || 'Untitled configuration' }}
        </option>
      </select>

      <label class="detail-label">Mapping Mode</label>
      <select
        class="detail-select"
        :value="props.playlist.mappingMode"
        @change="emit('mapping-mode-changed', ($event.target as HTMLSelectElement).value as MappingMode)"
      >
        <option value="same-name-separated-by-shortname">Same-name separated by shortName</option>
      </select>
    </section>

    <section class="detail-section">
      <table class="playlist-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Info</th>
            <th>Visible</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in props.playlist.entries" :key="entry.fileName">
            <td>{{ entry.fileName }}</td>
            <td>{{ formatPlaylistEntryMessage(entry) }}</td>
            <td>
              <input
                type="checkbox"
                :checked="entry.visibility"
                @change="emit('visibility-changed', entry.fileName, ($event.target as HTMLInputElement).checked)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
  <div v-else class="empty-state">Select or create a playlist.</div>
</template>

<style scoped>
.playlist-editor {
  gap: 14px;
}

.detail-section {
  display: grid;
  gap: 10px;
}

.detail-label {
  font-size: 11px;
  letter-spacing: 0.03em;
}

.detail-input,
.detail-select,
.playlist-table {
  font-size: 13px;
}

.playlist-table th,
.playlist-table td {
  padding-top: 8px;
  padding-bottom: 8px;
}
</style>
