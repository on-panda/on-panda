<script setup>
import MessageMarkdown from './components/MessageMarkdown.vue'
import { ref, computed } from 'vue'
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://127.0.0.1:8001/v1",
        apiKey: "sk-Nokey",
        dangerouslyAllowBrowser: true
      });

const tokens = ref([]);

const assistentRespone = computed(() => {
  return tokens.value.map((token) => token.text).join(" ");
});


logprobToProb = (logprob) => {
  return Math.exp(logprob);
}

probToColor = (prob) => {
  return `rgba(0, 0, 0, ${prob})`;
}

async function main() {
  const stream = await openai.chat.completions.create({
      model: 'meta-llama/Meta-Llama-3-8B-Instruct',
      // messages: [{ role: "user", content:"just repeat `=🧎🏿‍♂️‍➡️磊潟﨎蘒𝒀𝒆𝒔`, no other words" }],
      // messages: [{ role: "user", content:"just repeat `Yes,🧎🏿‍♂️‍➡️𝒀𝒆𝒔`, no other words" }],
      messages: [{ role: "user", content:"用中文讲个关于 Linux 的笑话" }],
      stream: true,
      logprobs: true, 
      top_logprobs: 2,
      top_p: 0.1,
  }, {skip_special_tokens:false, prompt_logprobs:5});
  for await (const chunk of stream) {
    var delta = (chunk.choices[0]?.delta?.content || "");
    var token = chunk.choices[0];
    console.log(delta, token);
    if(chunk.choices) {
      tokens.value.push(chunk.choices[0]);
    }
  }
}

main();
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="./assets/logo.svg" width="125" height="125" />

    <MessageMarkdown content="**Hello** _world_ $E=mc^2$!" />
    <!-- <MessageMarkdown :content="respone" /> -->
  </header>
  <div style="background-color: #eee;">
    <span v-for="token in tokens" :style>
      {{ token?.delta?.content }}
    </span>
  </div>
  <main>
    
    <!-- <TheWelcome /> -->
  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
