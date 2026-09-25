// Gera as imagens-fonte que o `capacitor-assets` usa para o ícone e a splash.
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const out = path.resolve(import.meta.dirname, '../assets')
fs.mkdirSync(out, { recursive: true })

const GREEN = '#1e7a46'
const BG = '#f5f6f1'

// Cesta com um "check": lista de compras conferida.
const basket = (color, checkColor) => `
  <path d="M 372 450 C 372 300, 652 300, 652 450" fill="none" stroke="${color}" stroke-width="46" stroke-linecap="round"/>
  <path d="M 262 440 H 762 Q 790 440 784 468 L 732 716 Q 722 764 674 764 H 350 Q 302 764 292 716 L 240 468 Q 234 440 262 440 Z" fill="${color}"/>
  <path d="M 420 600 L 486 664 L 608 540" fill="none" stroke="${checkColor}" stroke-width="50" stroke-linecap="round" stroke-linejoin="round"/>
`

const svg = (body, bg) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`)

// Ícone adaptativo: o Android recorta a borda, então o desenho encolhe para a zona segura.
const foreground = `<g transform="translate(512 530) scale(0.62) translate(-512 -552)">${basket('#ffffff', GREEN)}</g>`
const full = `<rect width="1024" height="1024" rx="0" fill="${GREEN}"/><g transform="translate(512 540) scale(0.9) translate(-512 -552)">${basket('#ffffff', GREEN)}</g>`

await sharp(svg(full)).png().toFile(path.join(out, 'icon-only.png'))
await sharp(svg(foreground)).png().toFile(path.join(out, 'icon-foreground.png'))
await sharp(svg('', GREEN)).png().toFile(path.join(out, 'icon-background.png'))

const splash = (bg, color, check) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${bg}"/><g transform="translate(1366 1366) scale(0.7) translate(-512 -552)">${basket(color, check)}</g></svg>`,
  )
await sharp(splash(BG, GREEN, BG)).png().toFile(path.join(out, 'splash.png'))
await sharp(splash('#111410', GREEN, '#111410')).png().toFile(path.join(out, 'splash-dark.png'))

console.log('ícones gerados em', out)
