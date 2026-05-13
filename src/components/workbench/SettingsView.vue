<script setup lang="ts">
import { formatAppRootPath, formatSettingsStorageHint } from '../../lib/ui';

defineProps<{
  recentFolders: string[];
}>();
</script>

<template>
  <div class="detail-stack settings-view">
    <section class="detail-stack detail-section">
      <label class="detail-label">App Root</label>
      <strong>{{ formatAppRootPath() }}</strong>
      <p class="settings-hint">{{ formatSettingsStorageHint() }}</p>
    </section>

    <section class="detail-stack detail-section">
      <label class="detail-label">Recent Playlist Folders</label>
      <div v-if="recentFolders.length === 0" class="empty-state compact">No recent playlist folders yet.</div>
      <ul v-else class="recent-list">
        <li v-for="folder in recentFolders" :key="folder">{{ folder }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.settings-view {
  gap: 14px;
}

.detail-section {
  gap: 8px;
}

.detail-label {
  font-size: 11px;
  letter-spacing: 0.03em;
}

.settings-hint,
.recent-list,
strong {
  font-size: 13px;
  line-height: 1.4;
}
</style>
