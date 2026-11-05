# StepByStep — Estudos e Revisões

## Arquitetura

Aplicativo estático sem build, backend ou novas dependências. `dist/index.html` mantém o dashboard, agenda, timer e integração de música anteriores. `study-core.js` contém regras puras; `studies.js` contém a interface e integrações. Todo o visual fica em `styles.css`. `window.StudyBridge` conecta os eventos de início, pausa, conclusão e formulário da agenda sem substituir os handlers existentes.

## Persistência e compatibilidade

A chave de localStorage permanece `um-passo-v1`. A extensão adiciona somente a propriedade `study` com `version: 1`, matérias, tópicos (parentId opcional), anotações, revisões, sessões e sessão ativa pausada. Campos anteriores de dias e playlists são mantidos. Anotações são salvas a cada edição; erros de armazenamento produzem aviso e não afirmam sucesso. Não há sincronização entre dispositivos ou resolução de edições simultâneas em várias abas.

Backup JSON exporta o estado inteiro. Importação valida o formato e a hierarquia, mescla por identificador e adiciona dias ausentes; dados locais existentes ganham os conflitos. Playlists ausentes são adicionadas sem trocar a seleção. O estado candidato só é aplicado depois da validação e da gravação bem-sucedida. A sessão ativa local é preservada; a sessão ativa de outro backup não é importada. Limite de arquivo: 20 MB. O backup contém dados pessoais do aplicativo; guardar em local seguro.

## Editor

Markdown básico: títulos H1–H3, negrito, itálico, listas, checklists e blocos cercados por três crases. Botões inserem sintaxe; a visualização escapa HTML. Destaque leve de palavras-chave, strings, números e comentários para linguagens de programação, incluindo ABAP/CDS/JavaScript/Java. Não é um parser completo de CommonMark nem uma gramática completa por linguagem; HTML, tabelas, imagens e execução de código não são suportados. Checklists no caderno são editados em Markdown (`- [x]`). A fixação oferece campos livres e perguntas com respostas inicialmente recolhidas.

## Regra de revisão

A conclusão inicial ancora o ciclo em D+1, D+3, D+7 e D+15. `Lembrei bem` avança uma etapa; se a data prevista seguinte já passou, usa amanhã. `Não lembrei` repete a mesma etapa amanhã; `Lembrei parcialmente`, em 2 dias. Cada avaliação registra ID, ciclo, data, vencimento e etapa. Repetir o mesmo clique não duplica a avaliação, pois o vencimento é movido ao futuro. Após a quarta etapa bem lembrada, o ciclo termina. Pausar não apaga histórico; retomar mantém a etapa. Iniciar novo ciclo após concluir preserva avaliações anteriores. Revisões aparecem no aplicativo quando aberto; não existem notificações externas.

## Foco e agenda

Compromissos comuns mantêm o comportamento anterior. O tipo Estudo adiciona matéria/tópico e ações para abrir o caderno, iniciar foco e concluir o compromisso. Concluir um compromisso não cria minutos fictícios. Uma sessão iniciada por matéria, nota ou agenda recebe ID único; o timer mede apenas os trechos executados na aba e pausa a contagem ao sair. Após recarregar, a sessão é retomada manualmente. Ao terminar ou registrar, o usuário confirma/ajusta os minutos; o mesmo ID entra no histórico uma vez. Sessões que atravessam meia-noite são atribuídas ao dia do registro. Música continua usando o player e preferências anteriores.

## Navegação e organização

Meu dia, Estudos, Revisões e Histórico de estudos. Matérias/tópicos/anotações podem ser reordenados por setas; notas podem mudar de matéria/tópico e tópicos podem mudar de nível dentro da mesma matéria. Exclusões exigem confirmação. Excluir uma matéria/tópico remove anotações e revisões relacionadas; sessões já registradas preservam os nomes históricos. O card Meus Estudos mostra minutos hoje/semana, recentes, pendências e sessões registradas.

## Validação

`node tests/study-core.test.cjs`: datas, etapas ancoradas, tentativas parciais/insuficientes, proteção contra duplicação, fim/reinício de ciclo, escaping de Markdown, mesclagem idempotente e validação de hierarquia.

Verificação no navegador: criação de matéria/tópico/notas; edição e alternância entre duas notas; código/preview; fixação e respostas ocultas; agendamento; revisão vencida importada e concluída; persistência após recarregar; foco iniciado por nota e registro de minutos; card e histórico; compromisso de estudo associado; abertura de anotações; compromisso comum; ordenação diária anterior; exportação de JSON e importação preservando dados existentes.

## Candidaturas

`applications-core.js` contém validação de registros, status e links; `applications.js` adiciona cadastro, edição, exclusão confirmada, histórico de status, busca sem acentos, filtros, ordenação e acompanhamentos. Os registros ficam em `db.applications`, na mesma chave de armazenamento. O backup completo inclui candidaturas; importação mescla por ID, preservando registros locais em conflito. Backups anteriores, sem candidaturas, permanecem compatíveis. Não envia mensagens, não busca vagas automaticamente e não gera notificações externas.

`node tests/applications.test.cjs` verifica validação, rejeição de URLs inseguras, busca sem acentos, status ativos e mesclagem de backup sem duplicação.

## Pomodoro flutuante e sino

`focus-dock.js` monta o mesmo cartão de foco fora das seções navegáveis, uma única vez, antes de criar o player do YouTube. No dashboard ele acompanha um espaço reservado no grid; em Estudos, Revisões, Candidaturas e Histórico passa a uma janela fixa arrastável. O iframe não é removido nem reparentado ao trocar de aba. Mantém timer, sessão e música existentes. A janela pode ser movida pelo mouse/toque ou pelas setas na alça. No celular tem altura limitada e rolagem própria.

O encerramento real do timer chama um sino sintetizado por Web Audio (duas batidas), sem baixar áudio externo. O início da rodada e o botão Testar sino liberam o contexto de áudio por interação do usuário. A preferência fica em `db.focusPrefs.bell`. Navegar ou pausar não toca o sino. Abas suspensas pelo navegador podem atrasar o alerta; aba fechada ou dispositivo sem áudio não produz som. As restrições de reprodução do próprio YouTube continuam aplicáveis.

## Timer compacto e diário

O Pomodoro flutuante pode ser minimizado pelo botão no cabeçalho e expandido pelo controle ao lado do tempo. O modo compacto usa o mesmo relógio, mantém timer e player montados e não chama pausa de áudio; o conteúdo recolhido fica inerte para navegação por teclado. A preferência fica em `db.focusPrefs.minimized` e é mantida ao trocar de aba. O dashboard sempre mostra o cartão completo.

O Diário do dia fica no final de Meu dia. `daily-journal.js` salva escrita livre em `db.days[data].journal` a cada edição, restaura na navegação entre datas e participa do backup completo já existente. A exclusão de um dia também inclui seu diário, com o mesmo mecanismo de desfazer. Os dados continuam somente neste navegador.

## Sistema visual (redesign de novembro/2026)

`styles.css` é o único arquivo de estilos. As cores, fontes e espaçamentos ficam como variáveis (tokens) no topo do arquivo. O tema escuro é o padrão; `:root[data-theme="light"]` troca os tokens para o tema claro. Nenhuma cor deve ser escrita fora dos tokens.

`settings.js` cuida do botão de tema (☾/☀) e do diálogo ⚙ Configurações, com tema Escuro/Claro/Sistema e exportar/importar backup a partir de qualquer aba. A exportação e a importação continuam sendo as de `studies.js`. A escolha de tema fica em `localStorage['stepbystep-theme']`, fora do backup, porque é uma preferência de cada aparelho. A visão da agenda (Dia/Semana) fica em `localStorage['stepbystep-agenda-view']`.

Ordem do Meu dia: 01 Plano e 02 Foco lado a lado; 03 Durante o dia (checklist + distrações); Agenda (abre em Dia, semana começa na segunda); Meus Estudos + Consistência; 04 Fechar o dia + Diário; Dias anteriores. A navegação de datas fica só no topo. O Pomodoro flutuante abre minimizado nas outras abas.

Os arquivos anteriores ao redesign estão em `dist-backup-antes-redesign/`.
