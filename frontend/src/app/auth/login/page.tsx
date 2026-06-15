'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@apollo/client/react';
import { gql } from '@apollo/client/core';
import { useAuthStore } from '@/store/auth';
import { EmailVerificationStep } from '@/components/auth/email-verification-step';
import { TwoFactorLoginStep } from '@/components/auth/two-factor-login-step';
import {
  RESEND_VERIFICATION_CODE_MUTATION,
  VERIFY_EMAIL_MUTATION,
  type ResendVerificationCodeResult,
  type VerifyEmailResult,
} from '@/components/auth/email-verification-operations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Ticket } from 'lucide-react';
import { PasswordInput } from '@/components/ui/password-input';
import { TurnstileField } from '@/components/auth/turnstile-field';
import { toast } from 'sonner';
import { getStoredSocialPromotionToken } from '@/lib/social-promotions';
import { getPublicBackendUrl, isTurnstileEnabled } from '@/lib/public-env';

const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!, $captchaToken: String) {
    login(input: { email: $email, password: $password, captchaToken: $captchaToken }) {
      token
      requiresVerification
      requiresTwoFactor
      twoFactorChallengeToken
      message
      user {
        id
        email
        nombre
        apellido
        role
      }
    }
  }
`;

const COMPLETE_TWO_FACTOR_LOGIN_MUTATION = gql`
  mutation CompleteTwoFactorLogin($challengeToken: String!, $code: String, $recoveryCode: String) {
    completeTwoFactorLogin(challengeToken: $challengeToken, code: $code, recoveryCode: $recoveryCode) {
      token
      user {
        id
        email
        nombre
        apellido
        role
      }
    }
  }
`;

const loginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(1, 'La contrasena es requerida'),
});

type LoginForm = z.infer<typeof loginSchema>;

interface LoginResult {
  login: {
    token?: string;
    requiresVerification: boolean;
    requiresTwoFactor: boolean;
    twoFactorChallengeToken?: string;
    message?: string;
    user: {
      id: string;
      email: string;
      nombre: string;
      apellido: string;
      role: 'USER' | 'ADMIN' | 'BANNED';
    };
  };
}

interface CompleteTwoFactorLoginResult {
  completeTwoFactorLogin: {
    token: string;
    user: {
      id: string;
      email: string;
      nombre: string;
      apellido: string;
      role: 'USER' | 'ADMIN' | 'BANNED';
    };
  };
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const captchaEnabled = isTurnstileEnabled();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState<'login' | 'verify' | 'twoFactor'>('login');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState<string | null>(null);
  const [twoFactorMode, setTwoFactorMode] = useState<'code' | 'recovery'>('code');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorRecoveryCode, setTwoFactorRecoveryCode] = useState('');
  const [twoFactorMessage, setTwoFactorMessage] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const [login, { loading, error }] = useMutation<LoginResult>(LOGIN_MUTATION, {
    onCompleted: (data) => {
      const loginResult = data?.login;
      if (!loginResult) {
        return;
      }

      if (loginResult.requiresVerification) {
        setPendingUserId(loginResult.user.id);
        setPendingEmail(loginResult.user.email);
        setVerificationMessage(
          loginResult.message ??
            'Tu email todavía no está verificado. Ingresá el código de 6 dígitos o reenviá uno nuevo.',
        );
        setVerificationCode('');
        setErrorMsg(null);
        setStep('verify');
        return;
      }

      if (loginResult.requiresTwoFactor && loginResult.twoFactorChallengeToken) {
        setPendingEmail(loginResult.user.email);
        setTwoFactorChallengeToken(loginResult.twoFactorChallengeToken);
        setTwoFactorMessage(
          loginResult.message ??
            'Ingresá el código de tu app autenticadora o un recovery code para continuar.',
        );
        setTwoFactorCode('');
        setTwoFactorRecoveryCode('');
        setTwoFactorMode('code');
        setErrorMsg(null);
        setStep('twoFactor');
        return;
      }

      if (loginResult.token && loginResult.user) {
        setAuth(loginResult.user, loginResult.token);
        router.push('/');
        return;
      }

      setErrorMsg('No pudimos iniciar sesión. Intentá nuevamente.');
    },
    onError: (err) => {
      // Ensure errors are captured even if the error link doesn't propagate them
      console.warn('[Login Error]', err.message);
      setErrorMsg(err.message || 'Error al iniciar sesión');
      setCaptchaToken(null);
      setCaptchaResetSignal((currentValue) => currentValue + 1);
    },
  });
  const [completeTwoFactorLoginMutation, { loading: completingTwoFactor }] =
    useMutation<CompleteTwoFactorLoginResult>(
      COMPLETE_TWO_FACTOR_LOGIN_MUTATION,
    );
  const [verifyEmailMutation, { loading: verifying }] =
    useMutation<VerifyEmailResult>(VERIFY_EMAIL_MUTATION);
  const [resendCodeMutation, { loading: resending }] =
    useMutation<ResendVerificationCodeResult>(
      RESEND_VERIFICATION_CODE_MUTATION,
    );

  // Derive error message from Apollo error
  const derivedError = step === 'login' ? error?.message || null : null;

  const onSubmit = (formData: LoginForm) => {
    if (captchaEnabled && !captchaToken) {
      setErrorMsg('Completá la verificación humana para continuar.');
      return;
    }

    setErrorMsg(null);
    void login({
      variables: {
        ...formData,
        captchaToken,
      },
    });
  };

  const onVerifySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingUserId || verificationCode.length !== 6) return;

    setErrorMsg(null);

    try {
      const result = await verifyEmailMutation({
        variables: {
          userId: pendingUserId,
          code: verificationCode,
          promotionToken: getStoredSocialPromotionToken(),
        },
      });

      if (result.data?.verifyEmail) {
        setAuth(result.data.verifyEmail.user, result.data.verifyEmail.token);
        toast.success('¡Email verificado! Ya podés entrar');
        router.push('/');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Código inválido');
    }
  };

  const onTwoFactorSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!twoFactorChallengeToken) return;

    if (twoFactorMode === 'code' && twoFactorCode.length !== 6) {
      setErrorMsg('Ingresá el código de 6 dígitos de tu app autenticadora.');
      return;
    }

    if (twoFactorMode === 'recovery' && !twoFactorRecoveryCode.trim()) {
      setErrorMsg('Ingresá un recovery code para continuar.');
      return;
    }

    setErrorMsg(null);

    try {
      const result = await completeTwoFactorLoginMutation({
        variables: {
          challengeToken: twoFactorChallengeToken,
          code: twoFactorMode === 'code' ? twoFactorCode : null,
          recoveryCode:
            twoFactorMode === 'recovery' ? twoFactorRecoveryCode.trim() : null,
        },
      });

      if (result.data?.completeTwoFactorLogin) {
        setAuth(
          result.data.completeTwoFactorLogin.user,
          result.data.completeTwoFactorLogin.token,
        );
        router.push('/');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Código de autenticación inválido',
      );
    }
  };

  const handleResendCode = async () => {
    if (!pendingUserId) return;

    try {
      await resendCodeMutation({ variables: { userId: pendingUserId } });
      toast.success('Nuevo código enviado a tu email');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Error al reenviar código',
      );
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${getPublicBackendUrl()}/auth/google`;
  };

  if (step === 'verify' && pendingUserId && pendingEmail) {
    return (
      <EmailVerificationStep
        pendingEmail={pendingEmail}
        verificationCode={verificationCode}
        onVerificationCodeChange={setVerificationCode}
        onSubmit={onVerifySubmit}
        onResend={handleResendCode}
        onBack={() => {
          setStep('login');
          setVerificationCode('');
          setVerificationMessage(null);
          setErrorMsg(null);
        }}
        verifying={verifying}
        resending={resending}
        errorMsg={errorMsg}
        notice={verificationMessage}
        backLabel="Volver al login"
      />
    );
  }

  if (step === 'twoFactor' && pendingEmail && twoFactorChallengeToken) {
    return (
      <TwoFactorLoginStep
        pendingEmail={pendingEmail}
        mode={twoFactorMode}
        code={twoFactorCode}
        recoveryCode={twoFactorRecoveryCode}
        onModeChange={(mode) => {
          setTwoFactorMode(mode);
          setErrorMsg(null);
        }}
        onCodeChange={setTwoFactorCode}
        onRecoveryCodeChange={setTwoFactorRecoveryCode}
        onSubmit={onTwoFactorSubmit}
        onBack={() => {
          setStep('login');
          setTwoFactorChallengeToken(null);
          setTwoFactorCode('');
          setTwoFactorRecoveryCode('');
          setTwoFactorMessage(null);
          setErrorMsg(null);
        }}
        loading={completingTwoFactor}
        errorMsg={errorMsg}
        notice={twoFactorMessage}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] px-4 py-8">
      <div className="container mx-auto">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,440px)] lg:items-stretch">
          <div
            aria-hidden="true"
            className="bg-mesh hidden overflow-hidden rounded-[2.5rem] border border-border/80 p-8 shadow-panel lg:flex lg:flex-col lg:justify-between"
          >
            <div className="space-y-6">
              <p className="editorial-kicker text-primary">LUK / Ingreso</p>
              <div className="space-y-4">
                <h1 className="font-display text-5xl leading-[0.9] text-balance xl:text-6xl">
                  Iniciar sesión
                </h1>
                <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
                  Ingresá a tu cuenta para participar en rifas
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.6rem] border border-border/80 bg-card/88 p-5 shadow-lift">
                <p className="editorial-kicker text-muted-foreground">Acceso</p>
                <p className="mt-3 font-display text-3xl text-primary">Seguro</p>
              </div>
              <div className="rounded-[1.6rem] border border-border/80 bg-card/88 p-5 shadow-lift">
                <p className="editorial-kicker text-muted-foreground">Cuenta</p>
                <p className="mt-3 font-display text-3xl text-secondary">Activa</p>
              </div>
            </div>
          </div>

          <Card className="w-full">
            <CardHeader className="pb-4">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[1.35rem] border border-border/80 bg-primary text-primary-foreground shadow-lift">
                <Ticket className="h-6 w-6" />
              </div>
              <CardTitle className="text-3xl">Iniciar sesión</CardTitle>
              <CardDescription className="text-base">
                Ingresá a tu cuenta para participar en rifas
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {(errorMsg || derivedError) && (
                <div className="rounded-[1.3rem] border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
                  {errorMsg || derivedError}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contrasena</Label>
                  <PasswordInput
                    id="password"
                    placeholder="••••••••"
                    {...register('password')}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Olvidé mi contraseña
                  </Link>
                </div>

                <TurnstileField
                  enabled={captchaEnabled}
                  onTokenChange={setCaptchaToken}
                  resetSignal={captchaResetSignal}
                />

                <Button
                  type="submit"
                  className="w-full btn-press"
                  disabled={loading || isSubmitting || (captchaEnabled && !captchaToken)}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Iniciando...
                    </>
                  ) : (
                    'Iniciar sesión'
                  )}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/80" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-3 font-semibold uppercase tracking-[0.18em] text-muted-foreground">o continua con</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full btn-press"
                onClick={handleGoogleLogin}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </Button>
            </CardContent>

            <CardFooter className="justify-center pb-7">
              <p className="text-sm text-muted-foreground">
                ¿No tenés cuenta?{' '}
                <Link href="/auth/register" className="font-semibold text-primary hover:underline">
                  Registrate
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
