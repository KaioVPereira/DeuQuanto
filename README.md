# Deu Quanto?

Lista de compras para Android que compara **o que você esperava gastar** com **o que você pagou**.

- Monte a lista com o preço estimado de cada produto; no mercado, confirme cada item com o preço da gôndola.
- Itens separados por setor do mercado (Hortifrúti, Limpeza, Bebidas…). O setor escolhido fica lembrado para as próximas listas.
- Foto e preço de referência do produto enquanto você digita (catálogo online do Atacadão).
- Mercado de cada compra, com "Perto de mim" (GPS + OpenStreetMap) e histórico de preço por mercado.
- Histórico de listas com esperado × gasto, temas claro/escuro e cinco cores.

Tudo fica salvo só no aparelho — não há servidor nem conta.

## Stack

React 19 + TypeScript + Vite + Tailwind 4, empacotado com Capacitor 8 (Android). Estado em Zustand, persistido
com `@capacitor/preferences`.

## Rodando no navegador

```bash
npm install
npm run dev
```

Abre em `http://localhost:5190`. A busca de fotos passa pelo proxy do Vite (o catálogo não libera CORS); no
celular ela sai pelo HTTP nativo.

## Gerando o APK

Precisa do Android SDK e do JDK que vem com o Android Studio (`JAVA_HOME` apontando para o `jbr`).

```bash
npm run apk          # build web + cap sync + gradlew assembleDebug
npm run apk:install  # instala no celular conectado via adb
```

O APK sai em `android/app/build/outputs/apk/debug/app-debug.apk`.

Ícone e splash são gerados a partir de `scripts/make-icons.mjs` com `npm run icons`.

## Fontes externas

- **Fotos e preços online:** busca pública do catálogo do Atacadão (loja VTEX). Não é uma API oficial e pode
  mudar ou bloquear a qualquer momento; o app continua funcionando sem ela.
- **Mercados perto de mim:** [Overpass API](https://overpass-api.de) do OpenStreetMap. O servidor público limita
  consultas seguidas, por isso o app guarda os mercados de cada região no aparelho por 14 dias.
