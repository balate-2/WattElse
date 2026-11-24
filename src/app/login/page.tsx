'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Choisis ici le code PIN court que toi et ta famille taperez sur l'écran
const ACCESS_PIN = '2026';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (pin.trim() !== ACCESS_PIN) {
      setError('Code d’accès incorrect.');
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: 'famille@wattelse.app',
      password: 'WattElse2026!',
    });
    setLoading(false);

    if (authError) {
      setError('Erreur de connexion : ' + authError.message);
    } else {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4 text-slate-100">
      <div className="w-full max-w-sm bg-[#1e293b] border border-slate-700 rounded-2xl p-6 shadow-xl">
        <h1 className="text-2xl font-bold text-[#facc15] mb-1 text-center">WattElse</h1>
        <p className="text-sm text-slate-400 mb-6 text-center">
          Entrez le code d’accès familial
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/20 border border-rose-500 text-rose-200 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            required
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            className="w-full px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono rounded-lg bg-[#0f172a] border border-slate-600 text-[#22d3ee] focus:outline-none focus:border-[#facc15]"
          />
          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full py-2.5 rounded-lg bg-[#facc15] hover:bg-yellow-300 text-slate-950 font-bold transition disabled:opacity-50"
          >
            {loading ? 'Ouverture...' : 'Déverrouiller'}
          </button>
        </form>
      </div>
    </div>
  );
}
