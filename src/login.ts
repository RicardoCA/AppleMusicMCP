/**
 * Login Script - Ponto de entrada para o usuario
 * 
 * Uso: node dist/login.js
 * 
 * Abre o Chromium real, o usuario faz login no Apple Music
 * e os tokens sao capturados automaticamente.
 */

import { browserLogin } from "./browser-auth.js";

async function main() {
  const success = await browserLogin();
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  console.error("Erro fatal no login:", error);
  console.error("");
  console.error("Se o Playwright nao estiver instalado, execute:");
  console.error("  npx playwright install chromium");
  process.exit(1);
});
