import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.listadecompras.app',
  appName: 'Deu Quanto?',
  webDir: 'dist',
  plugins: {
    // Plugin nativo do Capacitor 8: desenha edge-to-edge, empurra o WebView acima do
    // teclado e injeta --safe-area-inset-* no CSS. LIGHT = ícones escuros (tema claro).
    SystemBars: {
      style: 'LIGHT',
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
