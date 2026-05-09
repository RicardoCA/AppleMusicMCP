/**
 * Motor de Recomendacoes Musicais
 * 
 * Analisa historico e playlists para gerar recomendacoes.
 * Suporta diferentes niveis de diversidade.
 */

import {
  searchByGenre,
  catalogSearch,
} from "./apple-music-client.js";
import {
  getDeveloperToken,
  getUserToken,
} from "./token-store.js";

interface GenreScore {
  genre: string;
  score: number;
  artists: string[];
}

interface ArtistData {
  name: string;
  count: number;
  genres: string[];
}

interface MusicProfile {
  topGenres: GenreScore[];
  topArtists: ArtistData[];
  totalTracks: number;
  diversityIndex: number;
}

// ============================================================
// Busca bruta de dados do usuario (via API direta)
// ============================================================

async function fetchRawData(endpoint: string): Promise<any[]> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getDeveloperToken()}`,
      "Music-User-Token": getUserToken(),
    };
    const res = await fetch(`https://api.music.apple.com/v1${endpoint}`, { headers });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

async function computeProfile(): Promise<MusicProfile> {
  const artistMap = new Map<string, ArtistData>();
  const genreMap = new Map<string, GenreScore>();
  let totalTracks = 0;

  // Historico de reproducao
  const history = await fetchRawData("/me/recent/played?limit=100");
  for (const track of history) {
    const a = track.attributes || {};
    totalTracks++;
    const name = a.artistName || "Desconhecido";

    const existing = artistMap.get(name);
    if (existing) {
      existing.count++;
      if (a.genreNames) existing.genres = [...new Set([...existing.genres, ...a.genreNames])];
    } else {
      artistMap.set(name, { name, count: 1, genres: a.genreNames || [] });
    }

    for (const genre of a.genreNames || []) {
      const g = genreMap.get(genre);
      if (g) {
        g.score++;
        if (!g.artists.includes(name)) g.artists.push(name);
      } else {
        genreMap.set(genre, { genre, score: 1, artists: [name] });
      }
    }
  }

  // Playlists (peso menor)
  const playlists = await fetchRawData("/me/library/playlists?limit=10");
  for (const pl of playlists.slice(0, 10)) {
    try {
      const tracks = await fetchRawData(
        `/me/library/playlists/${pl.id}/tracks?limit=20`
      );
      for (const track of tracks) {
        const a = track.attributes || {};
        const name = a.artistName || "Desconhecido";
        const existing = artistMap.get(name);
        if (existing) existing.count += 0.5;
        else artistMap.set(name, { name, count: 0.5, genres: a.genreNames || [] });

        for (const genre of a.genreNames || []) {
          const g = genreMap.get(genre);
          if (g) g.score += 0.5;
          else genreMap.set(genre, { genre, score: 0.5, artists: [name] });
        }
      }
    } catch { /* pular */ }
  }

  const topGenres = Array.from(genreMap.values()).sort((a, b) => b.score - a.score).slice(0, 15);
  const topArtists = Array.from(artistMap.values()).sort((a, b) => b.count - a.count).slice(0, 20);

  const totalScore = topGenres.reduce((s, g) => s + g.score, 0);
  let diversityIndex = 0;
  if (totalScore > 0) {
    const props = topGenres.map((g) => g.score / totalScore);
    diversityIndex = Math.round((1 - props.reduce((s, p) => s + p * p, 0)) * 100);
  }

  return { topGenres, topArtists, totalTracks, diversityIndex };
}

// ============================================================
// Barra visual
// ============================================================

function bar(value: number, max: number, len: number = 20): string {
  const filled = Math.round((value / max) * len);
  return "[" + "█".repeat(filled) + "░".repeat(len - filled) + "]";
}

// ============================================================
// API Publica
// ============================================================

export async function buildMusicProfile(): Promise<string> {
  const profile = await computeProfile();

  const lines = [`# Seu Perfil Musical\n`, `## Generos Favoritos`];
  const maxG = profile.topGenres[0]?.score || 1;

  profile.topGenres.forEach((g, i) => {
    lines.push(
      `${i + 1}. **${g.genre}** ${bar(g.score, maxG)} (${g.score})`,
      `   Artistas: ${g.artists.slice(0, 5).join(", ")}`,
      ""
    );
  });

  lines.push(`\n## Artistas Mais Ouvidos\n`);
  const maxA = profile.topArtists[0]?.count || 1;
  profile.topArtists.forEach((a, i) => {
    lines.push(`${i + 1}. **${a.name}** ${bar(a.count, maxA)} (${Math.round(a.count)})`);
  });

  const divLabel =
    profile.diversityIndex > 70 ? "Muito diverso" :
    profile.diversityIndex > 40 ? "Moderadamente diverso" : "Focado em poucos generos";

  lines.push(`\n## Estatisticas`);
  lines.push(`- Musicas analisadas: ${profile.totalTracks}`);
  lines.push(`- Generos descobertos: ${profile.topGenres.length}`);
  lines.push(`- Artistas unicos: ${profile.topArtists.length}`);
  lines.push(`- Indice de diversidade: ${profile.diversityIndex}/100 (${divLabel})`);

  return lines.join("\n");
}

export async function getTopArtists(limit: number = 20): Promise<string> {
  const profile = await computeProfile();
  const maxA = profile.topArtists[0]?.count || 1;

  const lines = [`# Seus Artistas Mais Ouvidos\n`];
  profile.topArtists.slice(0, limit).forEach((a, i) => {
    lines.push(`${i + 1}. **${a.name}** ${bar(a.count, maxA)} (${Math.round(a.count)})`);
  });
  return lines.join("\n");
}

export async function getRecommendations(
  source: "history" | "playlists" | "both",
  count: number,
  diversity: "low" | "medium" | "high"
): Promise<string> {
  const profile = await computeProfile();

  if (!profile.topGenres.length && !profile.topArtists.length) {
    return "Dados insuficientes. Ouca mais musicas no Apple Music para gerar recomendacoes.";
  }

  const lines = [
    `# Recomendacoes Para Voce`,
    `Fonte: ${source === "history" ? "historico" : source === "playlists" ? "playlists" : "historico + playlists"}`,
    `Diversidade: ${diversity === "low" ? "Baixa" : diversity === "medium" ? "Media" : "Alta"}`,
    ``,
  ];

  // Calcular pesos por genero
  const weights: Record<string, number> = {};
  const genres =
    diversity === "low" ? profile.topGenres.slice(0, 3) :
    diversity === "medium" ? profile.topGenres.slice(0, 6) :
    profile.topGenres;

  genres.forEach((g, i) => {
    weights[g.genre] = 1 - i * (diversity === "high" ? 0.05 : diversity === "medium" ? 0.1 : 0.2);
  });

  // Expandir generos para alta diversidade
  if (diversity === "high") {
    const expansions: Record<string, string[]> = {
      Pop: ["Synth-pop", "Electropop", "Indie Pop"],
      Rock: ["Alternative Rock", "Indie Rock", "Classic Rock"],
      "Hip-Hop": ["Rap", "Trap", "R&B"],
      Electronic: ["House", "Techno", "Ambient"],
      Jazz: ["Bossa Nova", "Smooth Jazz"],
      MPB: ["Samba", "Bossa Nova", "Tropicalia"],
      "R&B": ["Soul", "Neo-Soul", "Funk"],
      Indie: ["Indie Rock", "Indie Pop", "Indie Folk"],
    };
    for (const [base, exps] of Object.entries(expansions)) {
      if (weights[base]) exps.forEach((e) => { if (!weights[e]) weights[e] = 0.3; });
    }
  }

  const recs: Array<{ name: string; artist: string; reason: string; id: string }> = [];
  const genreEntries = Object.entries(weights).sort(([, a], [, b]) => b - a);
  const perGenre = Math.ceil(count / genreEntries.length);

  for (const [genre, weight] of genreEntries) {
    if (recs.length >= count) break;
    const n = Math.max(1, Math.round(perGenre * weight));
    const tracks = await searchByGenre(genre, n * 2);
    for (const t of tracks) {
      if (recs.length >= count) break;
      if (!recs.find((r) => r.id === t.id)) {
        const a = t.attributes || {};
        recs.push({
          name: a.name || "N/A",
          artist: a.artistName || "N/A",
          reason: `Genero "${genre}" que voce ouve`,
          id: t.id,
        });
      }
    }
  }

  // Complementar com artistas se ainda faltam
  if (recs.length < count) {
    for (const artist of profile.topArtists.slice(0, 5)) {
      if (recs.length >= count) break;
      const tracks = await catalogSearch(artist.name, 5);
      for (const t of tracks) {
        if (recs.length >= count) break;
        if (!recs.find((r) => r.id === t.id)) {
          const a = t.attributes || {};
          recs.push({
            name: a.name || "N/A",
            artist: a.artistName || "N/A",
            reason: `Relacionado a "${artist.name}"`,
            id: t.id,
          });
        }
      }
    }
  }

  if (!recs.length) {
    return "Nao foi possivel gerar recomendacoes. Verifique sua conexao.";
  }

  recs.slice(0, count).forEach((r, i) => {
    lines.push(
      `${i + 1}. **${r.name}** - ${r.artist}`,
      `   Motivo: ${r.reason}`,
      `   Track ID: ${r.id}`,
      ""
    );
  });

  lines.push("---");
  lines.push("Para criar uma playlist, use 'create_playlist' com os Track IDs acima.");

  return lines.join("\n");
}

/**
 * Retorna IDs de faixas recomendadas (para criar playlist automatica)
 */
export async function getRecommendationTrackIds(
  seed: string,
  count: number
): Promise<string[]> {
  const profile = await computeProfile();
  const ids: string[] = [];

  const tracks = await catalogSearch(seed, count * 2);
  for (const t of tracks) {
    if (ids.length >= count) break;
    ids.push(t.id);
  }

  if (ids.length < count && profile.topGenres.length) {
    const remaining = count - ids.length;
    const genreTracks = await searchByGenre(profile.topGenres[0].genre, remaining * 2);
    for (const t of genreTracks) {
      if (ids.length >= count) break;
      if (!ids.includes(t.id)) ids.push(t.id);
    }
  }

  return ids;
}
