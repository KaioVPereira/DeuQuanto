# Deu Quanto?

Lista de compras para Android que compara **o que você esperava gastar** com **o que você pagou**.

- Monte a lista com o preço estimado de cada produto; no mercado, confirme cada item com o preço da gôndola.
- Itens separados por setor do mercado (Hortifrúti, Limpeza, Bebidas…). O setor escolhido fica lembrado para as próximas listas.
- Foto e preço de referência do produto enquanto você digita (catálogo online do Atacadão).
- Mercado de cada compra, com "Perto de mim" (GPS + OpenStreetMap) e histórico de preço por mercado.
- Histórico de listas com esperado × gasto, temas claro/escuro e cinco cores.
- **Listas compartilhadas:** convite por link/código; o que um celular muda aparece no outro em segundos.

Tudo fica salvo no aparelho, sem conta. O servidor (`server/`) só entra em cena para as listas compartilhadas
e para avisar que há versão nova do app.

## Listas compartilhadas

Quem compartilha gera um código de 6 letras (`K7P-4QX`) e manda o link `https://deuquanto.gamestrackers.com/c/K7P4QX`.
Quem toca no link cai no app (ou numa página com o código e o download) e recebe a lista inteira.

- Cada celular manda **só os campos que mudou**; o servidor junta campo a campo. Ela marcar o leite e você
  mudar a quantidade do leite não brigam. No mesmo campo vale o que chegou por último no servidor.
- **Remover é definitivo**: edição num item removido é ignorada.
- **Sem internet**, as alterações ficam numa fila salva no aparelho e vão quando a conexão volta. Reenviar
  é seguro: cada alteração tem um id e o servidor ignora repetidas.
- Os dois adicionaram o mesmo produto sem internet? Vira **um item só, com a maior quantidade**.
- O catálogo (setor aprendido, preço sugerido) continua de cada um; o preço pago por quem estava no mercado
  entra no histórico dos dois.
- A lista sincroniza a cada 4 s com ela aberta, a cada 30 s nas outras telas e logo depois de cada alteração.

Contrato entre app e servidor: `shared/protocol.ts`. Regras do servidor: `server/src/sync.ts` (testes em
`server/test/`). Junção no celular: `src/sync/merge.ts`.

### Servidor

Node 24 puro (http, SQLite e TypeScript embutidos) — **sem dependências**.

```bash
cd server
npm test    # regras de sincronização
npm start   # porta 8787, banco em server/data/
```

Com o servidor local de pé, o `npm run dev` do app já fala com ele (proxy do Vite em `/api`).

Produção: contêiner `deuquanto-sync` na VPS do Games Trackers (`deploy/docker-compose.yml`), atrás do Caddy
de lá. Push na `main` mexendo em `server/`, `shared/` ou `deploy/` roda os testes e faz o deploy.

### Versão do app (Ajustes → Aplicativo)

Igual ao Finanças e ao Games Trackers: a versão mais nova fica na tabela `app_releases` do servidor; o app
compara com o próprio `versionCode` e oferece o download. Para publicar:

1. Subir `versionCode` (inteiro, sempre maior) e `versionName` em `android/app/build.gradle`.
2. `npm run apk` e copiar `android/app/build/outputs/apk/debug/app-debug.apk` para `apk/deu-quanto-X.Y.Z.apk`.
3. `scp apk/deu-quanto-X.Y.Z.apk root@<vps>:/root/deuquanto-data/apk/`
4. `ssh root@<vps> docker exec deuquanto-sync node scripts/publish-release.ts --version X.Y.Z --code N --file deu-quanto-X.Y.Z.apk --notes "O que mudou"`
5. Conferir `https://deuquanto.gamestrackers.com/api/app/android`.

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
