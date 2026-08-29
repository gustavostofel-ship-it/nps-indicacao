'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Mail, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    // Sempre mostra a mesma mensagem de sucesso, exista ou não uma conta com
    // esse e-mail — evita que alguém use este formulário pra descobrir quais
    // e-mails têm cadastro no sistema.
    if (error) {
      setError('Não foi possível enviar o link agora. Tente novamente em instantes.');
    } else {
      setEnviado(true);
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
        <Link href="/login" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#8ea2c4] hover:text-[#f5f8fc] transition-colors mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar para o login
        </Link>

        {enviado ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
            <h2 className="font-semibold text-[19px] mb-2 text-[#f5f8fc]">Verifique seu e-mail</h2>
            <p className="text-[13px] text-[#8ea2c4] leading-relaxed">
              Se houver uma conta cadastrada com <span className="text-[#f5f8fc] font-medium">{email}</span>, enviamos um link para redefinir a senha.
            </p>
          </div>
        ) : (
          <>
            <h2 className="font-semibold text-[20px] mb-1.5 text-[#f5f8fc]">Esqueceu sua senha?</h2>
            <p className="text-[13px] text-[#8ea2c4] mb-6">Informe seu e-mail cadastrado e enviaremos um link para você criar uma nova senha.</p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-[12.5px] px-3 py-2.5 rounded-[10px] mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#8ea2c4] mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#5f7699] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@empresa.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-white/[0.035] border border-white/[0.08] rounded-[10px] text-sm text-white placeholder:text-[#4c6084] outline-none focus:border-blue-500 focus:bg-white/[0.05] focus:ring-2 focus:ring-blue-500/25 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 active:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[14px] py-2.5 rounded-[10px] shadow-[0_10px_24px_-10px_rgba(59,130,246,0.7)] transition-all mt-1"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    Enviar link de recuperação
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
