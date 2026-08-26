'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Star, Megaphone, AlertTriangle } from 'lucide-react';

function GirowMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <defs>
        <linearGradient id="girowRing" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="17" stroke="url(#girowRing)" strokeWidth="3.4" strokeLinecap="round" strokeDasharray="76 32" />
      <circle cx="24" cy="24" r="9" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="34 22" transform="rotate(120 24 24)" />
    </svg>
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
    <div className="min-h-screen flex flex-col md:flex-row bg-[#070f1f] text-[#f5f8fc]">

      {/* Coluna esquerda: identidade + propósito. Some primeiro no mobile (ordem 2) para o login ficar visível sem rolar. */}
      <div
        className="order-2 md:order-1 relative overflow-hidden flex flex-col justify-center px-6 py-10 sm:px-10 md:px-14 md:py-14 md:flex-[1.35]"
        style={{
          backgroundImage: `
            radial-gradient(700px 500px at 10% 0%, rgba(59,130,246,0.16), transparent 60%),
            radial-gradient(600px 500px at 100% 100%, rgba(59,130,246,0.10), transparent 55%),
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)
          `,
          backgroundSize: 'auto, auto, 42px 42px, 42px 42px',
        }}
      >
        <div className="flex items-center gap-3 mb-8 md:mb-10">
          <GirowMark className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0" />
          <span className={`font-bold text-lg md:text-xl tracking-tight`}>Girow</span>
          <span className="hidden sm:inline text-[11px] font-semibold tracking-[0.16em] text-[#5f7699] border-l border-white/10 pl-3 ml-0.5">
            NPS &amp; INDICAÇÕES
          </span>
        </div>

        <div className="inline-flex items-center gap-2 text-[13px] text-[#9db2d6] mb-5">
          <span className="w-[7px] h-[7px] rounded-full bg-green-400 shadow-[0_0_0_3px_rgba(34,197,94,0.18)]" />
          Sistema operando normalmente
        </div>

        <h1 className={`font-bold tracking-tight leading-[1.12] mb-4 md:mb-5 max-w-xl`} style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)' }}>
          Cada indicação e avaliação, <span className="text-[#60a5fa]">visível em tempo real.</span>
        </h1>

        <p className="text-[14.5px] leading-relaxed text-[#9db2d6] max-w-md mb-8 md:mb-10">
          O Girow reúne as avaliações de satisfação e as indicações da sua unidade em um só painel — atendentes acompanham cada caso, gestores enxergam indicações paradas antes que virem oportunidade perdida.
        </p>

        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[9px] bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Star className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-[#9db2d6] leading-tight">NPS por<br />setor</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[9px] bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Megaphone className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-[#9db2d6] leading-tight">Indicações<br />rastreadas</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[9px] bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-400 flex-shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-[#9db2d6] leading-tight">Alertas de<br />atraso</span>
          </div>
        </div>

        <div className="hidden md:block text-xs text-[#5f7699] mt-12">
          © {new Date().getFullYear()} Oficinas Gênesis — todos os direitos reservados.
        </div>
      </div>

      {/* Coluna direita: formulário. Vem primeiro no mobile. */}
      <div className="order-1 md:order-2 flex items-center justify-center bg-[#0a1730] border-b md:border-b-0 md:border-l border-white/10 px-6 py-10 sm:px-10 md:px-8 md:flex-1">
        <div className="w-full max-w-[340px]">
          <h2 className={`font-bold text-2xl mb-1.5`}>Bem-vindo de volta</h2>
          <p className="text-[13.5px] text-[#9db2d6] mb-7">Acesse sua conta para acompanhar avaliações e indicações.</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-[12.5px] px-3 py-2.5 rounded-[10px] mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[12.5px] font-semibold text-[#9db2d6] mb-1.5">E-mail</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#5f7699] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white/[0.03] border border-white/10 rounded-[10px] text-sm text-white placeholder:text-[#5f7699] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="block text-[12.5px] font-semibold text-[#9db2d6]">Senha</label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#5f7699] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-white/[0.03] border border-white/10 rounded-[10px] text-sm text-white placeholder:text-[#5f7699] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f7699] hover:text-[#9db2d6]"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-70 text-white font-semibold text-[14.5px] py-3 rounded-[10px] shadow-[0_10px_24px_-10px_rgba(59,130,246,0.7)] transition-colors mt-1"
            >
              {loading ? 'Entrando...' : (
                <>
                  Entrar
                  <ArrowRight className="w-[15px] h-[15px]" />
                </>
              )}
            </button>
          </form>

          <div className="text-center text-[10.5px] font-bold tracking-[0.14em] text-[#5f7699] mt-6 mb-3.5">
            ACESSO RESTRITO
          </div>
          <p className="text-center text-[12.5px] text-[#5f7699] md:hidden">
            © {new Date().getFullYear()} Oficinas Gênesis
          </p>
        </div>
      </div>
    </div>
  );
}