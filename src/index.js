export { default as OnPanda } from './App.vue';

export { DialogWithControlStateClosure } from './stores/dialogWithControlState.js'
export { default as OnPandaDialogWithControl } from './components/OnPandaDialogWithControl.vue'

export { ResponseStateClosure } from './stores/responseState.js'
export { default as OnPandaResponseText } from './components/OnPandaResponseText.vue'
export { default as OnPandaResponsePanel } from './components/OnPandaResponsePanel.vue'
export { default as OnPandaDialogPanel } from './components/OnPandaDialogPanel.vue'

export { ControlParameterStateClosure, defaultChatConfig, defaultApiConfig } from './stores/controlParameterState'
export { default as ControlParameterPanel } from './components/ControlParameterPanel.vue'
export { default as DataControlPanel } from './components/DataControlPanel.vue'

export { default as Message } from './components/Message.vue'
export { default as MarkdownRender } from './components/widgets/MarkdownRender.vue';
export { default as CheckboxWidgetSupportNull } from './components/widgets/CheckboxWidgetSupportNull.vue'


import { i18n } from './i18n';
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const plugin = {
  install: (app, options = {}) => {
    app.use(i18n);
    const isElementRegistered = app.component('ElButton') !== undefined;
    // automatically register element-plus if it is not registered
    if (!options.skipElementPlus && !isElementRegistered) {
      const locale = localStorage.getItem('locale') || navigator.language;
      app.use(ElementPlus, {
        locale: locale === 'zh-CN' ? zhCn : en
      });
    }
    if (options.pinia) {  // recommend to app.use(pinia) in host app
      app.use(options.pinia);
    }
  }
};
export default plugin;
export { i18n, plugin };