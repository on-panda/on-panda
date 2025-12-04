export default {
  common: {
    save: 'Save',
    delete: 'Delete',
    close: 'Close',
    edit: 'Edit',
    cancel: 'Cancel',
    confirm: 'Confirm',
    continue: 'Continue',
    stop: 'Stop',
    copy: 'Copy',
    paste: 'Paste',
    refresh: 'Refresh',
    examples: 'examples',
    instructions: 'Instructions',
    dialog: 'dialog',
    newMessage: 'new message',
    controlParameter: 'control parameter',
    errorMessages: 'Error Messages',
    advancedControl: 'Advanced Control'
  },
  controlParameter: {
    model: 'model',
    temperature: 'temperature',
    maxTokens: 'max_tokens',
    topLogprobs: 'top_logprobs',
    continueGenerating: 'continue generating',
    native: 'native',
    promptEngineering: 'prompt engineering',
    refreshModelList: 'Refresh model list',
    editLocalStorageApiConfigs: 'Edit custom API configs',
    editLocalStorageApiConfigsInstructions: `
- Connect your own custom APIs to onPanda
- Supports JSON5 (a more relaxed JSON format)
- The outer structure must be an array
- Copy-paste runnable example:
\`\`\`js
[
    { // openAI chat completion API format
      "client_config": {
          "base_url": "https://vllm-test-api.diyer22.com/v1",
          "api_key": "ak-onPandaTestKey",  // API key
      },
      "chat_config": {  // chat completion request parameters
          // If no model is specified, /models will be called automatically to fetch the list
          "model": "Qwen/Qwen2.5-7B-Instruct-GPTQ-Int4",
          "top_logprobs": 5,  // number of candidates; set to 0 to disable logprobs
          // ... supports any other chat parameters
      },
      // Optional fields below:
      // Whether native assistant continuation is supported (e.g., open-source models and Claude support it, OpenAI does not). Default true
      "support_continue_final_message": true,
      "endpoint_name": "example",  // API alias
      "tag_name": "custom",  // Quick model tag shown in the onPanda UI
      "low_priority": false,  // Whether low priority. Will be placed at the end of the model list, and the matching priority is also the lowest
    },
    // { ... } another API config
]
\`\`\`
- You can view the current API configuration under \`Advanced Control\` → \`Current API config JSON\`.

**Privacy notice:**
- Custom API configs are stored locally in your browser (localStorage)
- When you use a custom API, onPanda sends the request directly from your browser and never uploads anything to third-party servers
`.replaceAll('{', '&#123;').replaceAll('}', '&#125;')
  },
  userMessages: {
    waiting: 'Waiting...',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    responseRefreshed: 'Response probability refreshed',
    modelsRefreshed: 'Model list refresh completed',
    noPromptLogprobs: 'No prompt_logprobs in response, maybe the model does not support prompt_logprobs',
    dropJsonHere: 'Drop JSON file here!',
    onlyOneJsonFile: 'Only one JSON file can be uploaded',
    openAnnotatorPanel: 'Open annotator panel',
    waitingForModel: 'request, waiting response from model:',
    clickSendButton: '➡️ Please click the send button.'
  },
  tooltips: {
    dialogKeyHint: `Dialog tab:
1. Click the tag to switch to the corresponding dialog
2. You can also use the left and right arrow keys to switch dialog
3. Green dot indicates that the corresponding dialog's \`is_good\` is \`Y\`
4. Blue dot indicates that the corresponding dialog's response is new generated rather than continued`,
    saveData: 'Save the data',
    previousModification: 'Previous modification',
    nextModification: 'Next modification',
    deleteDialog: 'Delete current dialog',
    eraseDialog: 'Erase current dialog',
    clearAndReset: 'Clear and reset this data',
    restoreDialog: 'Restore current dialog',
    uploadFile: 'Upload *.panda.json file',
    downloadFile: 'Download panda.json file',
    cleanUI: 'Clean UI (reading mode)',
    continueGenerating: 'Continue generating',
    stopGenerating: 'Stop generating',
    modelTagClick: '1. Single-click the tag to switch model; double-click to switch and regenerate.\n2. If hold down the `Ctrl` key and click or use the middle mouse button, will open a new window and regenerate using the chosen model.',
    continueGeneratingSupport: 'Is this model support continue final message natively?\n\nIf not, the engineering prompt will be used for continue generating: \n\n> ',
    refreshTokenProb: 'Refresh tokens\' probability. Or',
    dblclickToPasteAndRefresh: 'double-click to',
    pasteAndRefresh: 'Paste & Refresh'
  },
  placeholders: {
    submitEnter: 'Submit: `↵`; newline: `shift+↵`',
  },
  annotator: {
    annotatorPanel: 'Annotator Panel',
    isGood: 'is_good',
    isGoodTooltip: 'Is the last assistant\'s response good?',
    defaultChoice: 'If no choice was made, \'Y\' is the default if it is the latest dialog, otherwise \'N\' is the default.',
    noChoiceMade: 'No choice was made',
    latestDialogDefault: 'as it is the latest dialog, so \'Y\' is the default.',
    notLatestDialogDefault: 'as it is NOT the latest dialog, so \'N\' is the default.',
    currentDialogJson: 'current dialog JSON',
    dialogCacheTips: 'This dialogCache may not be updated in time. Try switching the dialog to refresh it.',
    tokens: 'tokens',
    dialogLevel: 'dialog level / data level',
    notSavedYet: 'Not saved yet',
    pandaTreeJson: 'panda tree JSON',
    title: 'title',
    uploadFile: 'upload file',
    updateTime: 'update time',
    description: 'description',
    comment: 'comment'
  },
  chatMessage: {
    emptyMessageIgnored: 'Empty message will be ignored',
    renderedMarkdown: 'rendered markdown:',
    clear: 'Clear',
    delete: 'Delete',
    send: 'Send➡️',
    ctrlEnter: 'ctrl+enter'
  },
  dialogPanel: {
    promptLogprobsTooltip: 'After refreshing token probabilities, you can inspect the entire prompt logprobs visualization (chat templates).',
    promptVisualizationLabel: 'Full prompt visualization 🪄'
  },
  header: {
    usage: 'Usage',
    basicFeatures: 'Basic Features',
    advancedFeatures: 'Advanced Features',
    beginnerTips: 'Beginner\'s tips',
    asDataAnnotator: 'as Data Annotator',
    asWritingTool: 'as Writing Tool',
    asDrivingMode: 'as Model API',
    dataAnnotatorDesc: 'Scaling up your data efficiency with token-level supervision.',
    writingToolDesc: 'Precision byte-level control for LLM writing.',
    drivingModeDesc: 'You will disguise as an API and guide the model to complete tasks.',
    instruction: `
### Usage:
**Basic Features:**
- Hover over any word to see alternative suggestions
- Click a suggestion to continue generating from that point
- Double-click any word to manually edit and continue
- Select text to edit or let AI optimize it

**Advanced Features:**
- Paste images and audios directly for multimodal language model support
- Single-click image to enlarge, double-click to open
- Double-click role labels to edit them
- Hold down the \`Alt\` key while clicking to copy the content of the suggestion.

**Beginner's tips:**
- You can try any button freely, except save button.
- Recommend clicking on all the examples below once.
        `
  }
} 
