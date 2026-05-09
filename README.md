# Apple Music MCP Server v2

> **Sem Apple Developer Account!** Nao precisa de certificado .p8, chave de API, nem conta de desenvolvedor.

Conecta o **Claude Code** ao **Apple Music** usando apenas sua Apple ID.

## Como Funciona

O MCP abre o navegador real (Chromium), voce faz login no music.apple.com com sua Apple ID, reproduz qualquer musica, e o Playwright captura automaticamente os tokens de autenticacao que o proprio site da Apple gera. Simples assim.

## Setup Rapido (3 passos)

### 1. Instalar

```bash
cd apple-music-mcp
npm install
npx playwright install chromium
npm run build
```

### 2. Login - Parte 1

```bash
node dist/login.js
```
Vai abrir o navegador. Faca login com sua Apple ID e reproduza qualquer musica.
Apos a captura dos tokens, feche o navegador.

### 2. Login - Parte 2
```bash
node atualizatokens.mjs
```





### 3. Configurar no Claude Code

Adicione no arquivo de configuracao MCP:

```json
{
  "mcpServers": {
    "apple-music": {
      "command": "node",
      "args": ["CAMINHO\\COMPLETO\\apple-music-mcp\\dist\\index.js"],
      "cwd": "CAMINHO\\COMPLETO\\apple-music-mcp"
    }
  }
}
```

Reinicie o Claude Code. Pronto!

## Ferramentas Disponiveis

| Ferramenta | Descricao |
|---|---|
| `apple_music_login` | Login via navegador (quando tokens expirarem) |
| `apple_music_status` | Verifica se esta logado e validade dos tokens |
| `get_recently_played` | Suas musicas recentes |
| `get_playlists` | Lista suas playlists |
| `get_playlist_tracks` | Musicas de uma playlist especifica |
| `search_music` | Busca no catalogo (musicas, artistas, albuns) |
| `get_recommendations` | Recomendacoes personalizadas por IA |
| `get_music_profile` | Perfil completo dos seus gostos |
| `get_top_artists` | Artistas mais ouvidos |
| `create_playlist` | Cria playlist (manual ou com recomendacoes) |
| `get_track_details` | Detalhes de uma musica |

## Exemplos no Claude Code

```
- "Quais sao minhas musicas recentes?"
- "Crie uma playlist com 30 recomendacoes de indie rock"
- "Me mostre meu perfil musical"
- "Busque por bossa nova e crie uma playlist 'Foco'"
- "Quais musicas estao na playlist 'Favoritas'?"
- "Quem sao meus top 10 artistas?"
```

## Notas

- Tokens valem ~25 dias. Quando expirarem, execute `node dist/login.js` novamente.
- A primeira vez demora mais porque instala o Chromium (~150MB).
- Funciona no Windows, Mac e Linux.
- Precisa de assinatura Apple Music para dados pessoais (historico, playlists).
- A busca no catalogo funciona ate sem login (limitado).
