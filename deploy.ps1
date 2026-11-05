<#
  deploy.ps1 - publica o stepbystep no GitHub Pages.

  Como usar: clique duas vezes em deploy.cmd
         ou, no PowerShell, dentro desta pasta:  .\deploy.ps1
         com mensagem própria:                     .\deploy.ps1 -Message "Ajusta a agenda"

  Primeira vez: instala Git e GitHub CLI se faltar, faz login no GitHub (abre o navegador),
  cria o repositório, ativa o GitHub Pages e publica.
  Depois: salva suas alterações em um commit e publica de novo.
#>
param(
  [string]$RepoName = 'stepbystep',
  [string]$Message = ''
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -Path $PSScriptRoot

function Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Ok([string]$Text) { Write-Host "    $Text" -ForegroundColor Green }
function Warn([string]$Text) { Write-Host "    $Text" -ForegroundColor Yellow }
function Fail([string]$Text) { Write-Host "`n[erro] $Text" -ForegroundColor Red; exit 1 }
function Has([string]$Cmd) { [bool](Get-Command $Cmd -ErrorAction SilentlyContinue) }
function Invoke-Native([string]$Exe, [string[]]$ArgList) {
  & $Exe @ArgList
  if ($LASTEXITCODE -ne 0) { Fail "Falhou: $Exe $($ArgList -join ' ')" }
}
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

Write-Host 'stepbystep - deploy para o GitHub Pages' -ForegroundColor White

# 1. Ferramentas
Step 'Conferindo Git e GitHub CLI'
$tools = @(
  @{ Cmd = 'git'; Id = 'Git.Git'; Url = 'https://git-scm.com/download/win' },
  @{ Cmd = 'gh'; Id = 'GitHub.cli'; Url = 'https://cli.github.com' }
)
foreach ($t in $tools) {
  if (Has $t.Cmd) { Ok "$($t.Cmd) encontrado"; continue }
  if (-not (Has 'winget')) { Fail "Instale o $($t.Cmd) em $($t.Url) e rode este script de novo." }
  Step "Instalando $($t.Cmd) com o winget"
  winget install --id $t.Id -e --source winget --accept-package-agreements --accept-source-agreements
  Refresh-Path
  if (-not (Has $t.Cmd)) { Fail "O $($t.Cmd) foi instalado, mas este PowerShell ainda não o enxerga. Feche, abra de novo e rode o script." }
}

# 2. Testes (se o Node estiver instalado)
if (Has 'node') {
  Step 'Rodando os testes'
  Get-ChildItem -Path tests -Filter *.cjs | ForEach-Object { Invoke-Native 'node' @($_.FullName) }
} else {
  Warn 'Node não encontrado: pulando os testes locais (eles rodam no GitHub antes de publicar).'
}

# 3. Login no GitHub
Step 'Conferindo o login no GitHub'
gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Warn 'Você ainda não está logado. O navegador vai abrir para você autorizar.'
  gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { Fail 'Login no GitHub não foi concluído.' }
}
gh auth setup-git *> $null
$owner = (gh api user --jq .login)
if (-not $owner) { Fail 'Não consegui descobrir seu usuário do GitHub.' }
$owner = $owner.Trim()
Ok "Logado como $owner"

# 4. Repositório local
if (-not (Test-Path '.git')) { Invoke-Native 'git' @('init', '-b', 'main') }
if (-not (git config user.email)) {
  git config user.name $owner
  git config user.email "$owner@users.noreply.github.com"
}
$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') { Invoke-Native 'git' @('branch', '-M', 'main') }

$pending = git status --porcelain
if ($pending) {
  if (-not $Message) { $Message = "Atualiza o site ($(Get-Date -Format 'dd/MM/yyyy HH:mm'))" }
  Step "Salvando suas alterações: $Message"
  Invoke-Native 'git' @('add', '-A')
  Invoke-Native 'git' @('commit', '-m', $Message)
} else {
  Ok 'Nenhuma alteração nova para salvar.'
}

# 5. Repositório no GitHub
$hasOrigin = @(git remote) -contains 'origin'
if (-not $hasOrigin) {
  gh repo view "$owner/$RepoName" *> $null
  if ($LASTEXITCODE -eq 0) {
    Step "Usando o repositório existente $owner/$RepoName"
    Invoke-Native 'git' @('remote', 'add', 'origin', "https://github.com/$owner/$RepoName.git")
  } else {
    Step "Criando o repositório $owner/$RepoName"
    Invoke-Native 'gh' @('repo', 'create', $RepoName, '--public', '--source', '.', '--remote', 'origin', '--description', 'Seu dia, uma tarefa por vez.')
  }
}
$originUrl = git remote get-url origin
if ($originUrl -match 'github\.com[/:]([^/]+)/([^/]+?)(\.git)?$') { $repo = "$($Matches[1])/$($Matches[2])" }
else { $repo = "$owner/$RepoName" }

# 6. GitHub Pages (publicação pelo GitHub Actions)
gh api "repos/$repo/pages" *> $null
if ($LASTEXITCODE -ne 0) {
  Step 'Ativando o GitHub Pages'
  gh api -X POST "repos/$repo/pages" -f build_type=workflow *> $null
  if ($LASTEXITCODE -ne 0) {
    Warn "Não consegui ativar sozinho. Abra https://github.com/$repo/settings/pages e escolha Source: GitHub Actions."
  } else { Ok 'Pages ativado' }
}

# 7. Enviar e acompanhar a publicação
Step 'Enviando para o GitHub'
Invoke-Native 'git' @('push', '-u', 'origin', 'main')

Step 'Publicando (leva 1 a 2 minutos)'
Start-Sleep -Seconds 6
$runId = gh run list --repo $repo --workflow pages.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId'
if ($runId) {
  gh run watch $runId --repo $repo --exit-status
  if ($LASTEXITCODE -ne 0) { Fail "A publicação falhou. Veja os detalhes em https://github.com/$repo/actions" }
} else {
  Warn "Não encontrei a publicação ainda. Acompanhe em https://github.com/$repo/actions"
}

$parts = $repo.Split('/')
$url = "https://$($parts[0].ToLower()).github.io/$($parts[1])/"
Write-Host "`nPronto! Seu site: $url" -ForegroundColor Green
Write-Host 'No celular: abra o link e use "Adicionar à tela inicial" para instalar como app.'
Start-Process $url
