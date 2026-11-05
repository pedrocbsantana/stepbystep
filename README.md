# stepbystep

> Seu dia, uma tarefa por vez. Arroz com feijão, todo dia.

App pessoal de foco e rotina: plano do dia, timer com música, agenda, estudos com revisões espaçadas, candidaturas, Clareza (hábitos) e diário. É um site estático, sem backend e sem build: tudo roda no navegador.

## Seções

| Seção | O que faz |
|---|---|
| **Meu dia** | 01 Plano (com modelo editável) · 02 Uma tarefa, agora (timer + música + sino) · 03 Durante o dia (checklist e distrações) · Agenda · 04 Fechar o dia (revisão + escrita livre) · Meus dias |
| **Estudos** | Matérias, tópicos e anotações em Markdown, com perguntas de fixação |
| **Revisões** | Revisões espaçadas em 1, 3, 7 e 15 dias |
| **Candidaturas** | Vagas, status, histórico e acompanhamentos |
| **Clareza** | Dias firmes, botão "Bateu a vontade", check-in, padrões, plano se/então e ambiente |
| **Histórico** | Sessões de estudo registradas |

Em ⚙ **Configurações**: tema (escuro, claro, sistema), mostrar/esconder seções, exportar/importar backup.

## Rodar no computador

```bash
python -m http.server 8080 --directory dist
```

Depois abra http://localhost:8080. Também funciona com o Live Server do VS Code apontando para `dist/index.html`.

## Testes

```bash
node tests/study-core.test.cjs
node tests/applications.test.cjs
node tests/clareza.test.cjs
```

Os testes também rodam no GitHub antes de cada publicação.

## Publicar (GitHub Pages)

No Windows, clique duas vezes em **`deploy.cmd`** (ou rode `.\deploy.ps1` no PowerShell).

- **Na primeira vez:** instala Git e GitHub CLI se faltar, abre o navegador para você logar no GitHub, cria o repositório, ativa o Pages e publica.
- **Nas próximas:** salva suas alterações num commit e publica de novo. Para dar nome ao commit: `.\deploy.ps1 -Message "Ajusta a agenda"`.

O site fica em `https://SEU-USUARIO.github.io/stepbystep/`. No celular, abra o link e use **Adicionar à tela inicial**: ele vira um app e abre mesmo sem internet.

## Seus dados

- Ficam **só no navegador** em que você usa o app (`localStorage`, chave `um-passo-v1`). Nada vai para o GitHub.
- **Cada aparelho tem os seus.** Para levar do PC para o celular: ⚙ → Exportar backup no PC e ⚙ → Importar backup no celular. A importação mescla, sem duplicar.
- Limpar os dados do site no navegador apaga tudo. Faça backup de vez em quando (o app lembra depois de 7 dias).

## Estrutura

```
dist/                 site publicado
  index.html          página única
  styles.css          todo o visual (tokens de cor no topo; tema claro em [data-theme=light])
  app.js              Meu dia: plano, timer, checklist, agenda, música, histórico de dias
  study-core.js       regras puras de estudos, revisões e backup
  studies.js          interface de Estudos, Revisões, Histórico e navegação
  applications*.js    Candidaturas
  clareza-core.js     regras puras da Clareza
  clareza.js          interface da Clareza
  focus-dock.js       Pomodoro flutuante
  daily-journal.js    escrita livre do dia
  settings.js         tema, seções, backup e registro do app (PWA)
  sw.js, manifest.webmanifest, icons/   app instalável e offline
tests/                testes em Node, sem dependências
.github/workflows/    publicação automática no GitHub Pages
deploy.ps1 / .cmd     deploy pelo PowerShell
STUDIES.md            documentação técnica das regras
```
