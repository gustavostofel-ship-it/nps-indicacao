-- Habilita extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tipos ENUM
CREATE TYPE papel_usuario AS ENUM ('admin', 'atendente');
CREATE TYPE status_usuario AS ENUM ('convidado', 'ativo', 'inativo');
CREATE TYPE status_indicacao AS ENUM ('pendente', 'em_tratativa', 'fechado', 'sem_retorno');
CREATE TYPE status_convite AS ENUM ('pendente', 'aceito', 'expirado');

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
  cargo TEXT,
  funcao TEXT,
  papel papel_usuario NOT NULL DEFAULT 'atendente',
  token TEXT UNIQUE NOT NULL DEFAULT uuid_generate_v4()::text,
  status status_convite NOT NULL DEFAULT 'pendente',
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  aceito_em TIMESTAMP WITH TIME ZONE
);

-- Tabela: associados
CREATE TABLE associados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_completo TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
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

-- Tabela: avaliacoes
CREATE TABLE avaliacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  veiculo_id UUID NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  associado_id UUID NOT NULL REFERENCES associados(id) ON DELETE CASCADE,
  setor_id UUID NOT NULL REFERENCES setores(id),
  nota INTEGER NOT NULL CHECK (nota >= 0 AND nota <= 10),
  classificacao TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN nota >= 9 THEN 'promotor'
      WHEN nota >= 7 THEN 'neutro'
      ELSE 'detrator'
    END
  ) STORED,
  comentario TEXT,
  data_avaliacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  usuario_id UUID NOT NULL REFERENCES auth.users(id)
);

-- Tabela: indicacoes
CREATE TABLE indicacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  associado_id UUID NOT NULL REFERENCES associados(id) ON DELETE CASCADE,
  avaliacao_id UUID REFERENCES avaliacoes(id) ON DELETE SET NULL,
  nome_indicado TEXT NOT NULL,
  telefone_indicado TEXT NOT NULL,
  status status_indicacao NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  data_indicacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  usuario_id UUID NOT NULL REFERENCES auth.users(id)
);

-- Criação de Índices para busca rápida
CREATE INDEX idx_associados_cpf ON associados(cpf);
CREATE INDEX idx_associados_nome ON associados(nome_completo);
CREATE INDEX idx_veiculos_placa ON veiculos(placa);
CREATE INDEX idx_veiculos_associado_id ON veiculos(associado_id);
CREATE INDEX idx_avaliacoes_associado_id ON avaliacoes(associado_id);
CREATE INDEX idx_indicacoes_associado_id ON indicacoes(associado_id);

-- RLS (Row Level Security)
ALTER TABLE perfis_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE associados ENABLE ROW LEVEL SECURITY;
ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicacoes ENABLE ROW LEVEL SECURITY;

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

-- Políticas para associados, veiculos, avaliacoes, indicacoes (Todos os autenticados)
CREATE POLICY "Autenticados podem ler/escrever associados"
ON associados FOR ALL TO authenticated USING (true);

CREATE POLICY "Autenticados podem ler/escrever veiculos"
ON veiculos FOR ALL TO authenticated USING (true);

CREATE POLICY "Autenticados podem ler/escrever avaliacoes"
ON avaliacoes FOR ALL TO authenticated USING (true);

CREATE POLICY "Autenticados podem ler/escrever indicacoes"
ON indicacoes FOR ALL TO authenticated USING (true);

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
