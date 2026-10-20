# HidroCondo v0.2.0 — Perfis, compartilhamento e suporte

Aplicativo estático PWA + Supabase para zelador(a) registrar hidrômetros com foto e síndico(a) consultar painel, histórico e gráficos. **Não é necessário criar um projeto Supabase novo.**

## Para quem JÁ instalou a v0.1.0 (seu caso)

**Faça backup das tabelas e fotos antes de migrar**, de preferência experimente a migração numa cópia do projeto. Esta versão contém alteração nas permissões RLS e funções do banco.

1. No Supabase atual, abra **SQL Editor → New query** e execute **`sql/upgrade_0_2_0.sql`**. **NÃO execute `sql/setup.sql` novamente.**
2. No GitHub, branch **`main`**, substitua os arquivos da raiz: `index.html`, `app.js`, `styles.css`, `sw.js`, `package.json`, `README.md` e **adicione** `analysis.js`, `tests/analysis.test.js`, `sql/upgrade_0_2_0.sql`.
3. Preserve **`config.js` existente**, com a URL do Supabase e a **publishable key**. **Não substitua** pelo modelo do ZIP nem publique chaves `service_role`, `sb_secret` ou senhas. Os arquivos `math.js`, ícones e `manifest.webmanifest` continuam os mesmos.
4. No GitHub Pages, espere a publicação de `main`. Caso fique mostrando uma versão antiga, recarregue a página e feche/reabra o app instalado (service worker agora tem cache `v0.2.0`).
5. Teste primeiro com **contas de teste** e um condomínio de teste: cadastro de síndico(a), criação de condomínio, link de zelador(a) de uso único, foto/leitura e relatório, além de correção com auditoria.
6. Se contas antigas já tinham um condomínio, a migração preserva seu perfil com base no vínculo: `sindica` → `sindico`; `zelador` → `zelador`. Contas antigas sem vínculo escolhem seu perfil uma única vez ao entrar.

> Esta entrega contém o código e a migração; **nenhum arquivo foi automaticamente enviado ao seu GitHub nem aplicado no Supabase**. Nenhuma integração foi testada em seu banco real.

## Instalação em um Supabase inteiramente novo

Execute primeiro `sql/setup.sql` do projeto original e, em seguida, `sql/upgrade_0_2_0.sql`. A versão 0.2.0 exige as duas estruturas. Não aplique `setup.sql` novamente num banco já utilizado.

## O que mudou

- **Modo claro, escuro e automático**, lembrado pelo navegador.
- **Perfil no cadastro**: síndico(a) ou zelador(a). Cada perfil vê o fluxo apropriado. Uma conta do tipo zelador(a) não pode criar condomínio, inclusive quando tenta chamar diretamente a API: a política de banco rejeita essa operação.
- **Ativação do zelador via URL pessoal**: síndico(a) gera um link válido por 7 dias e **um único uso**. O(a) zelador(a) abre o link, entra/cria conta do seu perfil e confirma a ativação. Convites antigos de código permanente da v0.1.0 deixam de funcionar, por segurança.
- **Simplicidade para zelador(a)**: abre na tela de medição, esconde painel administrativo, facilita foto/valor/salvar e oferece botão de compartilhar na confirmação.
- **Relatório com foto**: PNG único com leitura, consumo e resumo dos dados. No WhatsApp, se o dispositivo suportar Web Share com arquivos, use a folha de compartilhamento. Alguns WhatsApps/navegadores **ignoram o texto separado** quando recebem uma imagem; por isso, as principais informações vão impressas no próprio PNG. Quando compartilhar imagem não for suportado, o aplicativo baixa o PNG e abre WhatsApp com texto; **é necessário anexar a imagem manualmente**.
- **Métricas em linguagem natural**: último período, média diária, últimas 4 medições e períodos encerrados no mês. Nunca afirmar consumo **total de um mês incompleto**; “mês” apresenta apenas o que está efetivamente coberto por intervalos encerrados. Alerta apenas com histórico suficiente, nunca diagnóstico de vazamento.
- **Tutorial integrado**: automático no primeiro acesso a cada papel; sempre disponível em `? Ajuda`. **Manutenção obrigatória**: atualizar tutorial da interface e este README sempre que alterar os fluxos.
- **Suporte temporário autorizado por síndico(a)**: link de autorização tem 15 minutos para ser usado uma vez; concede 90 minutos de acesso a **conta técnica especial do tipo `suporte`**. O(a) síndico(a) pode revogar a sessão no painel. Permite ler dados/fotos e corrigir leituras com registro de motivo; não permite acessar livremente outros condomínios. Sem um link de autorização, conta técnica não lê dados. Conta `suporte` é configurada **manualmente pelo proprietário do Supabase** (veja abaixo).

## Criar conta técnica de suporte (somente administrador do banco)

Por segurança, **ninguém pode escolher “sou suporte” na tela de cadastro**. Você precisa criar uma conta separada de suporte:

1. Crie uma conta normal usando outro e-mail; pode escolher `zelador(a)`, **sem entrar em condomínio**.
2. No SQL Editor do Supabase, depois de confirmar que o e-mail realmente é seu, rode, substituindo o e-mail:

```sql
update public.account_profiles
set account_type = 'suporte'
where user_id = (
  select id from auth.users where email = 'SEU-EMAIL-DE-SUPORTE@example.com'
);
```

3. Faça logout e login com essa conta. Sem autorização de uma síndico(a), ela **não** verá dados do condomínio. O(a) síndico(a) gera o link em **Ajustes → Autorizar suporte**, e você o abre nessa conta. Cada autorização vale no máximo 90 minutos; o acesso é apenas ao condomínio escolhido.
4. Para encerrar antes do prazo, o(a) síndico(a) clica em **Revogar agora**. Uma sessão revogada pode continuar exibindo dados já carregados na tela até ser atualizada, mas novas solicitações ficam bloqueadas pelas políticas de acesso no banco.

**Restrição importante:** a função de suporte é para consultas, correções documentadas e inspeção. Não é uma conta de superadmin geral, não pode alterar credenciais de outros usuários, assumir outro condomínio, mudar permissões ou apagar históricos. Para mudanças de esquema, use o Supabase SQL Editor, com procedimento administrativo separado.

## Fluxo de teste mínimo

1. No navegador incógnito A, crie uma conta nova `Sou síndico(a)`, confirme e-mail e crie um condomínio.
2. Em Ajustes, clique em **Gerar link de ativação** e copie-o.
3. No navegador incógnito B, abra o link e crie conta `Sou zelador(a)` (o perfil de zelador já estará pré-selecionado). Ao entrar, clique em **Ativar meu acesso**.
4. Cadastre uma leitura com foto. A foto é obrigatória para zelador(a), mas a primeira leitura de referência pode ser criada pelo(a) síndico(a) sem foto.
5. Com dois registros no mesmo hidrômetro, compare o valor de consumo e gere a imagem de relatório; teste no Android e no WhatsApp real.
6. Confira que zelador(a) não consegue criar condomínio nem editar leituras, inclusive se tentar acessar as APIs sem botão.
7. Gere uma sessão de suporte, ative-a com conta técnica, corrija leitura com justificativa e revogue. Acesso deve ser negado na API depois da revogação.
8. Alterne o tema e abra `? Ajuda` nos dois perfis.

## Cálculos e limites

O visor `4.064,959 m³` corresponde à leitura acumulada. **A linha `m³/h` é a vazão instantânea**, não é o consumo acumulado. O cálculo entre `3.981,000` e `4.064,959` é `83,959 m³` (se os três decimais da leitura anterior eram efetivamente 000). Médias consideram intervalo em dias. A comparação histórica é indicativa e não identifica vazamentos.

O compartilhamento nativo depende do navegador/OS e pode não aceitar `text` junto com `files`; aplicativos não podem impor que o WhatsApp anexe uma imagem e uma legenda automaticamente em todos os aparelhos.

**Limitações restantes:** a internet é necessária para salvar; OCR permanece experimental e precisa de confirmação; não há notificações automáticas; dados de leitura com reset/troca de hidrômetro exigem novo dispositivo; backup CSV não inclui fotos. Proteja os links de convite, pois são credenciais temporárias.

## Arquivos atualizados

```text
index.html              substitui (fluxos, ajuda e autenticação)
app.js                  substitui (perfis, compartilhamento e suporte)
styles.css              substitui (dark mode e simplificações)
analysis.js             NOVO (texto analítico, métricas)
sw.js                   substitui (cache 0.2.0)
package.json            substitui (versão)
README.md               substitui (guia atualizado)
sql/upgrade_0_2_0.sql   NOVO (migração do banco EXISTENTE)
tests/analysis.test.js  NOVO (testes de análises)
config.js               PRESERVAR, não alterar
math.js                 PRESERVAR
```

## Versão GitHub

- Release: `v0.2.0-beta` (**pre-release**, enquanto não testada em campo).
- Commit: `feat: adicionar perfis seguros, dark mode, convites e suporte temporário`
- Arquivos removidos: nenhum.
- Nunca reaplicar `sql/setup.sql` na base que já possui os dados.

Para rodar os testes locais: `npm test`. **Testes automáticos de banco/RLS, suporte em Supabase real e compartilhamento nativo ainda pendentes**.
