<script setup lang="ts">
import type { MonitorRecord } from '../../types';
import { formatConnectedState } from '../../lib/ui';

const props = defineProps<{
  monitor: MonitorRecord | null;
}>();

const emit = defineEmits<{
  'friendly-name-changed': [value: string];
}>();
</script>

<template>
  <div v-if="props.monitor" class="detail-stack monitor-detail">
    <section class="detail-section">
      <label class="detail-label">Friendly Name</label>
      <input
        class="detail-input"
        :value="props.monitor.friendlyName"
        placeholder="Monitor label"
        @input="emit('friendly-name-changed', ($event.target as HTMLInputElement).value)"
      />
    </section>

    <section class="detail-section detail-grid">
      <div>
        <span class="detail-label">Status</span>
        <strong>{{ formatConnectedState(props.monitor) }}</strong>
      </div>
      <div>
        <span class="detail-label">Device ID</span>
        <strong>{{ props.monitor.deviceId }}</strong>
      </div>
      <div>
        <span class="detail-label">System Name</span>
        <strong>{{ props.monitor.systemName }}</strong>
      </div>
      <div>
        <span class="detail-label">Geometry</span>
        <strong>{{ props.monitor.size.width }}×{{ props.monitor.size.height }} at {{ props.monitor.position.x }},{{ props.monitor.position.y }}</strong>
      </div>
      <div v-if="props.monitor.refreshRate">
        <span class="detail-label">Refresh Rate</span>
        <strong>{{ props.monitor.refreshRate }}Hz</strong>
      </div>
      <div v-if="props.monitor.manufacturer">
        <span class="detail-label">Manufacturer</span>
        <strong>{{ props.monitor.manufacturer }}</strong>
      </div>
      <div v-if="props.monitor.productCode">
        <span class="detail-label">Product Code</span>
        <strong>{{ props.monitor.productCode }}</strong>
      </div>
      <div v-if="props.monitor.serialNumber">
        <span class="detail-label">Serial Number</span>
        <strong>{{ props.monitor.serialNumber }}</strong>
      </div>
    </section>
  </div>
  <div v-else class="empty-state">Select a monitor from the sidebar.</div>
</template>

<style scoped>
.monitor-detail {
  gap: 12px;
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
}
</style>
