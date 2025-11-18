import { createVNode, render } from 'vue'
import DialogEditor from '../components/widgets/DialogEditor.vue'

const toText = (value) => {
  if (value == null) return ''
  return typeof value === 'string' ? value : String(value)
}

const normalizeInput = (value) => {
  if (value && typeof value === 'object') {
    const extraProps = {}
    if (value.title != null) extraProps.title = value.title
    if (value.documentation != null) extraProps.documentation = value.documentation
    return {
      text: toText(value.content),
      props: extraProps
    }
  }
  return {
    text: toText(value),
    props: {}
  }
}

export function openDialogEditor(initialValue = '', appContext = null) {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const { text, props } = normalizeInput(initialValue)

    let currentValue = text
    let settled = false

    const cleanup = (result) => {
      if (settled) return
      settled = true
      render(null, container)
      container.remove()
      resolve(result)
    }

    const vnode = createVNode(DialogEditor, {
      visible: true,
      modelValue: currentValue,
      ...props,
      'onUpdate:modelValue': (value) => {
        currentValue = value ?? ''
      },
      'onUpdate:visible': (visible) => {
        if (!visible) {
          cleanup(null)
        }
      },
      onConfirm: () => {
        cleanup(currentValue)
      },
      onCancel: () => {
        cleanup(null)
      }
    })

    if (appContext) {
      vnode.appContext = appContext
    }

    render(vnode, container)
  })
}
