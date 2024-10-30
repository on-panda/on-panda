import { ref, onMounted } from 'vue';

export function useScrollSwitchSync(scrollDiv) {
    /* Usage:
    <el-switch
        v-model="scrollSwitch.isSwitched.value"
        inline-prompt
        active-text="Y"
        inactive-text="N"
        @change="scrollSwitch.scrollToPosition"
    />
  
    const scrollDiv = ref(null);
    const scrollSwitch = useScrollSwitchSync(scrollDiv); // { isSwitched, scrollToPosition }
    */
    const isSwitched = ref(true);

    // 滚动到相应位置
    const scrollToPosition = () => {
        // 移除滚动事件监听，避免触发 syncSwitchWithScroll
        scrollDiv.value.removeEventListener('scroll', syncSwitchWithScroll);

        // 滚动到对应位置
        scrollDiv.value.scrollTo({
            left: isSwitched.value ? 0: scrollDiv.value.scrollWidth,
            behavior: 'smooth'
        });

        // 滚动结束后再添加监听
        scrollDiv.value.addEventListener('scroll', syncSwitchWithScroll, { passive: true });
    };

    // 同步 Switch 和滚动位置
    const syncSwitchWithScroll = () => {
        const maxScrollLeft = scrollDiv.value.scrollWidth - scrollDiv.value.clientWidth;
        isSwitched.value = scrollDiv.value.scrollLeft <= maxScrollLeft / 2;
    };

    // 初始挂载时设置滚动位置
    onMounted(() => {
        scrollDiv.value.addEventListener('scroll', syncSwitchWithScroll, { passive: true });
        scrollToPosition();
    });

    return { isSwitched, scrollToPosition };
}