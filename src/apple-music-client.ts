/**
 * Apple Music API Client (v2 - Sem Apple Developer Account)
 * 
 * Usa os tokens capturados automaticamente pelo navegador (Playwright).
 * Nao precisa de .p8, certificado, Apple Developer account.
 * 
 * Funciona porque o proprio music.apple.com gera os tokens necessarios.
 */

import { request as playwrightRequest } from "playwright";
import { existsSync } from "fs";
import {
  getStorefrontId,
  loadTokens,
  SESSION_FILE,
  TokenExpiredError,
} from "./token-store.js";

const BASE_URL = "https://api.music.apple.com/v1";

/**
 * Faz chamada a Apple Music API usando Playwright APIRequestContext
 * com o session state salvo durante o login (inclui cookies da sessao Apple)
 */
async function fetchApi<T>(
  endpoint: string,
  options: {
    method?: string;
    body?: any;
    useUserToken?: boolean;
  } = {}
): Promise<T> {
  const { method = "GET", body, useUserToken = false } = options;
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;

  const tokens = loadTokens();
  if (!tokens) throw new TokenExpiredError();

  if (!existsSync(SESSION_FILE)) {
    throw new TokenExpiredError();
  }

  const extraHeaders: Record<string, string> = {
    Authorization: `Bearer ${tokens.developerToken}`,
    Origin: "https://music.apple.com",
    Referer: "https://music.apple.com/",
  };

  if (useUserToken) {
    extraHeaders["Music-User-Token"] = tokens.userToken;
  }

  const ctx = await playwrightRequest.newContext({
    storageState: SESSION_FILE,
    extraHTTPHeaders: extraHeaders,
  });

  try {
    const response = await ctx.fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      data: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok()) {
      let detail = `${response.status()} ${response.statusText()}`;
      try {
        const errJson = await response.json();
        if (errJson.errors?.[0]) {
          detail = `${errJson.errors[0].title} - ${errJson.errors[0].detail}`;
        }
      } catch { /* */ }

      if (response.status() === 401) {
        throw new TokenExpiredError();
      }

      throw new Error(`Apple Music API: ${detail}`);
    }

    return response.json() as Promise<T>;
  } finally {
    await ctx.dispose();
  }
}

// ============================================================
// Historico de Reproducao
// ============================================================

export async function getRecentlyPlayed(limit: number = 25): Promise<string> {
  const response = await fetchApi<{ data: any[]; meta?: { total: number } }>(
    `/me/recent/played?limit=${Math.min(limit, 100)}`,
    { useUserToken: true }
  );

  if (!response.data?.length) {
    return "Nenhuma musica recente encontrada. Tente reproduzir algumas musicas no Apple Music primeiro.";
  }

  const lines = [
    `# Musicas Reproduzidas Recentemente`,
    `Total: ${response.meta?.total || response.data.length} musicas\n`,
  ];

  response.data.forEach((track, i) => {
    const a = track.attributes || {};
    const dur = Math.round((a.durationInMillis || 0) / 1000);
    const mins = Math.floor(dur / 60);
    const secs = (dur % 60).toString().padStart(2, "0");
    const genres = (a.genreNames || []).join(", ") || "N/A";

    lines.push(
      `${i + 1}. **${a.name || "N/A"}** - ${a.artistName || "N/A"}`,
      `   Album: ${a.albumName || "N/A"} | Genero: ${genres} | Duracao: ${mins}:${secs}`,
      `   ID: ${track.id}`,
      ""
    );
  });

  return lines.join("\n");
}

// ============================================================
// Playlists
// ============================================================

export async function getUserPlaylists(limit: number = 25): Promise<string> {
  const response = await fetchApi<{ data: any[]; meta?: { total: number } }>(
    `/me/library/playlists?limit=${Math.min(limit, 100)}`,
    { useUserToken: true }
  );

  if (!response.data?.length) {
    return "Nenhuma playlist encontrada.";
  }

  const lines = [
    `# Suas Playlists`,
    `Total: ${response.meta?.total || response.data.length}\n`,
  ];

  response.data.forEach((pl, i) => {
    const a = pl.attributes || {};
    const desc = a.description?.standard || "";
    lines.push(
      `${i + 1}. **${a.name || "N/A"}**`,
      `   ID: ${pl.id} | Musicas: ${a.trackCount ?? "N/A"} | ${a.isPublic ? "Publica" : "Privada"}`,
      desc ? `   Descricao: ${desc}` : "",
      ""
    );
  });

  return lines.join("\n");
}

export async function getPlaylistTracks(playlistId: string, limit: number = 50): Promise<string> {
  const response = await fetchApi<{ data: any[]; meta?: { total: number } }>(
    `/me/library/playlists/${playlistId}/tracks?limit=${Math.min(limit, 100)}`,
    { useUserToken: true }
  );

  if (!response.data?.length) {
    return "Playlist vazia ou nao encontrada.";
  }

  const lines = [
    `# Musicas da Playlist`,
    `Total: ${response.meta?.total || response.data.length}\n`,
  ];

  response.data.forEach((track, i) => {
    const a = track.attributes || {};
    const dur = Math.round((a.durationInMillis || 0) / 1000);
    const mins = Math.floor(dur / 60);
    const secs = (dur % 60).toString().padStart(2, "0");
    lines.push(
      `${i + 1}. **${a.name || "N/A"}** - ${a.artistName || "N/A"}`,
      `   Album: ${a.albumName || "N/A"} | Duracao: ${mins}:${secs}`,
      `   Track ID: ${track.id}`,
      ""
    );
  });

  return lines.join("\n");
}

// ============================================================
// Busca no Catalogo
// ============================================================

export async function searchMusic(
  query: string,
  types: string[] = ["songs"],
  limit: number = 10
): Promise<string> {
  const storefront = getStorefrontId();
  const typeParam = types.join(",");
  const q = encodeURIComponent(query);

  const response = await fetchApi<any>(
    `/catalog/${storefront}/search?term=${q}&types=${typeParam}&limit=${limit}`,
    {}
  );

  const results = response.results || {};
  const lines = [`# Resultados: "${query}"\n`];

  for (const type of types) {
    const typeResults = results[type];
    if (!typeResults?.data?.length) continue;

    const label =
      type === "songs" ? "Musicas" :
      type === "artists" ? "Artistas" :
      type === "albums" ? "Albuns" : type;

    lines.push(`## ${label}`);
    lines.push(`Encontrados: ${typeResults.meta?.total?.hits ?? typeResults.data.length}\n`);

    typeResults.data.slice(0, limit).forEach((item: any, i: number) => {
      const a = item.attributes || {};
      if (type === "songs") {
        const dur = Math.round((a.durationInMillis || 0) / 1000);
        lines.push(
          `${i + 1}. **${a.name}** - ${a.artistName}`,
          `   Album: ${a.albumName} | ${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, "0")}`,
          `   Track ID: ${item.id}`,
          ""
        );
      } else if (type === "artists") {
        lines.push(
          `${i + 1}. **${a.name}**`,
          `   Generos: ${(a.genreNames || []).join(", ") || "N/A"}`,
          `   Artist ID: ${item.id}`,
          ""
        );
      } else if (type === "albums") {
        lines.push(
          `${i + 1}. **${a.name}** - ${a.artistName}`,
          `   Musicas: ${a.trackCount ?? "N/A"} | ${a.releaseDate || "N/A"}`,
          `   Album ID: ${item.id}`,
          ""
        );
      }
    });
  }

  return lines.length <= 2
    ? `Nenhum resultado para "${query}". Tente outros termos.`
    : lines.join("\n");
}

// ============================================================
// Detalhes de Musica
// ============================================================

export async function getTrackDetails(trackId: string): Promise<string> {
  const storefront = getStorefrontId();
  const response = await fetchApi<{ data: any[] }>(
    `/catalog/${storefront}/songs/${trackId}`,
    {}
  );

  if (!response.data?.length) {
    return `Musica "${trackId}" nao encontrada.`;
  }

  const a = response.data[0].attributes || {};
  const dur = Math.round((a.durationInMillis || 0) / 1000);
  return [
    `# ${a.name}`,
    `**Artista:** ${a.artistName || "N/A"}`,
    `**Album:** ${a.albumName || "N/A"}`,
    `**Generos:** ${(a.genreNames || []).join(", ") || "N/A"}`,
    `**Duracao:** ${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, "0")}`,
    `**Lancamento:** ${a.releaseDate || "N/A"}`,
    `**Track ID:** ${response.data[0].id}`,
  ].join("\n");
}

// ============================================================
// Criar Playlist
// ============================================================

export async function createPlaylist(
  name: string,
  description: string | undefined,
  trackIds: string[]
): Promise<string> {
  const storefront = getStorefrontId();

  const response = await fetchApi<{ data: any[] }>(
    `/me/library/playlists`,
    {
      method: "POST",
      useUserToken: true,
      body: {
        attributes: {
          name,
          description: description || "Playlist criada via Claude Code + Apple Music MCP",
        },
        relationships: {
          tracks: {
            data: trackIds.map((id) => ({
              id,
              type: "songs",
              href: `/v1/catalog/${storefront}/songs/${id}`,
            })),
          },
        },
      },
    }
  );

  if (!response.data?.length) {
    throw new Error("Nao foi possivel criar a playlist. Verifique se os Track IDs sao validos.");
  }

  const a = response.data[0].attributes || {};
  return [
    `# Playlist Criada!`,
    ``,
    `**Nome:** ${a.name}`,
    `**Descricao:** ${a.description?.standard || "N/A"}`,
    `**Musicas adicionadas:** ${trackIds.length}`,
    ``,
    `A playlist ja deve aparecer no seu Apple Music (iPhone, Windows, etc).`,
    `Algumas musicas podem nao estar disponiveis no seu catalogo regional.`,
  ].join("\n");
}

// ============================================================
// Funcoes auxiliares para o motor de recomendacoes
// ============================================================

export async function catalogSearch(query: string, limit: number = 20): Promise<any[]> {
  try {
    const storefront = getStorefrontId();
    const response = await fetchApi<{ data: any[] }>(
      `/catalog/${storefront}/search?term=${encodeURIComponent(query)}&types=songs&limit=${limit}`,
      {}
    );
    return response.data || [];
  } catch {
    return [];
  }
}

export async function searchByGenre(genre: string, limit: number = 10): Promise<any[]> {
  try {
    const storefront = getStorefrontId();
    const response = await fetchApi<{ data: any[] }>(
      `/catalog/${storefront}/search?term=${encodeURIComponent(genre)}&types=songs&limit=${limit}`,
      {}
    );
    return response.data || [];
  } catch {
    return [];
  }
}

/**
 * Wrapper para erros de token - transforma TokenExpiredError em mensagem amigavel
 */
export function wrapApiErrors(fn: () => Promise<string>): Promise<string> {
  return fn().catch((error) => {
    if (error instanceof TokenExpiredError) {
      return (
        error.message +
        "\n\n" +
        "Para fazer login:\n" +
        "  node dist/login.js\n" +
        "Ou use a ferramenta 'apple_music_login' no Claude Code."
      );
    }
    throw error;
  });
}
