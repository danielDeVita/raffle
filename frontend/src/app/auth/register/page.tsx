'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@apollo/client/react';
import { gql } from '@apollo/client/core';
import { useAuthStore } from '@/store/auth';
import { EmailVerificationStep } from '@/components/auth/email-verification-step';
import { PasswordStrengthChecklist } from '@/components/auth/password-strength-checklist';
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
import { Loader2, Check, Shield } from 'lucide-react';
import { PasswordInput } from '@/components/ui/password-input';
import { TurnstileField } from '@/components/auth/turnstile-field';
import { toast } from 'sonner';
import {
  getStoredSocialPromotionToken,
  persistSocialPromotionToken,
} from '@/lib/social-promotions';
import { getPublicBackendUrl, isTurnstileEnabled } from '@/lib/public-env';
import { passwordFieldSchema } from '@/lib/validation/password';

const REGISTER_MUTATION = gql`
  mutation Register($email: String!, $password: String!, $nombre: String!, $apellido: String!, $fechaNacimiento: String!, $acceptTerms: Boolean!, $captchaToken: String) {
    register(input: { email: $email, password: $password, nombre: $nombre, apellido: $apellido, fechaNacimiento: $fechaNacimiento, acceptTerms: $acceptTerms, captchaToken: $captchaToken }) {
      user {
        id
        email
        nombre
      }
      requiresVerification
      message
    }
  }
`;

// Calculate minimum date (18 years ago)
const getMaxBirthDate = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().split('T')[0];
};

const registerSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(50, 'Máximo 50 caracteres'),
  apellido: z.string().min(2, 'Mínimo 2 caracteres').max(50, 'Máximo 50 caracteres'),
  email: z.string().email('Email inválido'),
  fechaNacimiento: z.string().refine((date) => {
    const birthDate = new Date(date);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 18;
  }, 'Debés ser mayor de 18 años'),
  password: passwordFieldSchema,
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'Debés aceptar los términos y condiciones',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

interface RegisterResult {
  register: {
    user: {
      id: string;
      email: string;
      nombre: string;
    };
    requiresVerification: boolean;
    message?: string;
  };
}

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const promoCode = searchParams.get('promo');
  const captchaEnabled = isTurnstileEnabled();
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);

  // Two-step flow state
  const [step, setStep] = useState<'register' | 'verify'>('register');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const promotionToken = useMemo(() => {
    if (promoCode) {
      return promoCode;
    }

    return getStoredSocialPromotionToken();
  }, [promoCode]);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (promoCode) {
      persistSocialPromotionToken(promoCode);
    }
  }, [promoCode]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      acceptTerms: false,
    },
  });

  const password = useWatch({ control, name: 'password' }) ?? '';
  const confirmPassword =
    useWatch({ control, name: 'confirmPassword' }) ?? '';

  const [registerMutation, { loading: registering }] = useMutation<RegisterResult>(REGISTER_MUTATION);
  const [verifyEmailMutation, { loading: verifying }] = useMutation<VerifyEmailResult>(VERIFY_EMAIL_MUTATION);
  const [resendCodeMutation, { loading: resending }] = useMutation<ResendVerificationCodeResult>(
    RESEND_VERIFICATION_CODE_MUTATION,
  );

  const onRegisterSubmit = async (formData: RegisterForm) => {
    if (captchaEnabled && !captchaToken) {
      setErrorMsg('Completá la verificación humana para continuar.');
      return;
    }

    setErrorMsg(null);
    const { confirmPassword: _, ...registerData } = formData;

    try {
      const result = await registerMutation({
        variables: {
          ...registerData,
          captchaToken,
        },
      });

      if (result.data?.register.requiresVerification) {
        setPendingUserId(result.data.register.user.id);
        setPendingEmail(result.data.register.user.email);
        setStep('verify');
        toast.success('Te enviamos un código de verificación a tu email');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al registrarse');
      setCaptchaToken(null);
      setCaptchaResetSignal((currentValue) => currentValue + 1);
    }
  };

  const onVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUserId || verificationCode.length !== 6) return;

    setErrorMsg(null);
    try {
      const result = await verifyEmailMutation({
        variables: {
          userId: pendingUserId,
          code: verificationCode,
          promotionToken,
        },
      });

      if (result.data?.verifyEmail) {
        setAuth(result.data.verifyEmail.user, result.data.verifyEmail.token);
        toast.success('¡Email verificado! Bienvenido');
        router.push('/');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Código inválido');
    }
  };

  const handleResendCode = async () => {
    if (!pendingUserId) return;

    try {
      await resendCodeMutation({ variables: { userId: pendingUserId } });
      toast.success('Nuevo código enviado a tu email');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reenviar código');
    }
  };

  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  // Verification step UI
  if (step === 'verify' && pendingUserId && pendingEmail) {
    return (
      <EmailVerificationStep
        pendingEmail={pendingEmail}
        verificationCode={verificationCode}
        onVerificationCodeChange={setVerificationCode}
        onSubmit={onVerifySubmit}
        onResend={handleResendCode}
        onBack={() => {
          setStep('register');
          setVerificationCode('');
          setErrorMsg(null);
        }}
        verifying={verifying}
        resending={resending}
        errorMsg={errorMsg}
        backLabel="Volver al registro"
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] px-4 py-8">
      <div className="container mx-auto">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,460px)] lg:items-start">
          <div
            aria-hidden="true"
            className="bg-mesh hidden overflow-hidden rounded-[2.5rem] border border-border/80 p-8 shadow-panel lg:flex lg:flex-col lg:justify-between"
          >
            <div className="space-y-6">
              <p className="editorial-kicker text-primary">LUK / Registro</p>
              <div className="space-y-4">
                <h1 className="font-display text-5xl leading-[0.9] text-balance xl:text-6xl">
                  Crear Cuenta
                </h1>
                <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
                  Creá tu cuenta para participar en rifas con saldo interno y pagos protegidos
                </p>
              </div>
            </div>
          </div>

          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-3xl">Crear Cuenta</CardTitle>
              <CardDescription className="text-base">
                Creá tu cuenta para participar en rifas con saldo interno y pagos protegidos
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="flex items-start gap-3 rounded-[1.35rem] border border-primary/20 bg-primary/5 p-4">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-foreground">
                  Para usar LUK debés ser mayor de 18 años. Al registrarte, confirmás tu mayoría de edad y aceptás los términos y condiciones.
                </p>
              </div>

              {errorMsg && (
                <div className="rounded-[1.3rem] border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSubmit(onRegisterSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  placeholder="Juan"
                  {...register('nombre')}
                />
                {errors.nombre && (
                  <p className="text-xs text-destructive">{errors.nombre.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="apellido">Apellido</Label>
                <Input
                  id="apellido"
                  placeholder="Perez"
                  {...register('apellido')}
                />
                {errors.apellido && (
                  <p className="text-xs text-destructive">{errors.apellido.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaNacimiento">Fecha de Nacimiento</Label>
              <Input
                id="fechaNacimiento"
                type="date"
                max={getMaxBirthDate()}
                {...register('fechaNacimiento')}
              />
              {errors.fechaNacimiento && (
                <p className="text-xs text-destructive">{errors.fechaNacimiento.message}</p>
              )}
              <p className="text-xs text-muted-foreground">Debés ser mayor de 18 años para registrarte</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="juan@email.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <PasswordInput
                id="password"
                placeholder="********"
                {...register('password')}
              />

              {/* Password strength */}
              <PasswordStrengthChecklist password={password} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
              <PasswordInput
                id="confirmPassword"
                placeholder="********"
                {...register('confirmPassword')}
              />
              {confirmPassword.length > 0 && (
                <div className="flex items-center gap-1 text-xs">
                  <Check className={`h-3 w-3 ${passwordsMatch ? 'text-success' : 'text-destructive opacity-30'}`} />
                  <span className={passwordsMatch ? 'text-success' : 'text-destructive'}>
                    {passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
                  </span>
                </div>
              )}
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <div className="flex items-start space-x-3 rounded-[1.2rem] border border-border/80 bg-background/70 p-4">
              <input
                type="checkbox"
                id="acceptTerms"
                className="mt-1 h-4 w-4 rounded border-input"
                {...register('acceptTerms')}
              />
              <Label htmlFor="acceptTerms" className="text-sm font-normal leading-snug">
                Declaro ser mayor de 18 años y acepto los{' '}
                <Link href="/legal/terminos" className="text-primary hover:underline" target="_blank">
                  términos y condiciones
                </Link>{' '}
                y la{' '}
                <Link href="/legal/privacidad" className="text-primary hover:underline" target="_blank">
                  política de privacidad
                </Link>
              </Label>
            </div>
            {errors.acceptTerms && (
              <p className="text-sm text-destructive">{errors.acceptTerms.message}</p>
            )}

            <TurnstileField
              enabled={captchaEnabled}
              onTokenChange={setCaptchaToken}
              resetSignal={captchaResetSignal}
            />

            <Button
              type="submit"
              className="w-full btn-press"
              disabled={registering || isSubmitting || (captchaEnabled && !captchaToken)}
            >
              {registering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creando cuenta...
                </>
              ) : (
                'Crear Cuenta'
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/80" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 font-semibold tracking-[0.18em] text-muted-foreground">O continua con</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full btn-press"
            onClick={() => {
              window.location.href = `${getPublicBackendUrl()}/auth/google`;
            }}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Al registrarte con Google, también aceptás los términos y condiciones y confirmás que sos mayor de 18 años.
          </p>
            </CardContent>

            <CardFooter className="justify-center">
              <p className="text-sm text-muted-foreground">
                ¿Ya tenés cuenta?{' '}
                <Link href="/auth/login" className="font-semibold text-primary hover:underline">
                  Iniciá sesión
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <RegisterPageContent />
    </Suspense>
  );
}
