# HidroCondo — MVP 0.1.0

PWA estático para registrar medições de hidrômetros, armazenar fotos privadas, calcular consumo entre datas, gerar relatório PNG/WhatsApp e exibir painel online para a síndica. Interface em português, com dois papéis: **síndica** e **zelador**.

## Funcionalidades implementadas

- Cadastro de usuário com e-mail e senha e autenticação Supabase.
- A síndica cria o condomínio; um código de convite com 24 caracteres permite ao zelador participar.
- A síndica cadastra mais hidrômetros; o app já começa com um padrão.
- Entrada de leitura **separada em parte inteira e três casas decimais**: `4.064` e `959` = `4.064,959 m³`.
- Foto obrigatória para o zelador (WebP comprimido); a síndica pode cadastrar a primeira leitura sem foto para registrar a referência histórica.
- **OCR experimental opcional** para tentar preencher os dígitos a partir da foto, executado no navegador com Tesseract.js. É obrigatório conferir o valor sugerido; falhas de leitura são esperadas.
- Não permite datas futuras, leituras duplicadas no mesmo dia ou retrocesso do marcador (a validação presume hidrômetro sem troca/zeragem).
- Cálculos históricos automáticos com base na medição anterior, média diária e alerta de aumento de consumo com pelo menos quatro intervalos.
- Gráfico dos últimos nove períodos, histórico, visualização privada das fotos e CSV de exportação.
- Relatório PNG com foto, consumo e média; botão de compartilhamento nativo (escolha WhatsApp na tela de compartilhamento). Alternativa: baixar o PNG e abrir WhatsApp com texto pronto.
- Correção de leituras somente pela síndica, com motivo e log de auditoria.
- Painel online atualizado automaticamente a cada 30 segundos, quando a página estiver aberta, ou ao voltar ao app.
- PWA instalável no celular; **internet necessária para cadastrar/consultar medições**. Não há sincronização offline no MVP.

## Instalação: cerca de 15–25 minutos

### 1. Criar o banco

1. Crie um projeto em https://supabase.com (conta gratuita é suficiente para iniciar testes dentro da franquia disponível).
2. No menu **SQL Editor**, abra `sql/setup.sql`, cole todo o conteúdo e execute **uma única vez** num projeto novo.
3. Em **Authentication → Providers → Email**, mantenha o provedor de e-mail habilitado. Para uso real, é recomendado confirmar e-mails. Depois de se cadastrar, clique no link recebido antes de fazer login.
4. Em **Authentication → URL Configuration**, cadastre a URL completa do GitHub Pages na lista de redirecionamentos quando necessário.

### 2. Configurar o site

1. Abra o arquivo `config.js` na raiz do projeto (já vem como modelo).
2. Em **Project Settings → API** (a interface pode variar), copie a **Project URL** e a chave **publishable** (`sb_publishable_...`) ou a chave **anon**.
3. Insira os dois valores em `config.js`. **Não use `service_role`, `sb_secret_...` nem senha do banco.** A chave pública fica visível no GitHub Pages; isso é esperado, e as tabelas são protegidas por RLS.
4. Envie os arquivos para um repositório GitHub. Em **Settings → Pages**, publique a raiz da branch principal.
5. Abra a URL da página. Em Android/iOS, abra pelo navegador e use *Adicionar à tela de início* para instalar quando disponível.

### 3. Primeira utilização

1. A **síndica** cria uma conta, faz login e escolhe **Sou síndica / administrador**. Informe o nome do condomínio.
2. Em **Ajustes**, copie o código de convite e envie em particular ao zelador.
3. Se houver histórico, a síndica cadastra a **leitura de referência** (ex.: 10/10/2026: inteiro `3981`, decimais `000`) sem foto. **Se não houver certeza dos decimais antigos, informe 000 apenas como aproximação e explique isso ao consultar os valores.**
4. O **zelador** cria outra conta, entra em **Sou zelador / responsável**, cola o código e confirma.
5. O zelador registra a próxima leitura com foto, opcionalmente tenta **Reconhecer números (beta)**, confere o resultado e salva. Ela aparece no painel da síndica ao atualizar/voltar à página ou no próximo ciclo de 30 s.
6. Clique em **Compartilhar relatório** e escolha WhatsApp. Dependendo do navegador, talvez seja necessário baixar a imagem e anexá-la manualmente.

## Como funcionam as medidas

O visor da imagem fornecida possui dígitos como `4064.959 m³`; a linha de `m³/h` indica vazão instantânea, **não** a leitura acumulada.

- Leitura: 10/10/2026 = `3981,000 m³`; 17/10/2026 = `4064,959 m³`.
- Diferença: **83,959 m³** (83.959 litros) — atenção: os decimais da primeira medição são hipotéticos neste exemplo.
- Se forem registrados apenas os números inteiros `3981,000` e `4064,000`, a diferença é **83 m³**.
- Armazene números reais com três casas decimais para evitar que diferenças e médias mudem por truncamento.

## Limitações importantes do MVP

- **OCR experimental, não validado com fotos de campo.** Pode falhar por reflexos, baixa resolução ou confundir dígitos. Não substitui conferência manual; carregamento inicial do OCR precisa de internet.
- A atualização é por consulta automática a cada 30 s, **não é push instantâneo**.
- O envio para WhatsApp **não acontece sozinho**, pois o usuário deve confirmar o compartilhamento. Há diferenças entre Android, iOS e desktop.
- Não há cobrança, leitura automática por API do hidrômetro, lembrete por push, relatórios PDF, sincronização offline nem cálculo de conta de água.
- O app carrega até **1.500** leituras e 1.500 itens de auditoria por condomínio. Para grandes volumes será necessária paginação.
- Não resolve automaticamente troca de hidrômetro, reset do contador ou leitura circular. Cadastre um novo hidrômetro quando houver substituição e mantenha o histórico anterior.
- **Não apaga leituras** por segurança. A síndica pode corrigir com registro de auditoria. Os uploads que não virarem registro após falhas muito específicas podem exigir limpeza manual no Storage.
- Dependências de Supabase JS são carregadas de CDN. Sem internet o app pode abrir parcialmente se já instalado, mas **não** grava leituras offline.
- **Backup:** exporte CSV regularmente. O CSV não contém os próprios arquivos de foto; faça também backup do Storage se for necessário preservar as imagens fora do serviço.
- O plano gratuito Supabase tem limites, regras de pausa e pode ser alterado. Verifique o preço e as condições atuais antes de depender dele operacionalmente.
- Para operação profissional: revisar política de privacidade, procedimentos de acesso, recuperação de contas, política de backups, testes de dispositivos e retenção de imagens.

## Estrutura do repositório

```text
HidroCondo-MVP/
├── index.html              # Telas de cadastro, painel, leituras e histórico
├── styles.css              # Layout responsivo
├── app.js                  # Integração Supabase e interface
├── math.js                 # Cálculos e formatos de leitura
├── config.example.js       # Modelo de configuração pública
├── config.js               # Sua configuração (criar localmente)
├── manifest.webmanifest    # Instalabilidade PWA
├── sw.js                   # Cache do shell, sem dados privados
├── icons/icon.svg          # Ícone
├── sql/setup.sql           # Banco + políticas de acesso
├── tests/math.test.js      # Testes
└── package.json
```

## Desenvolvimento local e testes

```bash
# edite config.js com a URL e a chave pública
npm test
python3 -m http.server 8080
# abra http://localhost:8080
```

## GitHub

- **Adicionar:** todos os arquivos listados acima, incluindo `config.js` com **somente chave publicável**, nunca chave secreta.
- **Remover/substituir:** nada; criação inicial do projeto.
- **Versão / release:** `v0.1.0-mvp`.
- **Mensagem de commit:** `feat: criar MVP HidroCondo com leituras, fotos, painel e WhatsApp`.

## Referências técnicas

- https://supabase.com/docs/reference/javascript/installing
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share

- https://github.com/naptha/tesseract.js/
