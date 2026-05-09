/**
 * Script de Autenticacao - Obtem o Music User Token
 * 
 * Este script abre o navegador para o usuario autorizar o acesso
 * ao Apple Music e captura o Music User Token automaticamente.
 * 
 * Note: A Apple nao oferece um OAuth flow direto para apps CLI.
 * Este script usa MusicKit JS via browser para obter o token.
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { exec } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

function green(text) { return `\x1b[32m${text}\x1b[0m`; }
function yellow(text) { return `\x1b[33m${text}\x1b[0m`; }
function blue(text) { return `\x1b[36m${text}\x1b[0m`; }
function red(text) { return `\x1b[31m${text}\x1b[0m`; }

async function main() {
  console.log(`
${blue("╔══════════════════════════════════════════════════════╗")}
${blue("║      Apple Music - Obter Music User Token           ║")}
${blue("╚══════════════════════════════════════════════════════╝")}
`);

  // Verificar se .env existe
  if (!existsSync(join(rootDir, ".env"))) {
    console.log(`${yellow("!")} Arquivo .env nao encontrado. Execute primeiro: node scripts/setup.js`);
    process.exit(1);
  }

  // Carregar .env
  const envContent = readFileSync(join(rootDir, ".env"), "utf-8");
  const env: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=");
    if (key && value) {
      env[key.trim()] = value.trim().replace(/^["']|["']$/g, "");
    }
  }

  if (!env.APPLE_TEAM_ID || !env.APPLE_KEY_ID) {
    console.log(`${red("✗")} Credenciais da Apple nao configuradas. Execute: node scripts/setup.js`);
    process.exit(1);
  }

  console.log(`
${blue("Metodo 1: Captura via Rede do Navegador (Recomendado)")}

Vamos abrir o Apple Music no navegador. Voce precisara:
1. Fazer login com sua Apple ID
2. Reproduzir qualquer musica
3. Copiar o Music User Token que sera exibido

${yellow("⚠ Este token expira. Voce precisara repetir quando ele expirar.")}
`);

  // Criar um servidor HTTP local que serve uma pagina com MusicKit
  const server = createServer((req, res) => {
    if (req.method === "GET") {
      const html = `<!DOCTYPE html>
<html>
<head>
  <title>Apple Music MCP - Auth</title>
  <script src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
    }
    h1 { color: #fa233b; }
    h2 { color: #fff; }
    .token-box {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 8px;
      padding: 15px;
      margin: 15px 0;
      word-break: break-all;
      font-family: monospace;
      font-size: 11px;
      color: #e94560;
    }
    button {
      background: #fa233b;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      margin: 5px;
    }
    button:hover { background: #e91e63; }
    .success { color: #4caf50; font-weight: bold; }
    .error { color: #f44336; }
    .info { color: #64b5f6; }
    .instructions {
      background: #16213e;
      border-radius: 8px;
      padding: 15px;
      margin: 15px 0;
    }
    .instructions ol { padding-left: 20px; }
    .instructions li { margin: 8px 0; }
  </style>
</head>
<body>
  <h1>Apple Music MCP - Auth</h1>

  <div id="status" class="info">
    Inicializando MusicKit...
  </div>

  <div class="instructions">
    <h2>Como obter o Music User Token:</h2>
    <ol>
      <li>Clique em <strong>"Fazer Login"</strong> para conectar com sua Apple ID</li>
      <li>Autorize o acesso ao Apple Music</li>
      <li>Apos o login, o token aparecera abaixo</li>
      <li>Clique em <strong>"Copiar Token"</strong></li>
      <li>Cole no terminal e pressione ENTER</li>
    </ol>
  </div>

  <div>
    <button id="loginBtn" onclick="login()">Fazer Login com Apple ID</button>
    <button id="copyBtn" onclick="copyToken()" style="display:none;">Copiar Token</button>
  </div>

  <div id="tokenContainer" style="display:none;">
    <h2>Music User Token:</h2>
    <div class="token-box" id="tokenBox"></div>
  </div>

  <script>
    const devToken = "${generateDeveloperToken(env)}";

    document.addEventListener('musickitloaded', async function() {
      try {
        await MusicKit.configure({
          developerToken: devToken,
          app: {
            name: 'Apple Music MCP',
            build: '1.0.0',
          }
        });
        document.getElementById('status').innerHTML =
          '<span class="success">MusicKit inicializado com sucesso!</span> Clique em "Fazer Login".';
        document.getElementById('status').className = 'success';
      } catch (e) {
        document.getElementById('status').innerHTML =
          '<span class="error">Erro ao inicializar MusicKit: ' + e.message + '</span>';
        document.getElementById('status').className = 'error';
      }
    });

    async function login() {
      document.getElementById('status').innerHTML = '<span class="info">Aguardando autorizacao...</span>';
      try {
        const token = await MusicKit.getInstance().authorize();
        document.getElementById('tokenBox').textContent = token;
        document.getElementById('tokenContainer').style.display = 'block';
        document.getElementById('copyBtn').style.display = 'inline-block';
        document.getElementById('status').innerHTML =
          '<span class="success">Autorizado! Copie o token e cole no terminal.</span>';
        document.getElementById('status').className = 'success';
      } catch (e) {
        document.getElementById('status').innerHTML =
          '<span class="error">Erro na autorizacao: ' + e.message + '</span>';
        document.getElementById('status').className = 'error';
      }
    }

    function copyToken() {
      const token = document.getElementById('tokenBox').textContent;
      navigator.clipboard.writeText(token).then(() => {
        alert('Token copiado! Cole no terminal.');
      });
    }
  </script>
</body>
</html>`;

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    }
  });

  const PORT = 18743;
  server.listen(PORT, async () => {
    console.log(`${green("✓")} Servidor de autenticacao iniciado na porta ${PORT}`);
    console.log(`\n${blue("Abra no navegador:")} ${yellow(`http://localhost:${PORT}`)}`);
    console.log(`\nApos copiar o token, cole-o abaixo.\n`);

    // Tentar abrir o navegador automaticamente
    const url = `http://localhost:${PORT}`;
    const platform = process.platform;
    let openCmd: string;
    if (platform === "win32") {
      openCmd = `start ${url}`;
    } else if (platform === "darwin") {
      openCmd = `open ${url}`;
    } else {
      openCmd = `xdg-open ${url}`;
    }

    try {
      exec(openCmd);
      console.log(`${green("✓")} Navegador aberto automaticamente\n`);
    } catch {
      console.log(`${yellow("!")} Nao foi possivel abrir o navegador. Abra manualmente: ${url}\n`);
    }

    const { createInterface } = await import("readline");
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("Cole o Music User Token aqui (ou pressione ENTER para cancelar): ", (token) => {
      rl.close();
      server.close();

      if (!token.trim()) {
        console.log(`\n${yellow("Cancelado.")}`);
        console.log(`\n${blue("Metodo alternativo - Captura manual:")}`);
        console.log(`
1. Abra https://music.apple.com no navegador
2. Faca login e reproduza uma musica
3. Pressione F12 (DevTools) > aba Network
4. Procure uma requisicao para "api.music.apple.com"
5. Clique nela > Headers > procure "Music-User-Token"
6. Copie o valor e cole no arquivo .env manualmente:
   APPLE_MUSIC_USER_TOKEN=seu_token_aqui
`);
        return;
      }

      // Salvar no .env
      let envFile = readFileSync(join(rootDir, ".env"), "utf-8");
      const tokenRegex = /APPLE_MUSIC_USER_TOKEN=.*/;
      if (tokenRegex.test(envFile)) {
        envFile = envFile.replace(tokenRegex, `APPLE_MUSIC_USER_TOKEN=${token.trim()}`);
      } else {
        envFile += `\nAPPLE_MUSIC_USER_TOKEN=${token.trim()}`;
      }
      writeFileSync(join(rootDir, ".env"), envFile);

      console.log(`\n${green("✓")} Music User Token salvo no .env com sucesso!`);
      console.log(`\n${green("Pronto!")} Agora voce pode usar o Apple Music MCP no Claude Code.`);
      console.log(`Reinicie o Claude Code para que as mudancas facam efeito.`);
    });
  });
}

function generateDeveloperToken(env: Record<string, string>): string {
  // Gera um token de desenvolvimento inline para o script de auth
  // Este token e usado apenas pela pagina web local para inicializar o MusicKit
  try {
    // Para o script de auth, o token precisa ser gerado server-side
    // Vamos usar uma abordagem simplificada aqui
    const jwt = require("jsonwebtoken") as any;
    const fs = require("fs") as any;

    const teamId = env.APPLE_TEAM_ID;
    const keyId = env.APPLE_KEY_ID;
    const keyPath = env.APPLE_PRIVATE_KEY_PATH;
    let privateKey = env.APPLE_PRIVATE_KEY || "";

    if (!privateKey && keyPath) {
      try {
        privateKey = fs.readFileSync(
          keyPath.replace("./", join(rootDir, "") + "/"),
          "utf-8"
        );
      } catch {
        try {
          privateKey = fs.readFileSync(
            join(rootDir, keyPath),
            "utf-8"
          );
        } catch {
          return "INVALID_TOKEN_PLACEHOLDER";
        }
      }
    }

    if (!teamId || !keyId || !privateKey) {
      return "INVALID_TOKEN_PLACEHOLDER";
    }

    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { iss: teamId, iat: now, exp: now + 30 * 24 * 60 * 60 },
      privateKey,
      { algorithm: "ES256", header: { alg: "ES256", kid: keyId } }
    );
  } catch (e) {
    return "INVALID_TOKEN_PLACEHOLDER";
  }
}

main().catch(console.error);
