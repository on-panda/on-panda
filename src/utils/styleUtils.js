import { toValue } from 'vue'

export const messageRoleNameStyle = (message) => {
    return {
        color: { 'user': 'orange', 'assistant': 'green' }[toValue(message)['role']] || "#888",
        fontSize: 'larger',
        fontWeight: 'bold',
        marginBottom: '2px',
        marginTop: '10px'
    }
}