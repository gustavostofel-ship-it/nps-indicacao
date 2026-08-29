'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

// Fluxo: o e-mail de recuperação leva o usuário de volta aqui com um token na
// própria URL. O client do Supabase detecta esse token automaticamente
// (detectSessionInUrl, ligado por padrão) e cria uma sessão temporária —
// só então dá pra chamar updateUser({ password }). Por isso a tela começa em
// "verificando" até o evento PASSWORD_RECOVERY (ou uma sessão já pronta)
// confirmar que o link é válido.
export default function ResetPasswordPage() {
  const [status, setStatus] = useState<'verificando' | 'pronto' | 'invalido' | 'concluido'>('verificando');
  const [password, setPassword] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStatus('pronto');
    });

    // Se a sessão de recuperação já foi estabelecida antes deste efeito
    // rodar (ex: navegação rápida), o evento acima pode não disparar de
    // novo — checa diretamente também.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus((atual) => (atual === 'verificando' ? (session ? 'pronto' : 'invalido') : atual));
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
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
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setError(error.message);
    } else {
      setStatus('concluido');
      await supabase.auth.signOut();
      setTimeout(() => router.push('/login'), 2500);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#03060d] text-[#f5f8fc] px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)
            `,
            backgroundSize: '44px 44px',
          }}
        />
        <div className="absolute -top-40 -left-32 w-[560px] h-[560px] rounded-full bg-blue-600/20 blur-[140px]" />
        <div className="absolute -bottom-48 -right-24 w-[520px] h-[520px] rounded-full bg-blue-500/10 blur-[140px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[380px] rounded-[22px] overflow-hidden ring-1 ring-white/[0.08] shadow-[0_50px_140px_-40px_rgba(0,0,0,0.75)] bg-[#0d1830] px-8 py-9"
      >
        {status === 'verificando' && (
          <div className="text-center py-10">
            <span className="w-6 h-6 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin inline-block mb-4" />
            <p className="text-[13px] text-[#8ea2c4]">Verificando o link...</p>
          </div>
        )}

        {status === 'invalido' && (
          <div className="text-center py-4">
            <h2 className="font-semibold text-[19px] mb-2 text-[#f5f8fc]">Link inválido ou expirado</h2>
            <p className="text-[13px] text-[#8ea2c4] leading-relaxed mb-6">
              Este link de recuperação não é mais válido. Solicite um novo.
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold text-[14px] py-2.5 px-5 rounded-[10px] transition-all"
            >
              Solicitar novo link
            </Link>
          </div>
        )}

        {status === 'concluido' && (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
            <h2 className="font-semibold text-[19px] mb-2 text-[#f5f8fc]">Senha atualizada!</h2>
            <p className="text-[13px] text-[#8ea2c4] leading-relaxed">Redirecionando para o login...</p>
          </div>
        )}

        {status === 'pronto' && (
          <>
            <Link href="/login" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#8ea2c4] hover:text-[#f5f8fc] transition-colors mb-6">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar para o login
            </Link>

            <h2 className="font-semibold text-[20px] mb-1.5 text-[#f5f8fc]">Crie uma nova senha</h2>
            <p className="text-[13px] text-[#8ea2c4] mb-6">Escolha uma nova senha para sua conta.</p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-[12.5px] px-3 py-2.5 rounded-[10px] mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#8ea2c4] mb-1.5">Nova senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#5f7699] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-white/[0.035] border border-white/[0.08] rounded-[10px] text-sm text-white placeholder:text-[#4c6084] outline-none focus:border-blue-500 focus:bg-white/[0.05] focus:ring-2 focus:ring-blue-500/25 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f7699] hover:text-[#9db2d6] transition-colors"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#8ea2c4] mb-1.5">Confirmar nova senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#5f7699] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-white/[0.035] border border-white/[0.08] rounded-[10px] text-sm text-white placeholder:text-[#4c6084] outline-none focus:border-blue-500 focus:bg-white/[0.05] focus:ring-2 focus:ring-blue-500/25 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 active:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[14px] py-2.5 rounded-[10px] shadow-[0_10px_24px_-10px_rgba(59,130,246,0.7)] transition-all mt-1"
              >
                {submitting ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    Salvar nova senha
                    <ArrowRight className="w-[15px] h-[15px]" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
