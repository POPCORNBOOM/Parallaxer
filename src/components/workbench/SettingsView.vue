<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppSelect from '../shell/AppSelect.vue';
import { formatAppRootPath, formatSettingsStorageHint } from '../../lib/ui';
import { getLocale, setLocale, SUPPORTED_LOCALES, type AppLocale } from '../../i18n';

defineProps<{
  recentFolders: string[];
}>();

const { t } = useI18n({ useScope: 'global' });

const localeOptions = computed(() => [
  { value: 'en' as const, label: t('common.english') },
  { value: 'zh-CN' as const, label: t('common.chineseSimplified') }
]);

const currentLocale = computed(() => getLocale());

function onLocaleChanged(value: string): void {
  if ((SUPPORTED_LOCALES as readonly string[]).includes(value)) {
    setLocale(value as AppLocale);
  }
}
</script>

<template>
  <div class="detail-stack settings-view">
    <section class="detail-stack detail-section">
      <label class="detail-label">{{ t('common.language') }}</label>
      <AppSelect :model-value="currentLocale" :options="localeOptions" @update:model-value="onLocaleChanged" />
    </section>

    <section class="detail-stack detail-section">
      <label class="detail-label">{{ t('settings.appRoot') }}</label>
      <strong>{{ formatAppRootPath() }}</strong>
      <p class="settings-hint">{{ formatSettingsStorageHint() }}</p>
    </section>

    <section class="detail-stack detail-section">
      <label class="detail-label">{{ t('settings.recentPlaylistFolders') }}</label>
      <div v-if="recentFolders.length === 0" class="empty-state compact">{{ t('settings.noRecentPlaylistFolders') }}</div>
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
