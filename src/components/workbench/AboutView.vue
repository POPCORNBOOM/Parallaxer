<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });

const mitLicenseText = `MIT License

Copyright (c) 2026 Yigu Wang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
</script>

<template>
  <div class="detail-stack about-view">
    <section class="detail-stack detail-section">
      <h3 class="about-title">{{ t('about.title') }}</h3>
      <p class="about-copy">{{ t('about.summary') }}</p>
    </section>

    <section class="detail-stack detail-section about-license-card">
      <label class="detail-label">{{ t('about.license') }}</label>
      <pre class="about-license-text">{{ mitLicenseText }}</pre>
    </section>
  </div>
</template>

<style scoped>
.about-view {
  gap: 14px;
}

.detail-section {
  gap: 8px;
}

.about-title {
  margin: 0;
  font-size: 18px;
  font-weight: var(--font-weight-ui-title);
  color: var(--color-text-primary);
}

.about-copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-ui-body);
}

.about-license-card {
  padding: 12px;
  border-radius: var(--radius-panel);
  background: var(--color-surface-muted);
  box-shadow: inset 0 0 0 1px var(--color-divider);
}

.about-license-text {
  margin: 0;
  max-height: min(58vh, 620px);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
