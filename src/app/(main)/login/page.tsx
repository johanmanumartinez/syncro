"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "in" ? signIn : signUp, {});

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-semibold">{mode === "in" ? "Inicia sesión" : "Crea tu cuenta"}</h1>
      <p className="mb-6 text-sm text-zinc-500">Graba, transcribe y comparte tus videos.</p>

      <form action={action} className="card space-y-4 p-5">
        <label className="block text-sm">
          Correo
          <input name="email" type="email" required autoComplete="email" className="input mt-1" />
        </label>
        <label className="block text-sm">
          Contraseña
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            className="input mt-1"
          />
        </label>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.info && <p className="text-sm text-emerald-600">{state.info}</p>}
        <button disabled={pending} className="btn-primary w-full">
          {pending ? "Un momento…" : mode === "in" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "in" ? "up" : "in")}
        className="mt-4 w-full text-center text-sm text-zinc-500 hover:text-foreground"
      >
        {mode === "in" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
      </button>
    </div>
  );
}
