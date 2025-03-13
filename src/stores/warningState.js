import { ref } from 'vue'
import { ElMessage } from 'element-plus'

function WarningState() {
    const warningContent = ref("")
    const warningNumber = ref(0)

    function warning(content) {
        if (content instanceof Error) {

            ElMessage({
                showClose: true,
                message: content.message,
                type: 'error',
                duration: 10000,
            })
            let errorMessage = `
    <strong>Error Name:</strong> ${content.name} <br>
    <strong>Error Message:</strong> ${content.message} <br>
    <strong>Error Type:</strong> ${content.constructor.name} <br>
    ${content.fileName ? `<strong>File Name:</strong> ${content.fileName} <br>` : ''}
    ${content.lineNumber ? `<strong>Line Number:</strong> ${content.lineNumber} <br>` : ''}
    <strong>Error Stack:</strong> <pre>${content.stack}</pre>
                `;
            // <strong>Is Custom Error:</strong> ${error instanceof Error} <br>

            content = errorMessage
        } else {
            console.log('warning:', content)
            var json = JSON.stringify(content, null, 2)
            content = '<pre>' + json + '</pre>'
        }
        const now = new Date();
        const dateTimeString = now.toLocaleString();
        warningNumber.value += 1
        warningContent.value = "<hr><br><b>" + warningNumber.value + ' th error, ' + "</b>" + dateTimeString + "<br>" + content + warningContent.value
    }

    return {
        warningContent,
        warningNumber,
        warning,
    }
}


export default WarningState
