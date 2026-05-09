/**
 * Script de Setup Inicial
 * 
 * Ajuda o usuario a configurar o MCP server do Apple Music
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function green(text: string) { return `\x1b[32m${text}\x1b[0m`; }
function yellow(text: string) { return `\x1b[33m${text}\x1b[0m`; }
function blue(text: string) { return `\x1b[36m${text}\x1b[0m`; }
function red(text: string) { return `\x1b[31m${text}\x1b[0m`; }

async function main() {
  console.log(`
${blue("╔══════════════════════════════════════════════════════╗")}
${blue("║       Apple Music MCP Server - Configuracao         ║")}
${blue("╚══════════════════════════════════════════════════════╝")}
`);

  // Passo 1: Verificar Node.js
  const nodeVersion = process.version;
  console.log(`${green("✓")} Node.js versao ${nodeVersion} detectado`);

  // Verificar npm packages
  if (!existsSync(join(rootDir, "node_modules"))) {
    console.log(`\n${yellow("!")} Dependencias nao instaladas. Instalando...`);
    const { execSync } = await import("child_process");
    try {
      execSync("npm install", { cwd: rootDir, stdio: "inherit" });
      console.log(`${green("✓")} Dependencias instaladas`);
    } catch {
      console.log(`${red("✗")} Erro ao instalar dependencias. Execute manualmente: npm install`);
      process.exit(1);
    }
  } else {
    console.log(`${green("✓")} Dependencias ja instaladas`);
  }

  // Passo 2: Configurar credenciais
  console.log(`\n${blue("━━━ Passo 1: Credenciais Apple Developer ━━━")}`);
  console.log(`
Para acessar a Apple Music API, voce precisa de credenciais de desenvolvedor:

1. Acesse ${yellow("https://developer.apple.com/account")}
2. Navegue para ${yellow("Certificates, Identifiers & Profiles > Keys")}
3. Clique em ${yellow("+")} para criar uma nova chave
4. Ative ${yellow("Apple Music")} no checkbox de services
5. Clique em ${yellow("Configure")} e selecione o seu App ID
6. Clique em ${yellow("Save")} e faca o ${yellow("Download")} do arquivo .p8
7. Anote o ${yellow("Key ID")} e o seu ${yellow("Team ID")} (visivel no canto superior direito)

${yellow("⚠ Attencao: O arquivo .p8 so pode ser baixado UMA VEZ! Salve-o com seguranca.")}
`);

  await question("Pressione ENTER quando tiver as credenciais prontas...");

  const teamId = await question(`${blue("→")} Cole seu Team ID: `);
  const keyId = await question(`${blue("→")} Cole seu Key ID: `);

  console.log(`\nAgora, coloque o arquivo .p8 baixado da Apple na pasta raiz do projeto.`);
  console.log(`O arquivo deve se chamar ${yellow("AuthKey.p8")}`);

  let keyPath = "./AuthKey.p8";
  const useCustomPath = await question(
    `O arquivo esta em ./AuthKey.p8? (ENTER para sim, ou cole o caminho): `
  );

  if (useCustomPath.trim()) {
    keyPath = useCustomPath.trim();
  }

  if (!existsSync(join(rootDir, keyPath.replace("./", "")))) {
    console.log(`${yellow("!")} Arquivo nao encontrado. Voce pode adiciona-lo depois.`);
  }

  // Passo 3: Music User Token
  console.log(`\n${blue("━━━ Passo 2: Music User Token ━━━")}`);
  console.log(`
O Music User Token e necessario para acessar seus dados pessoais.

${yellow("Opcao A - Atualizar via navegador (recomendado):")}
  Execute: node scripts/auth.js

${yellow("Opcao B - Atualizar manualmente:")}
  1. Abra https://music.apple.com e faca login
  2. Abra as ferramentas de desenvolvedor do navegador (F12)
  3. Va na aba Network/Rede
  4. Recarregue a pagina e reproduza uma musica
  5. Procure por uma requisicao para api.music.apple.com
  6. No header "Music-User-Token", copie o valor
`);

  const userToken = await question(
    `${blue("→")} Cole seu Music User Token (ou pressione ENTER para configurar depois): `
  );

  // Salvar .env
  const envContent = `# Apple Music MCP - Configuracao
# Gerado pelo script de setup em ${new Date().toISOString()}

# Apple Developer Credentials
APPLE_TEAM_ID=${teamId.trim()}
APPLE_KEY_ID=${keyId.trim()}
APPLE_PRIVATE_KEY_PATH=${keyPath.trim()}

# Music User Token
APPLE_MUSIC_USER_TOKEN=${userToken.trim()}
`;

  writeFileSync(join(rootDir, ".env"), envContent);
  console.log(`\n${green("✓")} Arquivo .env criado com sucesso!`);

  // Passo 4: Build
  console.log(`\n${blue("━━━ Passo 3: Build do Projeto ━━━")}`);
  const { execSync } = await import("child_process");
  try {
    execSync("npm run build", { cwd: rootDir, stdio: "inherit" });
    console.log(`\n${green("✓")} Build concluido com sucesso!`);
  } catch {
    console.log(`${red("✗")} Erro no build. Execute manualmente: npm run build`);
    rl.close();
    process.exit(1);
  }

  // Resumo final
  console.log(`\n${blue("━━━ Configuracao Concluida! ━━━")}`);
  console.log(`
${green("Proximos passos:")}

1. Adicione o MCP server ao Claude Code editando o arquivo de configuracao:

${yellow("Claude Desktop (claude_desktop_config.json):")}
\`\`\`json
{
  "mcpServers": {
    "apple-music": {
      "command": "node",
      "args": ["${rootDir.replace(/\\/g, "/")}/dist/index.js"],
      "cwd": "${rootDir.replace(/\\/g, "/")}"
    }
  }
}
\`\`\`

${yellow("Claude Code (claude_mcp_config.json):"}
\`\`\`json
{
  "mcpServers": {
    "apple-music": {
      "command": "node",
      "args": ["./dist/index.js"]
    }
  }
}
\`\`\`

2. Reinicie o Claude Code
3. No Claude Code, pergunte: "Quais sao minhas musicas recentes?"
4. Se der erro de token, execute: node scripts/auth.js

${blue("Ferramentas disponiveis no Claude Code:")}
  • get_recently_played - Suas musicas recentes
  • get_playlists - Suas playlists
  • get_playlist_tracks - Musicas de uma playlist
  • search_music - Buscar no catalogo
  • get_recommendations - Recomendacoes personalizadas
  • get_music_profile - Seu perfil musical
  • get_top_artists - Artistas mais ouvidos
  • create_playlist - Criar playlist nova
  • get_track_details - Detalhes de uma musica
  • auth_setup - Instrucoes de configuracao
`);

  rl.close();
}

main().catch(console.error);
