/**
 * Token Manager
 * 
 * Gerencia os tokens capturados do music.apple.com via Playwright.
 * Grava/le de um arquivo JSON local.
 * 
 * NAO precisa de Apple Developer account, certificado .p8 ou nada disso.
 * Os tokens sao capturados automaticamente do navegador.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");
const TOKEN_FILE = join(ROOT_DIR, "tokens.json");
export const SESSION_FILE = join(ROOT_DIR, "session.json");

export interface StoredTokens {
  developerToken: string;
  userToken: string;
  storefrontId: string;
  capturedAt: number;
  expiresAt: number;
  cookies?: string; // Cookie header string para autenticação na API
}

/**
 * Retorna o caminho do arquivo de tokens (para uso externo)
 */
export function getTokenFilePath(): string {
  return TOKEN_FILE;
}

/**
 * Carrega os tokens do arquivo JSON
 */
export function loadTokens(): StoredTokens | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    const raw = readFileSync(TOKEN_FILE, "utf-8");
    const tokens: StoredTokens = JSON.parse(raw);

    // Verificar se expirou (tokens duram ~30 dias)
    if (Date.now() > tokens.expiresAt) {
      console.error("[token-store] Tokens expirados, sera necessario fazer login novamente.");
      return null;
    }

    return tokens;
  } catch (error) {
    console.error("[token-store] Erro ao carregar tokens:", error);
    return null;
  }
}

/**
 * Salva os tokens no arquivo JSON
 */
export function saveTokens(tokens: StoredTokens): void {
  try {
    writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf-8");
    console.error("[token-store] Tokens salvos com sucesso.");
  } catch (error) {
    console.error("[token-store] Erro ao salvar tokens:", error);
    throw new Error("Nao foi possivel salvar os tokens. Verifique as permissoes da pasta.");
  }
}

/**
 * Retorna o Developer Token ou lanca erro
 */
export function getDeveloperToken(): string {
  const tokens = loadTokens();
  if (!tokens) {
    throw new TokenExpiredError();
  }
  return tokens.developerToken;
}

/**
 * Retorna o Music User Token ou lanca erro
 */
export function getUserToken(): string {
  const tokens = loadTokens();
  if (!tokens) {
    throw new TokenExpiredError();
  }
  return tokens.userToken;
}

/**
 * Retorna o Storefront ID ou lanca erro
 */
export function getStorefrontId(): string {
  const tokens = loadTokens();
  if (!tokens) {
    throw new TokenExpiredError();
  }
  return tokens.storefrontId;
}

/**
 * Verifica se ha tokens validos salvos
 */
export function hasValidTokens(): boolean {
  return loadTokens() !== null;
}

/**
 * Erro customizado para tokens expirados/ausentes
 */
export class TokenExpiredError extends Error {
  constructor() {
    super(
      "Tokens expirados ou ausentes. Execute o login novamente:\n" +
      "  node dist/login.js\n" +
      "Ou no Claude Code, use a ferramenta 'apple_music_login'."
    );
    this.name = "TokenExpiredError";
  }
}
