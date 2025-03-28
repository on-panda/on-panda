import { i18n } from './i18n';
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

import OnPanda from './App.vue';
import CheckboxWidgetSupportNull from './components/widgets/CheckboxWidgetSupportNull.vue'
import MarkdownRender from './components/widgets/MarkdownRender.vue';
import Message from './components/Message.vue'
import { ResponseStateClosure } from './stores/responseState.js'
import { ControlParameterState, defaultChatConfig, defaultApiConfig } from './stores/ControlParameterState'
import ControlParameterPanel from './components/ControlParameterPanel.vue'
import OnPandaResponseText from './components/OnPandaResponseText.vue'

export { i18n };
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
export { CheckboxWidgetSupportNull, MarkdownRender, OnPanda, Message, plugin, OnPandaResponseText, ResponseStateClosure, defaultChatConfig, defaultApiConfig, ControlParameterPanel };