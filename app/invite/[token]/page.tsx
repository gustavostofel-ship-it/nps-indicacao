'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';

export default function InvitePage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchInvite = async () => {
      const { data, error } = await supabase
        .from('convites')
        .select('*')
        .eq('token', token)
        .eq('status', 'pendente')
        .single();
      
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

    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmarSenha) {
      setError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);

    // 1. Criar o usuário no Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: {
        data: {
          nome: invite.nome,
        }
      }
    });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    if (authData.user) {
      // 2. O usuário já é criado, RLS rules diriam que ele não tem perfil.
      // O trigger ou a inserção manual do perfil:
      const { error: profileError } = await supabase
        .from('perfis_usuarios')
        .insert({
          id: authData.user.id,
          nome: invite.nome,
          funcao: invite.funcao,
          papel: invite.papel,
          status: 'ativo'
        });
        
      if (profileError) {
        console.error('Erro ao criar perfil:', profileError);
      }

      // 3. Atualizar convite
      await supabase
        .from('convites')
        .update({ status: 'aceito', aceito_em: new Date().toISOString() })
        .eq('id', invite.id);

      router.push('/login');
    }
  };

  if (loading) return <div className="text-center py-12">Carregando convite...</div>;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center -mt-16">
       <div className="bg-red-50 text-red-600 p-6 rounded-xl shadow-sm text-center">
         <h2 className="text-xl font-bold mb-2">Ops!</h2>
         <p>{error}</p>
       </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center -mt-16">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Aceitar Convite</h2>
        <p className="text-sm text-gray-500 mb-6 text-center">Preencha seus dados de acesso para entrar no sistema.</p>
        
        <div className="bg-gray-50 p-4 rounded-md mb-6 space-y-2 text-sm border border-gray-200">
          <p><strong>Nome:</strong> {invite.nome}</p>
          <p><strong>E-mail:</strong> {invite.email}</p>
          <p><strong>Função:</strong> {invite.funcao}</p>
        </div>

        <form onSubmit={handleAccept} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Crie uma Senha</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirme a Senha</label>
            <input
              type="password"
              required
              minLength={6}
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
