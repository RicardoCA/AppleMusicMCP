/**
 * Apple Music MCP Server v2
 * 
 * CONECTA O CLAUDE CODE AO APPLE MUSIC
 * Sem Apple Developer Account! Sem certificado .p8!
 * 
 * Como funciona:
 * 1. usuario faz "node dist/login.js" -> abre navegador
 * 2. usuario faz login com Apple ID no music.apple.com
 * 3. usuario reproduz qualquer musica
 * 4. Playwright captura os tokens automaticamente
 * 5. tokens salvos em tokens.json (validos ~25 dias)
 * 6. MCP server usa esses tokens para falar com a API
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as api from "./apple-music-client.js";
import * as engine from "./recommendation-engine.js";
import { browserLogin, headlessLoginCheck } from "./browser-auth.js";
import { hasValidTokens, TokenExpiredError } from "./token-store.js";

async function main() {
  const server = new McpServer({
    name: "apple-music",
    version: "2.0.0",
    description:
      "Conecta ao Apple Music sem necessidade de Apple Developer account. " +
      "Acesse historico, playlists, busque musicas e crie playlists com recomendacoes.",
  });

  // ============================================================
  // TOOL: Login
  // ============================================================
  server.tool(
    "apple_music_login",
    "Faz login no Apple Music abrindo o navegador. Execute esta ferramenta se os tokens expiraram ou se e a primeira vez. Nao precisa de Apple Developer account - so precisa da sua Apple ID.",
    {},
    async () => {
      const status = await headlessLoginCheck();
      if (status.loggedIn) {
        return {
          content: [{ type: "text" as const, text: `Voce ja esta logado!\n\n${status.message}` }],
        };
      }

      try {
        const success = await browserLogin();
        if (success) {
          return {
            content: [{
              type: "text" as const,
              text: "Login realizado com sucesso! Os tokens foram capturados e salvos.\n\nReinicie o Claude Code para que as mudancas facam efeito, ou tente usar as ferramentas diretamente.",
            }],
          };
        }
        return {
          content: [{
            type: "text" as const,
            text: "Nao foi possivel capturar todos os tokens. Execute novamente no terminal:\n\n  node dist/login.js\n\nDicas:\n- Faca login com sua Apple ID\n- Reproduza qualquer musica\n- Aguarde a mensagem de sucesso",
          }],
          isError: true,
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text" as const,
            text: `Erro no login: ${error.message}\n\nExecute manualmente no terminal:\n  node dist/login.js`,
          }],
          isError: true,
        };
      }
    }
  );

  // ============================================================
  // TOOL: Historico
  // ============================================================
  server.tool(
    "get_recently_played",
    "Retorna as musicas que voce ouviu recentemente no Apple Music.",
    {
      limit: z.number().min(1).max(100).default(25).describe("Numero de musicas (1-100)"),
    },
    async ({ limit }) => {
      return {
        content: [{ type: "text" as const, text: await api.wrapApiErrors(() => api.getRecentlyPlayed(limit)) }],
      };
    }
  );

  // ============================================================
  // TOOL: Playlists
  // ============================================================
  server.tool(
    "get_playlists",
    "Lista suas playlists do Apple Music com nome, descricao e quantidade de musicas.",
    {
      limit: z.number().min(1).max(100).default(25),
    },
    async ({ limit }) => {
      return {
        content: [{ type: "text" as const, text: await api.wrapApiErrors(() => api.getUserPlaylists(limit)) }],
      };
    }
  );

  server.tool(
    "get_playlist_tracks",
    "Retorna as musicas de uma playlist especifica. Use get_playlists para descobrir o ID.",
    {
      playlistId: z.string().describe("ID da playlist (ex: pl.xxxxxx)"),
      limit: z.number().min(1).max(100).default(50),
    },
    async ({ playlistId, limit }) => {
      return {
        content: [{ type: "text" as const, text: await api.wrapApiErrors(() => api.getPlaylistTracks(playlistId, limit)) }],
      };
    }
  );

  // ============================================================
  // TOOL: Busca
  // ============================================================
  server.tool(
    "search_music",
    "Busca musicas, artistas ou albuns no catalogo do Apple Music.",
    {
      query: z.string().describe("Termo de busca"),
      types: z.array(z.enum(["songs", "artists", "albums"])).default(["songs"]),
      limit: z.number().min(1).max(25).default(10),
    },
    async ({ query, types, limit }) => {
      return {
        content: [{ type: "text" as const, text: await api.wrapApiErrors(() => api.searchMusic(query, types, limit)) }],
      };
    }
  );

  // ============================================================
  // TOOL: Recomendacoes
  // ============================================================
  server.tool(
    "get_recommendations",
    "Gera recomendacoes de musicas baseadas no seu historico e playlists do Apple Music.",
    {
      count: z.number().min(5).max(50).default(20),
      diversity: z.enum(["low", "medium", "high"]).default("medium").describe(
        "low=focado, medium=balanceado, high=descobertas"
      ),
    },
    async ({ count, diversity }) => {
      return {
        content: [{ type: "text" as const, text: await api.wrapApiErrors(() => engine.getRecommendations("both", count, diversity)) }],
      };
    }
  );

  // ============================================================
  // TOOL: Perfil Musical
  // ============================================================
  server.tool(
    "get_music_profile",
    "Analisa seu historico e playlists para criar um perfil dos seus gostos musicais: generos favoritos, artistas, diversidade.",
    {},
    async () => {
      return {
        content: [{ type: "text" as const, text: await api.wrapApiErrors(() => engine.buildMusicProfile()) }],
      };
    }
  );

  server.tool(
    "get_top_artists",
    "Retorna seus artistas mais ouvidos baseado no historico do Apple Music.",
    {
      limit: z.number().min(5).max(50).default(20),
    },
    async ({ limit }) => {
      return {
        content: [{ type: "text" as const, text: await api.wrapApiErrors(() => engine.getTopArtists(limit)) }],
      };
    }
  );

  // ============================================================
  // TOOL: Criar Playlist
  // ============================================================
  server.tool(
    "create_playlist",
    "Cria uma playlist no Apple Music. Pode adicionar musicas especificas ou preencher com recomendacoes.",
    {
      name: z.string().describe("Nome da playlist"),
      description: z.string().optional().describe("Descricao da playlist"),
      trackIds: z.array(z.string()).optional().describe(
        "IDs de musicas. Use search_music para encontrar."
      ),
      generateRecommendations: z.boolean().default(false).describe(
        "Se true, preenche com recomendacoes"
      ),
      recommendationSeed: z.string().optional().describe(
        "Tema para recomendacoes (ex: 'indie rock', 'lofi')"
      ),
      maxTracks: z.number().min(1).max(100).default(30),
    },
    async ({ name, description, trackIds, generateRecommendations, recommendationSeed, maxTracks }) => {
      return {
        content: [{
          type: "text" as const,
          text: await api.wrapApiErrors(async () => {
            let ids: string[] = trackIds || [];

            if (generateRecommendations) {
              const recIds = await engine.getRecommendationTrackIds(
                recommendationSeed || "mixed",
                maxTracks - ids.length
              );
              ids = [...ids, ...recIds];
            }

            if (!ids.length) {
              return "Erro: Forneca trackIds ou ative generateRecommendations.";
            }

            return api.createPlaylist(name, description, ids.slice(0, maxTracks));
          }),
        }],
      };
    }
  );

  // ============================================================
  // TOOL: Detalhes de musica
  // ============================================================
  server.tool(
    "get_track_details",
    "Obtem detalhes completos de uma musica especifica do Apple Music.",
    {
      trackId: z.string().describe("ID da musica"),
    },
    async ({ trackId }) => {
      return {
        content: [{ type: "text" as const, text: await api.wrapApiErrors(() => api.getTrackDetails(trackId)) }],
      };
    }
  );

  // ============================================================
  // TOOL: Status
  // ============================================================
  server.tool(
    "apple_music_status",
    "Verifica o status da conexao com o Apple Music: se esta logado, validade dos tokens, etc.",
    {},
    async () => {
      const status = await headlessLoginCheck();
      return {
        content: [{ type: "text" as const, text: status.message }],
      };
    }
  );

  // Iniciar servidor
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Apple Music MCP v2 rodando via stdio...");
}

main().catch((error) => {
  console.error("Erro fatal:", error);
  process.exit(1);
});
