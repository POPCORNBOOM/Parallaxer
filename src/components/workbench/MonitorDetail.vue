<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { MonitorRecord } from '../../types';
import { formatConnectedState, formatLastSeenAt } from '../../lib/ui';

const props = defineProps<{
  monitor: MonitorRecord | null;
}>();

const emit = defineEmits<{
  'friendly-name-changed': [value: string];
  'forget-monitor': [];
}>();

const { t } = useI18n({ useScope: 'global' });
</script>

<template>
  <div v-if="props.monitor" class="detail-stack monitor-detail">
    <section class="detail-section">
      <label class="detail-label">{{ t('monitor.friendlyName') }}</label>
      <input
        class="detail-input"
        :value="props.monitor.friendlyName"
        :placeholder="t('monitor.friendlyNamePlaceholder')"
        @input="emit('friendly-name-changed', ($event.target as HTMLInputElement).value)"
      />
    </section>

    <section class="detail-section detail-grid">
      <div>
        <span class="detail-label">{{ t('monitor.status') }}</span>
        <strong>{{ formatConnectedState(props.monitor) }}</strong>
      </div>
      <div>
        <span class="detail-label">{{ t('monitor.lastLive') }}</span>
        <strong>{{ formatLastSeenAt(props.monitor.lastSeenAt) }}</strong>
      </div>
      <div>
        <span class="detail-label">{{ t('monitor.deviceId') }}</span>
        <strong>{{ props.monitor.deviceId }}</strong>
      </div>
      <div>
        <span class="detail-label">{{ t('monitor.systemName') }}</span>
        <strong>{{ props.monitor.systemName }}</strong>
      </div>
      <div>
        <span class="detail-label">{{ t('monitor.geometry') }}</span>
        <strong>{{ props.monitor.size.width }}×{{ props.monitor.size.height }} at {{ props.monitor.position.x }},{{ props.monitor.position.y }}</strong>
      </div>
      <div v-if="props.monitor.refreshRate">
        <span class="detail-label">{{ t('monitor.refreshRate') }}</span>
        <strong>{{ props.monitor.refreshRate }}Hz</strong>
      </div>
      <div v-if="props.monitor.manufacturer">
        <span class="detail-label">{{ t('monitor.manufacturer') }}</span>
        <strong>{{ props.monitor.manufacturer }}</strong>
      </div>
      <div v-if="props.monitor.productCode">
        <span class="detail-label">{{ t('monitor.productCode') }}</span>
        <strong>{{ props.monitor.productCode }}</strong>
      </div>
      <div v-if="props.monitor.serialNumber">
        <span class="detail-label">{{ t('monitor.serialNumber') }}</span>
        <strong>{{ props.monitor.serialNumber }}</strong>
      </div>
      <div v-if="props.monitor.edid" class="detail-span">
        <span class="detail-label">{{ t('monitor.edid') }}</span>
        <code class="detail-code">{{ props.monitor.edid }}</code>
      </div>
    </section>

    <section v-if="!props.monitor.connected" class="detail-section monitor-detail-actions">
      <button class="chip-button danger" type="button" @click="emit('forget-monitor')">
        {{ t('monitor.forgetMonitor') }}
      </button>
    </section>
  </div>
  <div v-else class="empty-state">{{ t('monitor.empty') }}</div>
</template>

<style scoped>
.monitor-detail {
  gap: 12px;
}

.detail-section {
  display: grid;
  gap: 10px;
}

.detail-input,
.detail-grid {
  font-size: 13px;
}

.detail-grid {
  gap: 12px 18px;
}

.detail-grid strong {
  display: block;
  margin-top: 2px;
  line-height: 1.35;
  color: var(--color-detail-value);
  font-weight: var(--font-weight-ui-value);
}

.detail-span {
  grid-column: 1 / -1;
}

.detail-code {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}

.monitor-detail-actions {
  display: flex;
  justify-content: flex-start;
}
</style>
