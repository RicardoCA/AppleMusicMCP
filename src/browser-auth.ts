/**
 * Browser Auth - Captura de Tokens via Playwright
 * 
 * ABRE o music.apple.com no Chromium real.
 * O usuario faz login com a Apple ID normalmente.
 * Interceptamos as requisicoes de rede para capturar:
 *   1. Developer Token (JWT) - usado pelo frontend da Apple
 *   2. Music User Token - gerado apos login do usuario
 *   3. Storefront ID - regiao da conta (ex: br, us)
 * 
 * RESULTADO: tokens.json salvo na raiz do projeto.
 * VALIDADE: ~30 dias (o mesmo prazo dos tokens da Apple).
 * 
 * NAO precisa de Apple Developer account, certificado, .p8, nada.
 */

import { chromium, type Request } from "playwright";
import { saveTokens, getTokenFilePath, SESSION_FILE, type StoredTokens } from "./token-store.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");

let capturedDeveloperToken: string | null = null;
let capturedUserToken: string | null = null;
let capturedStorefrontId: string | null = null;

/**
 * Inicia o fluxo de login no navegador
 * Retorna true se os tokens foram capturados com sucesso
 */
export async function browserLogin(): Promise<boolean> {
  console.error("");
  console.error("========================================");
  console.error("  Apple Music - Login via Navegador");
  console.error("========================================");
  console.error("");
  console.error("1. Vai abrir o navegador com o Apple Music");
  console.error("2. Faca login com sua Apple ID normalmente");
  console.error("3. Reproduza QUALQUER musica (mesmo que por 1 segundo)");
  console.error("4. Os tokens serao capturados automaticamente");
  console.error("5. Feche o navegador quando aparecer a mensagem de sucesso");
  console.error("");

  // Verificar se os browsers do Playwright estao instalados
  try {
    const browserExecutable = chromium.executablePath();
    console.error(`[browser] Chromium: ${browserExecutable}`);
  } catch {
    console.error("[browser] Instalando browsers do Playwright (so na primeira vez)...");
    console.error("[browser] Execute: npx playwright install chromium");
    console.error("[browser] Ou: npm run setup");
    return false;
  }

  const browser = await chromium.launch({
    headless: false, // Precisa mostrar o navegador para o usuario fazer login
    args: ["--no-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // Interceptor de requisicoes para capturar tokens
    await page.route("**/*", async (route) => {
      const request = route.request();
      const headers = request.headers();

      // Capturar Developer Token do header Authorization
      const authHeader = headers["authorization"] || headers["Authorization"];
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        if (token.length > 100 && !capturedDeveloperToken) {
          capturedDeveloperToken = token;
          console.error("[capture] Developer Token capturado!");
        }
      }

      // Capturar Music User Token do header Music-User-Token
      const musicUserToken =
        headers["music-user-token"] ||
        headers["Music-User-Token"];
      if (musicUserToken && musicUserToken.length > 20) {
        capturedUserToken = musicUserToken;
        console.error("[capture] Music User Token capturado!");
      }

      // Capturar Storefront ID da URL
      const url = request.url();
      const storefrontMatch = url.match(/\/v1\/([a-z]{2})\//);
      if (storefrontMatch && !capturedStorefrontId) {
        capturedStorefrontId = storefrontMatch[1];
        console.error(`[capture] Storefront ID: ${capturedStorefrontId}`);
      }

      await route.continue();
    });

    // Navegar para o Apple Music
    console.error("[browser] Abrindo music.apple.com...");
    await page.goto("https://music.apple.com/", { waitUntil: "domcontentloaded" });
    console.error("[browser] Pagina carregada. Faca login e reproduza uma musica.");

    // Aguardar captura dos tokens com timeout de 5 minutos
    console.error("[capture] Aguardando captura dos tokens...");
    console.error("[capture] Dica: Faca login e reproduza QUALQUER musica.\n");

    try {
      await page.waitForFunction(
        () => {
          // Esta funcao roda no contexto do navegador
          return (
            (window as any).__mcpDeveloperToken !== undefined &&
            (window as any).__mcpUserToken !== undefined
          );
        },
        { timeout: 300000 } // 5 minutos
      );
    } catch {
      // Timeout - verificar se capturamos pelo menos algo via route
    }

    // Verificar captura periodica
    for (let i = 0; i < 30; i++) {
      if (capturedDeveloperToken && capturedUserToken) {
        break;
      }

      // Tentar extrair do MusicKit JS no navegador
      try {
        const devToken = await page.evaluate(() => {
          const mk = (window as any).MusicKit;
          if (mk && mk.getInstance) {
            const instance = mk.getInstance();
            if (instance && instance.developerToken) {
              return instance.developerToken;
            }
          }
          return null;
        });
        if (devToken && !capturedDeveloperToken) {
          capturedDeveloperToken = devToken;
          console.error("[capture] Developer Token extraido do MusicKit JS!");
        }

        const userToken = await page.evaluate(() => {
          const mk = (window as any).MusicKit;
          if (mk && mk.getInstance) {
            const instance = mk.getInstance();
            if (instance && instance.musicUserToken) {
              return instance.musicUserToken;
            }
          }
          return null;
        });
        if (userToken && !capturedUserToken) {
          capturedUserToken = userToken;
          console.error("[capture] Music User Token extraido do MusicKit JS!");
        }

        const storefront = await page.evaluate(() => {
          const mk = (window as any).MusicKit;
          if (mk && mk.getInstance) {
            const instance = mk.getInstance();
            if (instance && instance.storefrontId) {
              return instance.storefrontId;
            }
          }
          return null;
        });
        if (storefront && !capturedStorefrontId) {
          capturedStorefrontId = storefront;
          console.error(`[capture] Storefront ID do MusicKit: ${storefront}`);
        }
      } catch {
        // MusicKit pode nao estar disponivel
      }

      if (capturedDeveloperToken && capturedUserToken) break;

      await page.waitForTimeout(1000);
    }

    // Verificar resultado
    if (capturedDeveloperToken && capturedUserToken && capturedStorefrontId) {
      // Salvar o storage state completo (cookies + localStorage) para uso futuro
      try {
        const storageState = await context.storageState();
        writeFileSync(SESSION_FILE, JSON.stringify(storageState, null, 2), "utf-8");
        console.error(`[capture] Session state salvo em ${SESSION_FILE}`);
      } catch {
        console.error("[capture] Nao foi possivel salvar session state.");
      }

      // Capturar cookies do contexto como fallback (header Cookie)
      let cookieHeader = "";
      try {
        const allCookies = await context.cookies();
        const appleCookies = allCookies.filter(
          (c) => c.domain.includes("apple.com") || c.domain.includes("mzstatic.com")
        );
        cookieHeader = appleCookies.map((c) => `${c.name}=${c.value}`).join("; ");
        if (appleCookies.length > 0) {
          console.error(`[capture] ${appleCookies.length} cookies da Apple capturados!`);
        }
      } catch {
        console.error("[capture] Nao foi possivel capturar cookies (ignorando).");
      }

      const tokens: StoredTokens = {
        developerToken: capturedDeveloperToken,
        userToken: capturedUserToken,
        storefrontId: capturedStorefrontId,
        capturedAt: Date.now(),
        expiresAt: Date.now() + 25 * 24 * 60 * 60 * 1000, // 25 dias de seguranca
        cookies: cookieHeader || undefined,
      };

      saveTokens(tokens);

      console.error("");
      console.error("========================================");
      console.error("  SUCESSO! Tokens capturados!");
      console.error("========================================");
      console.error("");
      console.error(`Arquivo: ${getTokenFilePath()}`);
      console.error(`Valido por: ~25 dias`);
      console.error("");
      console.error("Voce ja pode fechar o navegador.");
      console.error("Reinicie o Claude Code para usar o MCP.");
      console.error("");

      // Mostrar mensagem de sucesso no navegador
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#fff;font-family:-apple-system,sans-serif;">
          <div style="text-align:center;padding:40px;">
            <h1 style="color:#fa233b;">Login Concluido!</h1>
            <p>Os tokens foram capturados com sucesso.</p>
            <p>Você pode fechar esta janela.</p>
            <p style="color:#888;margin-top:20px;">Reinicie o Claude Code para usar o MCP.</p>
          </div>
        </body>
        </html>
      `);

      await page.waitForTimeout(5000);
      return true;
    } else {
      console.error("");
      console.error("========================================");
      console.error("  ATENCAO: Captura incompleta");
      console.error("========================================");
      console.error("");
      if (!capturedDeveloperToken) {
        console.error("[!] Developer Token NAO capturado");
      } else {
        console.error("[ok] Developer Token capturado");
      }
      if (!capturedUserToken) {
        console.error("[!] User Token NAO capturado - voce fez login?");
      } else {
        console.error("[ok] User Token capturado");
      }
      if (!capturedStorefrontId) {
        console.error("[!] Storefront ID NAO capturado");
      } else {
        console.error("[ok] Storefront ID capturado");
      }
      console.error("");
      console.error("Dicas:");
      console.error("  1. Faca login com sua Apple ID no site");
      console.error("  2. Reproduza qualquer musica (mesmo 1 segundo)");
      console.error("  3. Execute novamente: node dist/login.js");
      console.error("");
      return false;
    }
  } finally {
    await browser.close();
  }
}

/**
 * Login headless (para Claude Code usar via MCP tool)
 * Tenta capturar tokens sem mostrar navegador - mais limitado
 */
export async function headlessLoginCheck(): Promise<{
  loggedIn: boolean;
  needsLogin: boolean;
  message: string;
}> {
  const { existsSync } = await import("fs");
  const { getTokenFilePath, SESSION_FILE, loadTokens } = await import("./token-store.js");

  if (!existsSync(getTokenFilePath()) || !existsSync(SESSION_FILE)) {
    return {
      loggedIn: false,
      needsLogin: true,
      message:
        "Sessao nao encontrada. Execute o login:\n\n" +
        "  node dist/login.js\n\n" +
        "Isso vai abrir o navegador para voce fazer login com sua Apple ID " +
        "e reproduzir uma musica. Os tokens e a sessao serao capturados automaticamente.",
    };
  }

  const tokens = loadTokens();
  if (!tokens) {
    return {
      loggedIn: false,
      needsLogin: true,
      message:
        "Tokens expirados. Execute o login novamente:\n\n" +
        "  node dist/login.js\n\n" +
        "Os tokens duram ~25 dias.",
    };
  }

  const daysLeft = Math.floor(
    (tokens.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)
  );

  return {
    loggedIn: true,
    needsLogin: false,
    message:
      `Logado e pronto! Tokens validos por mais ${daysLeft} dias.\n\n` +
      `Storefront: ${tokens.storefrontId}\n` +
      `Capturados em: ${new Date(tokens.capturedAt).toLocaleString()}`,
  };
}
