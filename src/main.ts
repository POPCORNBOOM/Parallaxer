import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n';
import { setupGlobalTooltip } from './lib/tooltip';
import '@mdi/font/css/materialdesignicons.css';
import './styles.css';

setupGlobalTooltip();
createApp(App).use(i18n).mount('#app');
