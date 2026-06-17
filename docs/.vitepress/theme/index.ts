import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { useRoute } from 'vitepress';
import { onMounted, watch, nextTick } from 'vue';
import mediumZoom from 'medium-zoom';
import './custom.css';

// Click-to-zoom lightbox for documentation images: inline images stay modest
// (see custom.css), and clicking opens the full-resolution screenshot in a
// popup so details on full-page captures stay readable.
export default {
    extends: DefaultTheme,
    setup() {
        const route = useRoute();
        let zoom: ReturnType<typeof mediumZoom> | null = null;
        const init = () => {
            zoom?.detach();
            zoom = mediumZoom('.vp-doc img', { background: 'rgba(0, 0, 0, 0.85)', margin: 32 });
        };
        onMounted(() => nextTick(init));
        watch(
            () => route.path,
            () => nextTick(init),
        );
    },
} satisfies Theme;
