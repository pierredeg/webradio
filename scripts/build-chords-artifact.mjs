// Assemble le carnet d'accords en une page HTML autonome (artifact claude.ai).
// Usage : npx vite build -c vite.chords.config.js && node scripts/build-chords-artifact.mjs [sortie.html]
import { readFileSync, writeFileSync } from 'node:fs'

const out = process.argv[2] || 'dist-chords/carnet-accords.html'
const css = readFileSync('dist-chords/chords.css', 'utf8')
const js = readFileSync('dist-chords/chords.js', 'utf8').replace(/<\/script/gi, '<\\/script')

const html = `<title>Carnet d’accords</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;600;700&family=Barlow:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
${css}
</style>
<div id="chords-root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>
${js}
</script>
`
writeFileSync(out, html)
console.log('écrit :', out, (html.length / 1024).toFixed(1), 'Ko')
