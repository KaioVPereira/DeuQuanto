import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'

export const isNative = Capacitor.isNativePlatform()

/**
 * Pilha de "quem fecha primeiro" no botão voltar do Android: um painel aberto se
 * registra aqui, e o voltar fecha o painel em vez de sair da tela.
 */
const backStack: (() => void)[] = []

export function pushBackHandler(fn: () => void): () => void {
  backStack.push(fn)
  return () => {
    const idx = backStack.lastIndexOf(fn)
    if (idx >= 0) backStack.splice(idx, 1)
  }
}

export function initBackButton(isRoot: () => boolean, goBack: () => void) {
  if (!isNative) return () => {}
  const handle = App.addListener('backButton', () => {
    const top = backStack[backStack.length - 1]
    if (top) top()
    else if (!isRoot()) goBack()
    else void App.minimizeApp()
  })
  return () => {
    void handle.then((h) => h.remove())
  }
}

/** Abre a busca de preço do produto (Google Shopping) numa aba do navegador. */
export function searchPriceOnWeb(product: string) {
  const url = `https://www.google.com/search?tbm=shop&hl=pt-BR&gl=br&q=${encodeURIComponent(product)}`
  if (isNative) void Browser.open({ url })
  else window.open(url, '_blank', 'noopener')
}
