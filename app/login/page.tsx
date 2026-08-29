'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Star, Megaphone, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

function GirowMark({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-[11px] bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-[0_6px_16px_-4px_rgba(59,130,246,0.6)] ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" className="w-[58%] h-[58%]">
        <path
          d="M19 12a7 7 0 1 1-2.2-5.1"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path d="M19 5.5V11h-5.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Credenciais inválidas: ' + error.message);
      setLoading(false);
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Login feito, mas seu navegador bloqueou o armazenamento (cookies). Se estiver no Preview, abra o app em uma NOVA ABA e tente novamente.');
        setLoading(false);
        return;
      }
      router.push('/');
      router.refresh();
      setTimeout(() => setLoading(false), 2000);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#03060d] text-[#f5f8fc] px-4 py-10 sm:px-6 md:py-14">

      {/* Atmosfera de fundo: a tela deixa de ser um bloco de cor colado na borda do navegador
          e passa a ter profundidade real (glows + grid sutil) por trás do card. */}
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
        className="relative w-full max-w-[980px] rounded-[26px] overflow-hidden ring-1 ring-white/[0.08] shadow-[0_50px_140px_-40px_rgba(0,0,0,0.75)] flex flex-col md:flex-row bg-[#0a1424]"
      >

        {/* Coluna esquerda: identidade + propósito. Some primeiro no mobile (ordem 2) para o login ficar visível sem rolar. */}
        <div
          className="order-2 md:order-1 relative overflow-hidden flex flex-col justify-center px-7 py-10 sm:px-10 md:px-12 md:py-14 md:flex-[1.2]"
          style={{
            backgroundImage: `
              radial-gradient(560px 420px at 0% 0%, rgba(59,130,246,0.18), transparent 60%),
              radial-gradient(480px 420px at 100% 100%, rgba(59,130,246,0.10), transparent 55%)
            `,
            backgroundColor: '#081020',
          }}
        >
          <div className="flex items-center gap-3 mb-9 md:mb-11">
            <GirowMark className="w-8 h-8 md:w-9 md:h-9 flex-shrink-0" />
            <span className="font-semibold text-[17px] md:text-lg tracking-tight">Girow</span>
            <span className="hidden sm:inline text-[10.5px] font-semibold tracking-[0.16em] text-[#5f7699] border-l border-white/10 pl-3 ml-0.5">
              NPS &amp; INDICAÇÕES
            </span>
          </div>

          <div className="inline-flex items-center gap-2 text-[12.5px] text-[#9db2d6] mb-5 w-fit">
            <span className="relative flex w-[7px] h-[7px]">
              <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
              <span className="relative inline-flex w-[7px] h-[7px] rounded-full bg-green-400" />
            </span>
            Sistema operando normalmente
          </div>

          <h1 className="font-semibold tracking-tight leading-[1.15] mb-4 md:mb-5 max-w-xl text-[#f5f8fc]" style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.35rem)' }}>
            Cada indicação e avaliação, <span className="text-[#60a5fa]">visível em tempo real.</span>
          </h1>

          <p className="text-[14px] leading-relaxed text-[#8ea2c4] max-w-md mb-8 md:mb-10">
            O Girow reúne as avaliações de satisfação e as indicações da sua unidade em um só painel — atendentes acompanham cada caso, gestores enxergam indicações paradas antes que virem oportunidade perdida.
          </p>

          <div className="flex flex-wrap gap-x-7 gap-y-4">
            {[
              { icon: Star, label: 'NPS por\nsetor' },
              { icon: Megaphone, label: 'Indicações\nrastreadas' },
              { icon: AlertTriangle, label: 'Alertas de\natraso' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[9px] bg-blue-500/[0.12] border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[11.5px] font-medium tracking-wide text-[#8ea2c4] leading-tight whitespace-pre-line">{label}</span>
              </div>
            ))}
          </div>

          <div className="hidden md:block text-[11.5px] text-[#4c6084] mt-14">
            © {new Date().getFullYear()} Oficinas Gênesis — todos os direitos reservados.
          </div>
        </div>

        {/* Coluna direita: formulário. Vem primeiro no mobile. */}
        <div className="order-1 md:order-2 flex items-center justify-center bg-[#0d1830] border-b md:border-b-0 md:border-l border-white/[0.06] px-7 py-10 sm:px-10 md:px-10 md:flex-1">
          <div className="w-full max-w-[320px]">
            <h2 className="font-semibold text-[22px] mb-1.5 text-[#f5f8fc]">Bem-vindo de volta</h2>
            <p className="text-[13px] text-[#8ea2c4] mb-7">Acesse sua conta para acompanhar avaliações e indicações.</p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-[12.5px] px-3 py-2.5 rounded-[10px] mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
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

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="block text-[12px] font-medium text-[#8ea2c4]">Senha</label>
                  <Link href="/forgot-password" className="text-[11.5px] font-medium text-[#60a5fa] hover:text-[#8ec0fb] transition-colors">
                    Esqueci minha senha
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#5f7699] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
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

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 active:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[14px] py-2.5 rounded-[10px] shadow-[0_10px_24px_-10px_rgba(59,130,246,0.7)] hover:shadow-[0_12px_28px_-8px_rgba(59,130,246,0.8)] transition-all mt-1"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="w-[15px] h-[15px]" />
                  </>
                )}
              </button>
            </form>

            <div className="text-center text-[10px] font-semibold tracking-[0.14em] text-[#4c6084] mt-6 mb-3.5">
              ACESSO RESTRITO
            </div>
            <p className="text-center text-[12px] text-[#4c6084] md:hidden">
              © {new Date().getFullYear()} Oficinas Gênesis
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}