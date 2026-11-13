import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                gravity: 'index.html',
                flock: 'flock.html',
            },
        },
    },
});