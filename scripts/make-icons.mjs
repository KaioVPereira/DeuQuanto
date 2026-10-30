// Gera as imagens-fonte que o `capacitor-assets` usa para o ícone e a splash.
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const out = path.resolve(import.meta.dirname, '../assets')
fs.mkdirSync(out, { recursive: true })

const GREEN = '#1e7a46'
const BG = '#f5f6f1'

// Cesta de palha com compras (pão, leite, maçã, cenoura). Desenhada num quadro de 1024,
// centrada em (512, 525).
const WICKER = '#d48a3e'
const WICKER_DARK = '#a9652a'

const handle = `<path d="M 300 530 C 300 215, 724 215, 724 530" fill="none" stroke="${WICKER_DARK}" stroke-width="40" stroke-linecap="round"/>`

const baguette = `
  <g transform="rotate(-28 372 420)">
    <rect x="330" y="228" width="84" height="330" rx="42" fill="#f1c27d"/>
    <path d="M 352 286 l 40 -18 M 352 346 l 40 -18 M 352 406 l 40 -18" stroke="#b9762c" stroke-width="11" stroke-linecap="round"/>
  </g>`

const carrot = `
  <g transform="rotate(24 700 420)">
    <path d="M 700 236 q -26 -60 -10 -84 M 700 236 q 0 -70 22 -92 M 700 236 q 26 -54 56 -64" stroke="#9be08a" stroke-width="20" stroke-linecap="round" fill="none"/>
    <path d="M 662 240 Q 700 222 738 240 L 706 540 Q 700 556 694 540 Z" fill="#f28c28"/>
  </g>`

const milk = `
  <path d="M 452 340 L 478 290 H 546 L 572 340 Z" fill="#dbe7ff"/>
  <rect x="482" y="266" width="60" height="28" rx="6" fill="#dbe7ff"/>
  <rect x="452" y="338" width="120" height="220" fill="#ffffff"/>
  <rect x="452" y="392" width="120" height="56" fill="#3d8bfd"/>`

const apple = `
  <path d="M 622 352 q 4 -34 22 -50" stroke="#7a4a1f" stroke-width="14" stroke-linecap="round" fill="none"/>
  <path d="M 630 330 q 34 -46 76 -26 q -30 44 -76 26 Z" fill="#9be08a"/>
  <path d="M 618 362 C 580 336 528 356 528 420 C 528 480 572 530 604 530 C 614 530 618 524 622 524 C 626 524 630 530 640 530 C 672 530 716 480 716 420 C 716 356 664 336 626 362 Z" fill="#e5484d"/>`

const body = 'M 236 578 H 788 L 744 790 Q 736 832 692 832 H 332 Q 288 832 280 790 Z'
const basket = `
  <rect x="204" y="512" width="616" height="66" rx="33" fill="${WICKER_DARK}"/>
  <path d="M 236 560 H 788 L 744 790 Q 736 832 692 832 H 332 Q 288 832 280 790 Z" fill="${WICKER}"/>
  <clipPath id="trama"><path d="${body}"/></clipPath>
  <g clip-path="url(#trama)" stroke="${WICKER_DARK}" stroke-width="12" fill="none">
    ${[640, 700, 760].map((y) => `<path d="M 200 ${y} H 830"/>`).join('')}
    ${[300, 370, 440, 512, 584, 654, 724].map((x) => `<path d="M ${x} 578 L ${x - (x - 512) * 0.08} 840"/>`).join('')}
  </g>
  <path d="M 236 545 H 788" stroke="#c47a33" stroke-width="10" stroke-dasharray="26 18" stroke-linecap="round"/>`

const art = handle + baguette + carrot + milk + apple + basket
const place = (cx, cy, scale) => `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-512 -525)">${art}</g>`

const svg = (content, bg, size = 1024) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}${content}</svg>`,
  )

// Ícone adaptativo: o ic_launcher.xml já recua o foreground 16,7% (ele ocupa só a área visível),
// então aqui o desenho só precisa caber no círculo da máscara.
await sharp(svg(place(512, 528, 1))).png().toFile(path.join(out, 'icon-foreground.png'))
await sharp(svg('', GREEN)).png().toFile(path.join(out, 'icon-background.png'))
await sharp(svg(place(512, 528, 0.85), GREEN)).png().toFile(path.join(out, 'icon-only.png'))

await sharp(svg(place(1366, 1366, 0.75), BG, 2732)).png().toFile(path.join(out, 'splash.png'))
await sharp(svg(place(1366, 1366, 0.75), '#111410', 2732)).png().toFile(path.join(out, 'splash-dark.png'))

console.log('ícones gerados em', out)
