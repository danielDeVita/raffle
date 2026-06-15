'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@apollo/client/react';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, Mail, ShieldAlert } from 'lucide-react';
import { TurnstileField } from '@/components/auth/turnstile-field';
import {
  REQUEST_PASSWORD_RESET_MUTATION,
  type RequestPasswordResetResult,
} from '@/components/auth/password-reset-operations';
import { isTurnstileEnabled } from '@/lib/public-env';

const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

const SUCCESS_MESSAGE =
  'Si existe una cuenta con contraseña para ese email, te enviamos un enlace para restablecerla.';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const captchaEnabled = isTurnstileEnabled();
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const [requestPasswordReset, { loading }] =
    useMutation<RequestPasswordResetResult>(REQUEST_PASSWORD_RESET_MUTATION);

  const onSubmit = async (formData: ForgotPasswordForm) => {
    if (captchaEnabled && !captchaToken) {
      setErrorMsg('Completá la verificación humana para continuar.');
      return;
    }

    setErrorMsg(null);

    try {
      await requestPasswordReset({
        variables: {
          input: {
            email: formData.email,
            captchaToken,
          },
        },
      });
      setSubmitted(true);
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'No pudimos iniciar el proceso. Intentá nuevamente.',
      );
      setCaptchaToken(null);
      setCaptchaResetSignal((currentValue) => currentValue + 1);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] px-4 py-8">
      <div className="container mx-auto max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,430px)] lg:items-stretch">
          <div
            aria-hidden="true"
            className="bg-mesh hidden overflow-hidden rounded-[2.5rem] border border-border/80 p-8 shadow-panel lg:flex lg:flex-col lg:justify-between"
          >
            <div className="space-y-6">
              <p className="editorial-kicker text-primary">
                LUK / Recuperación
              </p>
              <div className="space-y-4">
                <h1 className="font-display text-5xl leading-[0.9] text-balance xl:text-6xl">
                  {submitted ? 'Revisá tu email' : 'Olvidé mi contraseña'}
                </h1>
                <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
                  {submitted
                    ? SUCCESS_MESSAGE
                    : 'Ingresá el email de tu cuenta y te vamos a enviar un enlace para restablecer tu contraseña.'}
                </p>
              </div>
            </div>
          </div>

          <Card className="w-full">
            <CardHeader>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[1.35rem] border border-border/80 bg-primary text-primary-foreground shadow-lift">
                {submitted ? (
                  <Mail className="h-6 w-6" />
                ) : (
                  <ShieldAlert className="h-6 w-6" />
                )}
              </div>
              <CardTitle className="text-3xl">
                {submitted ? 'Revisá tu email' : 'Olvidé mi contraseña'}
              </CardTitle>
              <CardDescription className="text-base">
                {submitted
                  ? SUCCESS_MESSAGE
                  : 'Ingresá el email asociado a tu cuenta para continuar.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {submitted ? (
                <div className="rounded-[1.3rem] border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
                  {SUCCESS_MESSAGE}
                </div>
              ) : (
                <>
                  {errorMsg ? (
                    <div className="rounded-[1.3rem] border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
                      {errorMsg}
                    </div>
                  ) : null}

                  <form
                    onSubmit={handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="tu@email.com"
                        {...register('email')}
                      />
                      {errors.email ? (
                        <p className="text-sm text-destructive">
                          {errors.email.message}
                        </p>
                      ) : null}
                    </div>

                    <TurnstileField
                      enabled={captchaEnabled}
                      onTokenChange={setCaptchaToken}
                      resetSignal={captchaResetSignal}
                    />

                    <Button
                      type="submit"
                      className="w-full btn-press"
                      disabled={
                        loading || isSubmitting || (captchaEnabled && !captchaToken)
                      }
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        'Enviar enlace'
                      )}
                    </Button>
                  </form>
                </>
              )}
            </CardContent>

            <CardFooter className="justify-center">
              <Link
                href="/auth/login"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Volver al login
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
