-- Habilita extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tipos ENUM
CREATE TYPE papel_usuario AS ENUM ('admin', 'atendente');
CREATE TYPE status_usuario AS ENUM ('convidado', 'ativo', 'inativo');
CREATE TYPE status_convite AS ENUM ('pendente', 'aceito', 'expirado');
-- status_indicacao era um ENUM fixo aqui; virou a tabela `indicacao_status`
-- (configurável pelas Configurações) em 29/08/2026 — ver mais abaixo.

-- Tabela: perfis_usuarios
CREATE TABLE perfis_usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cargo TEXT,
  funcao TEXT,
  papel papel_usuario NOT NULL DEFAULT 'atendente',
  status status_usuario NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Tabela: setores
CREATE TABLE setores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Tabela: convites
CREATE TABLE convites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  -- Definido pelo admin ao gerar o convite (não mais pela pessoa convidada,
  -- que agora só define a senha na tela de aceitar convite).
  email TEXT,
  cargo TEXT,
  funcao TEXT,
  papel papel_usuario NOT NULL DEFAULT 'atendente',
  token TEXT UNIQUE NOT NULL DEFAULT uuid_generate_v4()::text,
  status status_convite NOT NULL DEFAULT 'pendente',
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  aceito_em TIMESTAMP WITH TIME ZONE
);

-- Evita dois convites pendentes pro mesmo e-mail (não afeta os já
-- aceitos/expirados).
CREATE UNIQUE INDEX idx_convites_email_pendente
ON convites (email)
WHERE status = 'pendente';

-- Tabela: associados
CREATE TABLE associados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_completo TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  -- Telefone de contato do associado (diferente de indicacoes.telefone_indicado,
  -- que é do indicado, não do dono da conta). Adicionado em 29/08/2026.
  telefone TEXT,
  -- Soft-delete: "apagar" associado na prática só marca ativo=false (nunca
  -- DELETE de verdade, pra não perder avaliações/indicações/histórico em
  -- cascata). Adicionado em 29/08/2026.
  ativo BOOLEAN NOT NULL DEFAULT true
);

-- Tabela: associado_eventos
-- Histórico imutável de auditoria dos dados cadastrais do associado (criação,
-- correção de nome/CPF). Mesmo princípio de indicacao_eventos. Adicionada em
-- 28/08/2026.
CREATE TABLE associado_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  associado_id UUID NOT NULL REFERENCES associados(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES auth.users(id),
  campo TEXT NOT NULL, -- 'criacao' | 'nome_completo' | 'cpf' | 'telefone'
  valor_anterior TEXT,
  valor_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now())
);

-- Tabela: veiculos
CREATE TABLE veiculos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  associado_id UUID NOT NULL REFERENCES associados(id) ON DELETE CASCADE,
  placa TEXT UNIQUE NOT NULL,
  modelo TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Tabela: criterios_avaliacao
-- Adicionada em produção após a criação original do banco (não existia na versão
-- anterior deste arquivo). Cada setor pode ter vários critérios de avaliação;
-- as notas por critério ficam em avaliacao_notas.
CREATE TABLE criterios_avaliacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id UUID NOT NULL REFERENCES setores(id),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Tabela: avaliacoes
-- Campos `nota` e `classificacao` mudaram em produção em relação à versão original:
-- - `nota` passou de INTEGER (0-10) para NUMERIC, pois agora representa a média
--   calculada a partir das notas por critério (ver avaliacao_notas).
-- - `classificacao` deixou de ser coluna GENERATED (calculada no próprio banco) e
--   passou a ser TEXT normal, preenchida pela aplicação — provavelmente porque o
--   cálculo agora depende de dados de outra tabela (avaliacao_notas), o que uma
--   coluna GENERATED de uma única linha não consegue fazer sozinha.
CREATE TABLE avaliacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  veiculo_id UUID NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  associado_id UUID NOT NULL REFERENCES associados(id) ON DELETE CASCADE,
  setor_id UUID NOT NULL REFERENCES setores(id),
  nota NUMERIC NOT NULL,
  classificacao TEXT,
  comentario TEXT,
  data_avaliacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  usuario_id UUID NOT NULL REFERENCES auth.users(id)
);

-- Tabela: avaliacao_notas
-- Adicionada em produção após a criação original do banco. Guarda a nota dada
-- para cada critério (criterios_avaliacao) dentro de uma avaliação.
CREATE TABLE avaliacao_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id UUID NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
  criterio_id UUID NOT NULL REFERENCES criterios_avaliacao(id),
  nota INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Tabela: indicacao_status
-- Configurável pelas Configurações do sistema (nome, cor, ordem, quantidade)
-- — antes era o ENUM status_indicacao. Cada status pode ser marcado como
-- "conta como fechado" (usado nas métricas de Conversão e Tempo de
-- Fechamento do Dashboard). Adicionada em 29/08/2026.
CREATE TABLE indicacao_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT 'cinza', -- chave de uma paleta fixa, ver CORES_STATUS no front-end
  ordem INTEGER NOT NULL DEFAULT 0,
  conta_como_fechado BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Status padrão numa instalação nova (o mesmo conjunto que existia como ENUM)
INSERT INTO indicacao_status (nome, cor, ordem, conta_como_fechado) VALUES
  ('Pendente', 'amarelo', 0, false),
  ('Em Tratativa', 'azul', 1, false),
  ('Fechado', 'verde', 2, true),
  ('Sem Retorno', 'vermelho', 3, false);

-- Tabela: indicacoes
CREATE TABLE indicacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  associado_id UUID NOT NULL REFERENCES associados(id) ON DELETE CASCADE,
  avaliacao_id UUID REFERENCES avaliacoes(id) ON DELETE SET NULL,
  nome_indicado TEXT NOT NULL,
  telefone_indicado TEXT NOT NULL,
  status_id UUID NOT NULL REFERENCES indicacao_status(id),
  observacoes TEXT,
  data_indicacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  -- Responsável pelo acompanhamento da indicação (pode ser diferente de quem cadastrou).
  -- Adicionada em 25/08/2026 via ALTER TABLE porque faltava no banco de produção;
  -- mantida aqui para que uma nova instalação do zero já saia com a coluna certa.
  responsavel_id UUID REFERENCES auth.users(id),
  -- updated_at e data_fechamento também foram adicionadas depois via ALTER TABLE.
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now()),
  data_fechamento TIMESTAMP WITH TIME ZONE,
  -- Número de protocolo legível (ex: IND-2026-000042), gerado automaticamente
  -- pelo trigger trg_gerar_protocolo_indicacao logo abaixo. Adicionado em
  -- 28/08/2026 (ver supabase_migration_protocolo_historico.sql).
  protocolo TEXT UNIQUE
);

-- Sequência usada para gerar o número de protocolo das indicações
CREATE SEQUENCE indicacoes_protocolo_seq START 1;

CREATE OR REPLACE FUNCTION gerar_protocolo_indicacao() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.protocolo IS NULL THEN
    NEW.protocolo := 'IND-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('indicacoes_protocolo_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gerar_protocolo_indicacao
BEFORE INSERT ON indicacoes
FOR EACH ROW EXECUTE PROCEDURE gerar_protocolo_indicacao();

-- Tabela: indicacao_eventos
-- Histórico imutável de auditoria de cada indicação: criação, mudança de
-- status, reatribuição de responsável e observações adicionadas. Nunca é
-- atualizada nem apagada, só recebe novas linhas — é a fonte de verdade para
-- "quem fez o quê e quando" em cada indicação. Adicionada em 28/08/2026.
CREATE TYPE tipo_evento_indicacao AS ENUM ('criacao', 'status_alterado', 'responsavel_alterado', 'observacao');

CREATE TABLE indicacao_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicacao_id UUID NOT NULL REFERENCES indicacoes(id) ON DELETE CASCADE,
  tipo tipo_evento_indicacao NOT NULL,
  autor_id UUID REFERENCES auth.users(id),
  descricao TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now())
);

-- Criação de Índices para busca rápida
CREATE INDEX idx_associados_cpf ON associados(cpf);
CREATE INDEX idx_associados_nome ON associados(nome_completo);
CREATE INDEX idx_veiculos_placa ON veiculos(placa);
CREATE INDEX idx_veiculos_associado_id ON veiculos(associado_id);
CREATE INDEX idx_avaliacoes_associado_id ON avaliacoes(associado_id);
CREATE INDEX idx_indicacoes_associado_id ON indicacoes(associado_id);
CREATE INDEX idx_criterios_avaliacao_setor_id ON criterios_avaliacao(setor_id);
CREATE INDEX idx_avaliacao_notas_avaliacao_id ON avaliacao_notas(avaliacao_id);
CREATE INDEX idx_avaliacao_notas_criterio_id ON avaliacao_notas(criterio_id);
CREATE INDEX idx_indicacao_eventos_indicacao_id ON indicacao_eventos(indicacao_id);
CREATE INDEX idx_associado_eventos_associado_id ON associado_eventos(associado_id);

-- RLS (Row Level Security)
ALTER TABLE perfis_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE associados ENABLE ROW LEVEL SECURITY;
ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE criterios_avaliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacao_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicacao_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE associado_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicacao_status ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis_usuarios
    WHERE id = auth.uid() AND papel = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Políticas para perfis_usuarios
CREATE POLICY "Usuários podem ver seu próprio perfil e admins veem todos"
ON perfis_usuarios FOR SELECT TO authenticated
USING (id = auth.uid() OR is_admin());

CREATE POLICY "Usuários podem inserir seu próprio perfil ou admins inserem"
ON perfis_usuarios FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY "Apenas admins podem atualizar perfis"
ON perfis_usuarios FOR UPDATE TO authenticated
USING (is_admin());

-- Políticas para setores
CREATE POLICY "Todos autenticados podem ver setores"
ON setores FOR SELECT TO authenticated USING (true);

CREATE POLICY "Apenas admins podem modificar setores"
ON setores FOR ALL TO authenticated USING (is_admin());

-- Políticas para convites
CREATE POLICY "Admins podem gerenciar convites"
ON convites FOR ALL TO authenticated USING (is_admin());

CREATE POLICY "Visitantes podem ler convites pelo token"
ON convites FOR SELECT TO anon USING (true);

-- Sem isso, o próprio convidado (que ainda não é admin) não conseguia
-- marcar seu convite como aceito ao concluir o cadastro em /invite/[token]
-- — ficava bloqueado pela política acima, que exige is_admin() pra UPDATE.
CREATE POLICY "Convidado pode aceitar o próprio convite"
ON convites FOR UPDATE TO authenticated
USING (status = 'pendente' AND email = auth.email())
WITH CHECK (status = 'aceito' AND email = auth.email());

-- Políticas para associados, veiculos, avaliacoes, indicacoes (Todos os autenticados)
CREATE POLICY "Autenticados podem ler/escrever associados"
ON associados FOR ALL TO authenticated USING (true);

CREATE POLICY "Autenticados podem ler/escrever veiculos"
ON veiculos FOR ALL TO authenticated USING (true);

CREATE POLICY "Autenticados podem ler/escrever avaliacoes"
ON avaliacoes FOR ALL TO authenticated USING (true);

CREATE POLICY "Autenticados podem ler/escrever indicacoes"
ON indicacoes FOR ALL TO authenticated USING (true);

-- Políticas para indicacao_status (mesmo padrão de setores: todos veem,
-- só admin configura)
CREATE POLICY "Todos autenticados podem ver indicacao_status"
ON indicacao_status FOR SELECT TO authenticated USING (true);

CREATE POLICY "Apenas admins podem modificar indicacao_status"
ON indicacao_status FOR ALL TO authenticated USING (is_admin());

-- Políticas para criterios_avaliacao (segue o mesmo padrão de setores)
-- OBS: política inferida por analogia com `setores`, não foi confirmada consultando
-- pg_policies no banco em produção. Vale conferir/ajustar se divergir.
CREATE POLICY "Todos autenticados podem ver criterios_avaliacao"
ON criterios_avaliacao FOR SELECT TO authenticated USING (true);

CREATE POLICY "Apenas admins podem modificar criterios_avaliacao"
ON criterios_avaliacao FOR ALL TO authenticated USING (is_admin());

-- Políticas para avaliacao_notas (segue o mesmo padrão de avaliacoes)
-- OBS: política inferida por analogia com `avaliacoes`, não foi confirmada
-- consultando pg_policies no banco em produção. Vale conferir/ajustar se divergir.
CREATE POLICY "Autenticados podem ler/escrever avaliacao_notas"
ON avaliacao_notas FOR ALL TO authenticated USING (true);

-- Políticas para indicacao_eventos (mesmo padrão de avaliacoes/indicacoes)
CREATE POLICY "Autenticados podem ler/escrever indicacao_eventos"
ON indicacao_eventos FOR ALL TO authenticated USING (true);

-- Registro automático de auditoria em indicacoes: grava em indicacao_eventos
-- em toda criação e em toda mudança de status ou responsável, não importa se
-- a alteração veio da tela do sistema ou de um UPDATE direto no banco.
CREATE OR REPLACE FUNCTION registrar_evento_indicacao() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO indicacao_eventos (indicacao_id, tipo, autor_id, descricao)
    VALUES (NEW.id, 'criacao', auth.uid(), 'Indicação criada');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
      INSERT INTO indicacao_eventos (indicacao_id, tipo, autor_id, valor_anterior, valor_novo)
      VALUES (
        NEW.id, 'status_alterado', auth.uid(),
        (SELECT nome FROM indicacao_status WHERE id = OLD.status_id),
        (SELECT nome FROM indicacao_status WHERE id = NEW.status_id)
      );
    END IF;
    IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
      INSERT INTO indicacao_eventos (indicacao_id, tipo, autor_id, valor_anterior, valor_novo)
      VALUES (NEW.id, 'responsavel_alterado', auth.uid(), OLD.responsavel_id::text, NEW.responsavel_id::text);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_registrar_evento_indicacao_insert
AFTER INSERT ON indicacoes
FOR EACH ROW EXECUTE PROCEDURE registrar_evento_indicacao();

CREATE TRIGGER trg_registrar_evento_indicacao_update
AFTER UPDATE ON indicacoes
FOR EACH ROW EXECUTE PROCEDURE registrar_evento_indicacao();

-- Políticas e registro automático de auditoria para associado_eventos (mesmo
-- princípio de indicacao_eventos)
CREATE POLICY "Autenticados podem ler/escrever associado_eventos"
ON associado_eventos FOR ALL TO authenticated USING (true);

CREATE OR REPLACE FUNCTION registrar_evento_associado() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO associado_eventos (associado_id, autor_id, campo, valor_novo)
    VALUES (NEW.id, auth.uid(), 'criacao', NEW.nome_completo);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.nome_completo IS DISTINCT FROM OLD.nome_completo THEN
      INSERT INTO associado_eventos (associado_id, autor_id, campo, valor_anterior, valor_novo)
      VALUES (NEW.id, auth.uid(), 'nome_completo', OLD.nome_completo, NEW.nome_completo);
    END IF;
    IF NEW.cpf IS DISTINCT FROM OLD.cpf THEN
      INSERT INTO associado_eventos (associado_id, autor_id, campo, valor_anterior, valor_novo)
      VALUES (NEW.id, auth.uid(), 'cpf', OLD.cpf, NEW.cpf);
    END IF;
    IF NEW.telefone IS DISTINCT FROM OLD.telefone THEN
      INSERT INTO associado_eventos (associado_id, autor_id, campo, valor_anterior, valor_novo)
      VALUES (NEW.id, auth.uid(), 'telefone', OLD.telefone, NEW.telefone);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_registrar_evento_associado_insert
AFTER INSERT ON associados
FOR EACH ROW EXECUTE PROCEDURE registrar_evento_associado();

CREATE TRIGGER trg_registrar_evento_associado_update
AFTER UPDATE ON associados
FOR EACH ROW EXECUTE PROCEDURE registrar_evento_associado();

-- Trigger para atualizar `updated_at` em `associados`
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_associados_modtime
BEFORE UPDATE ON associados
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- `indicacoes.updated_at` só deve avançar quando algo que representa
-- "trabalho feito na indicação" muda (status, responsável ou observações) —
-- é o valor usado para calcular há quantos dias uma indicação está parada.
CREATE OR REPLACE FUNCTION update_indicacoes_modtime() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status_id IS DISTINCT FROM OLD.status_id
     OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id
     OR NEW.observacoes IS DISTINCT FROM OLD.observacoes THEN
    NEW.updated_at = timezone('utc', now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_indicacoes_modtime
BEFORE UPDATE ON indicacoes
FOR EACH ROW EXECUTE PROCEDURE update_indicacoes_modtime();

-- Trigger legada (existia no banco antes deste projeto ter migrations
-- próprias) que também toca updated_at e, além disso, gerencia
-- data_fechamento sempre que a indicação entra/sai de um status marcado
-- como conta_como_fechado. Redundante com update_indicacoes_modtime no
-- updated_at, mas é ela quem cuida de data_fechamento — mantida por isso.
CREATE OR REPLACE FUNCTION trg_indicacoes_touch() RETURNS TRIGGER AS $$
DECLARE
  fechado_novo BOOLEAN;
  fechado_antigo BOOLEAN;
BEGIN
  NEW.updated_at = timezone('utc', now());

  SELECT conta_como_fechado INTO fechado_novo FROM indicacao_status WHERE id = NEW.status_id;

  IF TG_OP = 'UPDATE' THEN
    SELECT conta_como_fechado INTO fechado_antigo FROM indicacao_status WHERE id = OLD.status_id;
  ELSE
    fechado_antigo := false;
  END IF;

  IF COALESCE(fechado_novo, false) AND NOT COALESCE(fechado_antigo, false) THEN
    NEW.data_fechamento = timezone('utc', now());
  ELSIF NOT COALESCE(fechado_novo, false) THEN
    NEW.data_fechamento = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER indicacoes_touch
BEFORE INSERT OR UPDATE ON indicacoes
FOR EACH ROW EXECUTE PROCEDURE trg_indicacoes_touch();

-- Cria o perfil (perfis_usuarios) e marca o convite como aceito assim que o
-- usuário convidado se cadastra — via trigger em auth.users, com privilégio
-- total (não depende de sessão/RLS do navegador). O id do convite chega
-- pelos metadados do signUp() (ver app/invite/[token]/page.tsx).
CREATE OR REPLACE FUNCTION public.handle_new_user_convite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_convite_id UUID;
BEGIN
  v_convite_id := (NEW.raw_user_meta_data->>'convite_id')::UUID;

  IF v_convite_id IS NOT NULL THEN
    INSERT INTO perfis_usuarios (id, nome, funcao, papel, status)
    SELECT NEW.id, c.nome, c.funcao, c.papel, 'ativo'
    FROM convites c
    WHERE c.id = v_convite_id AND c.status = 'pendente'
    ON CONFLICT (id) DO NOTHING;

    UPDATE convites
    SET status = 'aceito', aceito_em = timezone('utc', now())
    WHERE id = v_convite_id AND status = 'pendente';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_convite
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_convite();
