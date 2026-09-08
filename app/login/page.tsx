'use client';

import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Star, Megaphone, AlertOctagon } from 'lucide-react';
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

// Pano de fundo animado, único e contínuo por trás da tela inteira (não só
// atrás de um cartão) — grade com leve deslocamento contínuo, uma faixa de
// "aurora" varrendo a tela na diagonal, três glows à deriva (cada um com seu
// próprio período, pra não parecer sincronizado/mecânico) e uma linha de
// scan bem sutil descendo — o efeito "futurista com movimento" pedido, sem
// virar uma tela de carnaval: tudo em opacidade baixa, só o suficiente pra
// perceber que a tela está viva.
function FundoAnimado() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#03060d]">
      <style>{`
        @keyframes girow-grid-pan { from { background-position: 0 0, 0 0; } to { background-position: 88px 88px, 88px 88px; } }
        @keyframes girow-sweep { 0%, 100% { transform: translate3d(-12%, -8%, 0) rotate(10deg); opacity: 0.3; } 50% { transform: translate3d(12%, 8%, 0) rotate(10deg); opacity: 0.55; } }
        @keyframes girow-scan { from { transform: translateY(-30vh); } to { transform: translateY(130vh); } }
      `}</style>

      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
          backgroundSize: '44px 44px',
          animation: 'girow-grid-pan 16s linear infinite',
        }}
      />

      <div
        className="absolute -inset-1/2 w-[200%] h-[200%]"
        style={{
          background: 'linear-gradient(115deg, transparent 42%, rgba(59,130,246,0.10) 48%, rgba(96,165,250,0.16) 50%, rgba(59,130,246,0.10) 52%, transparent 58%)',
          animation: 'girow-sweep 17s ease-in-out infinite',
        }}
      />

      <motion.div
        className="absolute -top-40 -left-32 w-[560px] h-[560px] rounded-full bg-blue-600/20 blur-[140px]"
        animate={{ x: [0, 60, -20, 0], y: [0, 40, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-48 -right-24 w-[520px] h-[520px] rounded-full bg-indigo-500/[0.12] blur-[140px]"
        animate={{ x: [0, -50, 30, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
      <motion.div
        className="absolute top-1/3 right-1/4 w-[380px] h-[380px] rounded-full bg-cyan-400/[0.07] blur-[120px]"
        animate={{ x: [0, 30, -30, 0], y: [0, 24, -24, 0] }}
        transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />

      <div
        className="absolute inset-x-0 h-40 bg-gradient-to-b from-transparent via-blue-400/[0.05] to-transparent"
        style={{ animation: 'girow-scan 10s linear infinite' }}
      />
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get('motivo') === 'inativo' ? 'Sua conta foi desativada por um administrador. Fale com quem administra o sistema se isso for um engano.' : null
  );

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
    <div className="relative min-h-screen w-full flex flex-col md:flex-row text-[#f5f8fc] overflow-hidden">
      <FundoAnimado />

      {/* Sem cartão flutuante: cada coluna ocupa a tela de verdade, até a
          borda do navegador — o fundo animado é o mesmo por trás das duas,
          sem cor sólida separando "dentro" de "fora". */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }}
        className="relative z-10 order-2 md:order-1 md:flex-[1.15] flex flex-col justify-center px-7 py-12 sm:px-12 lg:px-20 md:py-14"
      >
        <motion.div variants={fadeUp} className="flex items-center gap-3 mb-9 md:mb-11">
          <GirowMark className="w-8 h-8 md:w-9 md:h-9 flex-shrink-0" />
          <span className="font-semibold text-[17px] md:text-lg tracking-tight">Girow</span>
          <span className="hidden sm:inline text-[10.5px] font-semibold tracking-[0.16em] text-[#5f7699] border-l border-white/10 pl-3 ml-0.5">
            NPS &amp; INDICAÇÕES
          </span>
        </motion.div>

        <motion.div variants={fadeUp} className="inline-flex items-center gap-2 text-[12.5px] text-[#9db2d6] mb-5 w-fit">
          <span className="relative flex w-[7px] h-[7px]">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
            <span className="relative inline-flex w-[7px] h-[7px] rounded-full bg-green-400" />
          </span>
          Sistema operando normalmente
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="font-semibold tracking-tight leading-[1.15] mb-4 md:mb-5 max-w-xl text-[#f5f8fc]"
          style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.35rem)' }}
        >
          Cada indicação e avaliação, <span className="text-[#60a5fa]">visível em tempo real.</span>
        </motion.h1>

        <motion.p variants={fadeUp} className="text-[14px] leading-relaxed text-[#8ea2c4] max-w-md mb-8 md:mb-10">
          O Girow reúne as avaliações de satisfação e as indicações da sua unidade em um só painel — atendentes acompanham cada caso, gestores enxergam indicações paradas antes que virem oportunidade perdida.
        </motion.p>

        <motion.div variants={fadeUp} className="flex flex-wrap gap-x-7 gap-y-4">
          {[
            { icon: Star, label: 'NPS por\nsetor' },
            { icon: Megaphone, label: 'Indicações\nrastreadas' },
            { icon: AlertOctagon, label: 'Controle de\nreclamações' },
          ].map(({ icon: Icon, label }) => (
            <motion.div key={label} whileHover={{ y: -2 }} className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[9px] bg-blue-500/[0.12] border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[11.5px] font-medium tracking-wide text-[#8ea2c4] leading-tight whitespace-pre-line">{label}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={fadeUp} className="hidden md:block text-[11.5px] text-[#4c6084] mt-14">
          © {new Date().getFullYear()} Oficinas Gênesis — todos os direitos reservados.
        </motion.div>
      </motion.div>

      {/* Linha divisória translúcida, não uma borda sólida — mantém a
          sensação de canvas único entre as duas colunas. */}
      <div className="hidden md:block relative z-10 w-px bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />

      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="relative z-10 order-1 md:order-2 md:flex-1 flex items-center justify-center px-7 py-12 sm:px-12 border-b md:border-b-0 border-white/[0.06]"
      >
        <div className="w-full max-w-[360px]">
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

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
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
            </motion.button>
          </form>

          <div className="text-center text-[10px] font-semibold tracking-[0.14em] text-[#4c6084] mt-6 mb-3.5">
            ACESSO RESTRITO
          </div>
          <p className="text-center text-[12px] text-[#4c6084] md:hidden">
            © {new Date().getFullYear()} Oficinas Gênesis
          </p>
        </div>
      </motion.div>
    </div>
  );
}