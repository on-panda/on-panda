<script setup>
import { OnPandaWeb } from '@on-panda/on-panda'

import DialogWithControlExample from './DialogWithControlExample.vue'
import OnPandaResponseTextExample from './OnPandaResponseTextExample.vue'
import { testApiConfigs, testModelNameTags } from './testApiConfig.js'
</script>

<template>
  <main class="page">
    <header>
      <h1>onPanda integration examples</h1>
      <p>
        These examples show how to use the complete onPanda app and its standalone Vue components.
      </p>
    </header>

    <section class="example-section">
      <h2>1. Complete onPanda application</h2>
      <p><code>OnPandaWeb</code> includes the dialog editor, controls, examples, and annotation tools.</p>
      <OnPandaWeb :apiConfigs="testApiConfigs" :modelNameTags="testModelNameTags" />
    </section>

    <section class="example-section">
      <h2>2. Standalone response components</h2>
      <p><code>ResponseStateClosure</code> lets an app own the messages and render only the model response.</p>
      <OnPandaResponseTextExample />
    </section>

    <section class="example-section">
      <h2>3. Dialog component with controls</h2>
      <p><code>DialogWithControlStateClosure</code> provides the dialog state for a custom page layout.</p>
      <DialogWithControlExample />
    </section>
  </main>
</template>

<style>
:root {
  font-family: Arial, sans-serif;
  color: #222;
  background: #f7f8fa;
}

body {
  margin: 0;
}

.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 20px 80px;
}

.example-section {
  margin-top: 40px;
  padding: 20px;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
}

code {
  padding: 2px 4px;
  background: #f0f2f5;
  border-radius: 3px;
}
</style>
