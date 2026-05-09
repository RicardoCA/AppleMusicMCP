import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { request as playwrightRequest, chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(__dirname, "tokens.json");
const SESSION_FILE = join(__dirname, "session.json");

console.log("=== Diagnóstico Apple Music API ===\n");
if (!existsSync(TOKEN_FILE)) { console.error("tokens.json não encontrado"); process.exit(1); }
if (!existsSync(SESSION_FILE)) { console.error("session.json não encontrado"); process.exit(1); }

const tokens = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
const now = Date.now();
console.log("tokens.json:");
console.log("  capturedAt:", new Date(tokens.capturedAt).toLocaleString());
console.log("  expiresAt:", new Date(tokens.expiresAt).toLocaleString());
console.log("  expirado?", now > tokens.expiresAt ? "SIM" : "NÃO");
console.log("  storefrontId:", tokens.storefrontId);
console.log();

const session = JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
console.log("session.json:");
console.log("  cookies:", session.cookies?.length ?? 0);
console.log("  origins:", session.origins?.length ?? 0);
console.log();

// Teste 1: com session.json (cookies)
console.log("--- Teste 1: com session.json + tokens ---");
const ctx1 = await playwrightRequest.newContext({
  storageState: SESSION_FILE,
  extraHTTPHeaders: {
    Authorization: `Bearer ${tokens.developerToken}`,
    Origin: "https://music.apple.com",
    Referer: "https://music.apple.com/",
    "Music-User-Token": tokens.userToken,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  },
});
try {
  const r1 = await ctx1.fetch("https://api.music.apple.com/v1/me/library/playlists?limit=5");
  console.log("Status:", r1.status(), r1.statusText());
  const b1 = await r1.text();
  console.log("Resposta:", b1.slice(0, 500) || "(vazio)");
} catch (err) { console.error("Erro:", err.message); }
finally { await ctx1.dispose(); }

console.log();

// Teste 2: sem session.json (só tokens, usando fetch nativo)
console.log("--- Teste 2: só tokens (sem cookies de sessão) ---");
try {
  const r2 = await fetch("https://api.music.apple.com/v1/me/library/playlists?limit=5", {
    headers: {
      Authorization: `Bearer ${tokens.developerToken}`,
      Origin: "https://music.apple.com",
      Referer: "https://music.apple.com/",
      "Music-User-Token": tokens.userToken,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  });
  console.log("Status:", r2.status, r2.statusText);
  const b2 = await r2.text();
  console.log("Resposta:", b2.slice(0, 500) || "(vazio)");
} catch (err) { console.error("Erro:", err.message); }

console.log();

// Teste 3: só developer token (sem user token)
console.log("--- Teste 3: endpoint público (sem user token) ---");
try {
  const r3 = await fetch(`https://api.music.apple.com/v1/catalog/br/charts?types=songs&limit=3`, {
    headers: {
      Authorization: `Bearer ${tokens.developerToken}`,
      Origin: "https://music.apple.com",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  });
  console.log("Status:", r3.status, r3.statusText);
  const b3 = await r3.text();
  console.log("Resposta:", b3.slice(0, 300) || "(vazio)");
} catch (err) { console.error("Erro:", err.message); }

console.log();

// Teste 4: buscar developer token atual via Playwright browser (headless)
console.log("--- Teste 4: buscando developer token atual via browser headless ---");
let freshDevToken = null;
const browser = await chromium.launch({ headless: true });
try {
  const ctx4 = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });
  const page = await ctx4.newPage();

  // Interceptar requests para capturar o developer token
  await page.route("**/*", async (route) => {
    const authHeader = route.request().headers()["authorization"] || "";
    if (authHeader.startsWith("Bearer ") && authHeader.length > 150 && !freshDevToken) {
      freshDevToken = authHeader.replace("Bearer ", "");
      console.log("  Developer token interceptado da página!");
    }
    await route.continue();
  });

  await page.goto("https://music.apple.com/br/browse", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Tentar extrair via MusicKit JS
  if (!freshDevToken) {
    freshDevToken = await page.evaluate(() => {
      try { return window.MusicKit?.getInstance?.()?.developerToken || null; } catch { return null; }
    });
    if (freshDevToken) console.log("  Developer token extraído do MusicKit JS!");
  }

  if (freshDevToken) {
    const isSame = freshDevToken === tokens.developerToken;
    console.log("  Igual ao salvo?", isSame ? "SIM (token já era o mais recente)" : "NÃO (token estava desatualizado!)");
    console.log("  IAT salvo (iat no JWT):", tokens.developerToken.split(".")[1] ? JSON.parse(Buffer.from(tokens.developerToken.split(".")[1], "base64url").toString()).iat : "N/A");

    if (!isSame) {
      console.log("\n--- Teste 4b: testando token ATUAL da página ---");
      const r4 = await fetch(`https://api.music.apple.com/v1/catalog/br/charts?types=songs&limit=1`, {
        headers: {
          Authorization: `Bearer ${freshDevToken}`,
          Origin: "https://music.apple.com",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        },
      });
      console.log("  Status:", r4.status, r4.statusText);
      const b4 = await r4.text();
      console.log("  Resposta:", b4.slice(0, 200) || "(vazio)");

      if (r4.status === 200) {
        console.log("\n  SOLUÇÃO: atualizando tokens.json com o token mais recente...");
        tokens.developerToken = freshDevToken;
        tokens.capturedAt = Date.now();
        tokens.expiresAt = Date.now() + 25 * 24 * 60 * 60 * 1000;
        import("fs").then(({ writeFileSync }) => {
          writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf-8");
          console.log("  tokens.json atualizado! Reinicie o Claude Code.");
        });
      }
    } else {
      console.log("  Token já era o mais recente — o problema não é o developer token.");
    }
  } else {
    console.log("  Não foi possível capturar o developer token do browser.");
  }
} finally {
  await browser.close();
}
