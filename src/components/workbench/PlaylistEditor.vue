<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppSelect from '../shell/AppSelect.vue';
import type { ConfigurationRecord, PlaylistRecord } from '../../types';
import { formatPlaylistEntryMessage } from '../../lib/ui';

const props = defineProps<{
  playlist: PlaylistRecord | null;
  configurations: ConfigurationRecord[];
}>();

const emit = defineEmits<{
  'name-changed': [value: string];
  'source-folder-picked': [];
  'configuration-changed': [value: string];
  'visibility-changed': [fileName: string, value: boolean];
}>();

const { t } = useI18n({ useScope: 'global' });

const configurationOptions = computed(() => [
  { value: '', label: t('playlist.selectConfiguration') },
  ...props.configurations.map((configuration) => ({
    value: configuration.id,
    label: configuration.name || t('common.untitledConfiguration')
  }))
]);
</script>

<template>
  <div v-if="props.playlist" class="detail-stack playlist-editor">
    <section class="detail-stack detail-section">
      <label class="detail-label">{{ t('playlist.name') }}</label>
      <input
        class="detail-input"
        :value="props.playlist.name"
        :placeholder="t('playlist.namePlaceholder')"
        @input="emit('name-changed', ($event.target as HTMLInputElement).value)"
      />

      <label class="detail-label">{{ t('playlist.sourceFolder') }}</label>
      <div class="inline-field">
        <input class="detail-input" :value="props.playlist.sourceFolder" readonly />
        <button class="chip-button" type="button" @click="emit('source-folder-picked')">{{ t('common.browse') }}</button>
      </div>

      <label class="detail-label">{{ t('playlist.configuration') }}</label>
      <AppSelect
        :model-value="props.playlist.configurationId"
        :options="configurationOptions"
        :placeholder="t('playlist.selectConfiguration')"
        @update:model-value="emit('configuration-changed', $event)"
      />
    </section>

    <section class="detail-section">
      <table class="playlist-table">
        <thead>
          <tr>
            <th>{{ t('common.file') }}</th>
            <th>{{ t('common.info') }}</th>
            <th>{{ t('common.visible') }}</th>
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
  <div v-else class="empty-state">{{ t('playlist.empty') }}</div>
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
.playlist-table {
  font-size: 13px;
}

.playlist-table th,
.playlist-table td {
  padding-top: 8px;
  padding-bottom: 8px;
}
</style>
