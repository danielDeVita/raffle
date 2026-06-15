'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@apollo/client/react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  IS_PASSWORD_RESET_TOKEN_VALID_QUERY,
  RESET_PASSWORD_MUTATION,
  type IsPasswordResetTokenValidResult,
  type ResetPasswordResult,
} from '@/components/auth/password-reset-operations';
import { PasswordStrengthChecklist } from '@/components/auth/password-strength-checklist';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { passwordFieldSchema } from '@/lib/validation/password';

const resetPasswordSchema = z
  .object({
    newPassword: passwordFieldSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordPageLoader />}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, loading: validatingToken, error: validationError } =
    useQuery<IsPasswordResetTokenValidResult>(
      IS_PASSWORD_RESET_TOKEN_VALID_QUERY,
      {
        variables: { token },
        skip: !token,
      },
    );

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const password = useWatch({ control, name: 'newPassword' }) ?? '';

  const [resetPassword, { loading: resettingPassword }] =
    useMutation<ResetPasswordResult>(RESET_PASSWORD_MUTATION);

  const isTokenValid = Boolean(data?.isPasswordResetTokenValid);

  const onSubmit = async (formData: ResetPasswordForm) => {
    setErrorMsg(null);

    try {
      await resetPassword({
        variables: {
          input: {
            token,
            newPassword: formData.newPassword,
          },
        },
      });
      toast.success('Tu contraseña fue actualizada. Ya podés iniciar sesión.');
      router.push('/auth/login');
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'No pudimos actualizar tu contraseña. Intentá nuevamente.',
      );
    }
  };

  if (!token || (!validatingToken && (!isTokenValid || validationError))) {
    return (
      <div className="min-h-[calc(100vh-8rem)] px-4 py-8">
        <div className="container mx-auto max-w-xl">
          <Card>
            <CardHeader>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[1.35rem] border border-border/80 bg-primary text-primary-foreground shadow-lift">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <CardTitle className="text-3xl">Enlace inválido</CardTitle>
              <CardDescription className="text-base">
                El enlace no es válido o expiró. Pedí uno nuevo.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center">
              <Link
                href="/auth/forgot-password"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Pedir un enlace nuevo
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  if (validatingToken) {
    return <ResetPasswordPageLoader />;
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] px-4 py-8">
      <div className="container mx-auto max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,430px)] lg:items-stretch">
          <div
            aria-hidden="true"
            className="bg-mesh hidden overflow-hidden rounded-[2.5rem] border border-border/80 p-8 shadow-panel lg:flex lg:flex-col lg:justify-between"
          >
            <div className="space-y-6">
              <p className="editorial-kicker text-primary">LUK / Seguridad</p>
              <div className="space-y-4">
                <h1 className="font-display text-5xl leading-[0.9] text-balance xl:text-6xl">
                  Nueva contraseña
                </h1>
                <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
                  Definí una nueva contraseña para volver a entrar a tu cuenta.
                </p>
              </div>
            </div>
          </div>

          <Card className="w-full">
            <CardHeader>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[1.35rem] border border-border/80 bg-primary text-primary-foreground shadow-lift">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <CardTitle className="text-3xl">Nueva contraseña</CardTitle>
              <CardDescription className="text-base">
                Elegí una contraseña segura para tu cuenta.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {errorMsg ? (
                <div className="rounded-[1.3rem] border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
                  {errorMsg}
                </div>
              ) : null}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nueva Contraseña</Label>
                  <PasswordInput
                    id="newPassword"
                    placeholder="••••••••"
                    {...register('newPassword')}
                  />
                  {errors.newPassword ? (
                    <p className="text-sm text-destructive">
                      {errors.newPassword.message}
                    </p>
                  ) : null}
                </div>

                <PasswordStrengthChecklist password={password} />

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                  <PasswordInput
                    id="confirmPassword"
                    placeholder="••••••••"
                    {...register('confirmPassword')}
                  />
                  {errors.confirmPassword ? (
                    <p className="text-sm text-destructive">
                      {errors.confirmPassword.message}
                    </p>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  className="w-full btn-press"
                  disabled={resettingPassword || isSubmitting}
                >
                  {resettingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar nueva contraseña'
                  )}
                </Button>
              </form>
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

function ResetPasswordPageLoader() {
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-8">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
