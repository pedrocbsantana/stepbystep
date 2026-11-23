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

Em ⚙ **Configurações**: tema, seções visíveis, avisos, exportação para calendário e backup.

## Avisos e calendário

- **Avisos do sistema:** compromissos nos lembretes escolhidos (na hora, minutos, horas, dias ou semana antes; o padrão para novos compromissos fica em ⚙ → Avisos), fim do timer e um resumo do dia na primeira abertura. Funcionam com o app aberto ou aberto há pouco. No iPhone, só depois de instalar o app na tela de início (iOS 16.4+).
- **Calendário (.ics):** ⚙ → Exportar novidades gera um arquivo com compromissos (com um alerta para cada lembrete escolhido) e revisões. Importe no Google Agenda ou no Calendário do iPhone e o aviso chega mesmo com o app fechado. "Novidades" exporta só o que é novo ou mudou, para não duplicar.
- **Com o app fechado (push):** com os avisos ativos e a Sincronização ligada, o aparelho se inscreve para receber push. O app grava a hora de cada lembrete na tabela `push_jobs` do Neon, e a função `lembretes` (pasta `push-server/`, projeto Neon "step") roda a cada 5 minutos e envia os que venceram. O aviso chega com até ~3 minutos de diferença. No iPhone, precisa do app instalado na tela de início.
  - Os lembretes vão em texto aberto para `push_jobs` (título, dia e horário), mesmo com a cifragem ligada, porque o servidor precisa lê-los.
  - Publicar a função: `cd push-server && npm install && neon deploy --env .env`. O `.env` (fora do git) guarda as chaves VAPID; a pública também está em `dist/notify.js`. Trocar as chaves exige que cada aparelho desative e ative os avisos de novo.

## Rodar no computador

```bash
python -m http.server 8080 --directory dist
```

Depois abra http://localhost:8080. Também funciona com o Live Server do VS Code apontando para `dist/index.html`.

## Testes

```bash
npm test
```

(Ou, sem npm: `node --test "tests/*.test.cjs"`. Precisa do Node 22 ou mais novo, sem dependências.)

Os testes também rodam no GitHub antes de cada publicação. Para padronizar a formatação do código: `npm run format` (usa o Prettier, baixado na hora pelo npx).

## Publicar (GitHub Pages)

No Windows, clique duas vezes em **`deploy.cmd`** (ou rode `.\deploy.ps1` no PowerShell).

- **Na primeira vez:** instala Git e GitHub CLI se faltar, abre o navegador para você logar no GitHub, cria o repositório, ativa o Pages e publica.
- **Nas próximas:** salva suas alterações num commit e publica de novo. Para dar nome ao commit: `.\deploy.ps1 -Message "Ajusta a agenda"`.

O site fica em `https://SEU-USUARIO.github.io/stepbystep/`. No celular, abra o link e use **Adicionar à tela inicial**: ele vira um app e abre mesmo sem internet.

## Seus dados

- Ficam no navegador (`localStorage`, chave `um-passo-v1`). Nada vai para o GitHub.
- **Sincronização (opcional):** ⚙ → Sincronização → cole a chave e conecte. Faça o mesmo em cada aparelho. A partir daí, cada mudança sobe para o banco Postgres no Neon em poucos segundos, e os outros aparelhos puxam ao abrir, ao voltar para o app e a cada minuto. Funciona offline e sincroniza quando a internet volta.
  - O app usa um papel do banco (`stepbystep_sync`) que só pode ler, inserir e atualizar a tabela `sync_docs`. A chave é a senha desse papel: fica só nos seus aparelhos, não está no código nem no backup.
  - Conflito: se os dois aparelhos mudarem a mesma coisa (o mesmo dia, a mesma anotação) sem sincronizar, vale a última versão enviada.
  - **Cifragem (recomendado):** ⚙ → Sincronização → Cifrar dados na nuvem. A partir daí, cada documento sobe cifrado (AES-GCM) com uma chave derivada da chave de sincronização: quem abrir o banco pelo painel do Neon vê só texto embaralhado. Antes de ativar, feche e abra o app nos outros aparelhos para todos estarem na versão nova; os aparelhos atualizados passam a cifrar sozinhos ao encontrar um documento cifrado.
  - O que chega da nuvem é conferido antes de entrar no app. Documento estragado é ignorado (aparece um aviso no console) e não apaga nada local.
  - Para trocar a chave: no SQL Editor do Neon, `ALTER ROLE stepbystep_sync PASSWORD '...';` e conecte de novo nos aparelhos. Com a cifragem ativada, conecte **primeiro o aparelho mais atualizado**: ele recifra e reenvia tudo com a chave nova (o que estava cifrado com a chave antiga não abre mais).
- Sem sincronização, use ⚙ → Exportar/Importar backup para levar dados entre aparelhos.
- Limpar os dados do site no navegador apaga tudo. Faça backup de vez em quando (o app lembra depois de 7 dias).

## Estrutura

```
dist/                 site publicado
  index.html          página única; a Content-Security-Policy no <head> só libera o próprio site,
                      o YouTube (música) e o Neon (sincronização). Serviço externo novo? Libere lá.
  styles.css          todo o visual (tokens de cor no topo; tema claro em [data-theme=light])
  theme-init.js       aplica o tema antes de desenhar (evita piscar)
  day-core.js         regras puras do Meu dia: dia novo, dia vazio, pendências, validação
  app.js              Meu dia: plano, timer, checklist, agenda, música, histórico de dias; saveDB() grava tudo
  study-core.js       regras puras de estudos, revisões e backup
  studies.js          interface de Estudos, Revisões, Histórico e navegação
  applications*.js    Candidaturas
  clareza-core.js     regras puras da Clareza
  clareza.js          interface da Clareza
  focus-dock.js       Pomodoro flutuante
  daily-journal.js    escrita livre do dia
  settings.js         tema, seções, backup e registro do app (PWA)
  reminders-core.js   regras puras de lembretes e geração do .ics
  notify.js           avisos do sistema e exportação para calendário
  sync-core.js        regras puras da sincronização (documentos, mudanças, conflitos)
  sync.js             sincronização com o Neon e tela de conexão
  sw.js, manifest.webmanifest, icons/   app instalável e offline (a versão do cache muda sozinha a cada publicação)
  fonts/              Fraunces e Manrope (OFL), servidas localmente
tests/                testes em Node (node:test), sem dependências
.github/workflows/    publicação automática no GitHub Pages
deploy.ps1 / .cmd     deploy pelo PowerShell
STUDIES.md            documentação técnica das regras
```
