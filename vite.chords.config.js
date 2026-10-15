import { defineConfig } from 'vite'

// Compile le carnet d'accords en un seul script IIFE pour l'artifact claude.ai.
// React est chargé depuis cdnjs (globals React / ReactDOM), JSX en mode classique.
export default defineConfig({
  oxc: { jsx: { runtime: 'classic' } },
  publicDir: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist-chords',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/chords/main.jsx',
      name: 'CarnetAccords',
      formats: ['iife'],
      fileName: () => 'chords.js',
      cssFileName: 'chords',
    },
    rolldownOptions: {
      external: ['react', 'react-dom/client'],
      output: { globals: { react: 'React', 'react-dom/client': 'ReactDOM' } },
    },
  },
})
