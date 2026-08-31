'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';

export default function InvitePage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchInvite = async () => {
      // Chama uma função do banco (não a tabela direto) — ela só devolve
      // dados de UM convite, e só se a gente já souber o token exato. Isso
      // evita que a tabela de convites fique listável por qualquer visitante
      // não-logado (ver supabase_migration_seguranca_convites.sql).
      // Tipado como `any`: essa função RPC não existe nos tipos gerados do
      // Supabase (não há um arquivo de tipos gerado neste projeto), então o
      // TypeScript não tem como saber os campos que ela devolve sozinho.
      const { data, error }: { data: any; error: any } = await supabase
        .rpc('buscar_convite_por_token', { p_token: token })
        .maybeSingle();

      if (error || !data) {
        setError('Convite inválido, expirado ou já utilizado.');
      } else if (!data.email) {
        // Convites gerados antes desta mudança não têm e-mail salvo — não dá
        // pra completar o cadastro sem um admin recriar o convite.
        setError('Este convite foi gerado num formato antigo, sem e-mail. Peça ao administrador para gerar um novo convite.');
      } else {
        setInvite(data);
      }
      setLoading(false);
    };

    fetchInvite();
  }, [token, supabase]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmarSenha) {
      setError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);

    // Cria o usuário no Auth. O perfil (perfis_usuarios) e a atualização do
    // convite pra "aceito" NÃO são feitos aqui pelo navegador — ficam por
    // conta de uma trigger no banco (on_auth_user_created_convite), que
    // roda com privilégio total e não depende de o navegador já ter uma
    // sessão válida neste exato instante (ver supabase_migration_trigger_
    // aceitar_convite.sql). Só precisamos mandar o id do convite nos
    // metadados pra trigger saber qual convite processar.
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: {
        data: {
          nome: invite.nome,
          convite_id: invite.id,
        }
      }
    });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    if (authData.user) {
      setSubmitting(false);
      setConcluido(true);
      // Se o projeto exigir confirmação de e-mail, authData.session vem nulo
      // aqui (usuário criado, mas ainda não pode logar até confirmar) — por
      // isso a tela de conclusão avisa sobre o e-mail em vez de já mandar
      // pro login sem explicar nada.
      setTimeout(() => router.push('/login'), 4000);
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-300">Carregando convite...</div>;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center -mt-16">
       <div className="bg-red-50 text-red-600 p-6 rounded-xl shadow-sm text-center">
         <h2 className="text-xl font-bold mb-2">Ops!</h2>
         <p>{error}</p>
       </div>
    </div>
  );

  if (concluido) return (
    <div className="min-h-screen flex items-center justify-center -mt-16">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full max-w-md text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Cadastro concluído!</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Se o sistema pedir confirmação, chega um e-mail em <strong className="text-gray-800">{invite?.email}</strong> — confere também a caixa de spam.
        </p>
        <p className="text-sm text-gray-500 mt-3">Redirecionando para o login...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center -mt-16">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Aceitar Convite</h2>
        <p className="text-sm text-gray-500 mb-6 text-center">Preencha seus dados de acesso para entrar no sistema.</p>

        <div className="bg-gray-50 p-4 rounded-md mb-6 space-y-2 text-sm border border-gray-200 text-gray-700">
          <p><strong className="text-gray-800">Nome:</strong> {invite.nome}</p>
          <p><strong className="text-gray-800">E-mail:</strong> {invite.email}</p>
          <p><strong className="text-gray-800">Função:</strong> {invite.funcao}</p>
        </div>

        <form onSubmit={handleAccept} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Crie uma Senha</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirme a Senha</label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white font-medium py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {submitting ? 'Criando conta...' : 'Concluir Cadastro'}
          </button>
        </form>
      </div>
    </div>
  );
}
