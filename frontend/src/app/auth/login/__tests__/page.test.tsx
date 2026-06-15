import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation } from '@apollo/client/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import LoginPage from '../page';

const { mockGetPublicBackendUrl, mockTurnstileEnabled } = vi.hoisted(() => ({
  mockGetPublicBackendUrl: vi.fn(() => 'http://localhost:3001'),
  mockTurnstileEnabled: vi.fn(() => false),
}));

vi.mock('@apollo/client/react', () => ({
  useMutation: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/public-env', () => ({
  getPublicBackendUrl: mockGetPublicBackendUrl,
  isTurnstileEnabled: mockTurnstileEnabled,
}));

vi.mock('@/components/auth/turnstile-field', () => ({
  TurnstileField: ({
    enabled,
    onTokenChange,
    resetSignal,
  }: {
    enabled: boolean;
    onTokenChange: (token: string | null) => void;
    resetSignal: number;
  }) =>
    enabled ? (
      <div>
        <button
          type="button"
          onClick={() => {
            onTokenChange('captcha-token');
          }}
        >
          Resolver captcha
        </button>
        <span data-testid="turnstile-reset-signal">{resetSignal}</span>
      </div>
    ) : null,
}));

describe('LoginPage', () => {
  const mockUseMutation = vi.mocked(useMutation);
  const mockUseRouter = vi.mocked(useRouter);
  const mockUseAuthStore = vi.mocked(useAuthStore);
  const mockToast = vi.mocked(toast);
  const mockPush = vi.fn();
  const mockSetAuth = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockTurnstileEnabled.mockReturnValue(false);
    mockGetPublicBackendUrl.mockReturnValue('http://localhost:3001');

    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    });

    const storeState = {
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      hasHydrated: true,
      setAuth: mockSetAuth,
      getToken: vi.fn(),
      setToken: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      setLoading: vi.fn(),
      setError: vi.fn(),
      clearError: vi.fn(),
      setHasHydrated: vi.fn(),
    };

    mockUseAuthStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector(storeState);
      }

      return storeState;
    });
  });

  function setupMutations() {
    const mutationOptions = new Map<string, Record<string, unknown> | undefined>();
    const loginMutate = vi.fn();
    const completeTwoFactorMutate = vi.fn();
    const verifyMutate = vi.fn();
    const resendMutate = vi.fn();

    mockUseMutation.mockImplementation((document, options) => {
      const operationName =
        (
          document as unknown as {
            definitions?: ReadonlyArray<{
              kind?: string;
              name?: { value?: string };
            }>;
          }
        )?.definitions?.find((definition) => definition.kind === 'OperationDefinition')
          ?.name?.value ?? 'unknown';

      mutationOptions.set(
        operationName,
        options as Record<string, unknown> | undefined,
      );

      if (operationName === 'Login') {
        return [
          loginMutate,
          { data: undefined, loading: false, error: undefined },
        ] as unknown as ReturnType<typeof useMutation>;
      }

      if (operationName === 'VerifyEmail') {
        return [
          verifyMutate,
          { data: undefined, loading: false, error: undefined },
        ] as unknown as ReturnType<typeof useMutation>;
      }

      if (operationName === 'CompleteTwoFactorLogin') {
        return [
          completeTwoFactorMutate,
          { data: undefined, loading: false, error: undefined },
        ] as unknown as ReturnType<typeof useMutation>;
      }

      if (operationName === 'ResendVerificationCode') {
        return [
          resendMutate,
          { data: undefined, loading: false, error: undefined },
        ] as unknown as ReturnType<typeof useMutation>;
      }

      return [
        vi.fn(),
        { data: undefined, loading: false, error: undefined },
      ] as unknown as ReturnType<typeof useMutation>;
    });

    return {
      mutationOptions,
      loginMutate,
      completeTwoFactorMutate,
      verifyMutate,
      resendMutate,
    };
  }

  function fillLoginForm() {
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/contrasena/i), {
      target: { value: 'Password123!' },
    });
  }

  it('renders the forgot-password link below the login form', () => {
    setupMutations();

    render(<LoginPage />);

    expect(
      screen.getByRole('link', { name: /olvidé mi contraseña/i }),
    ).toHaveAttribute('href', '/auth/forgot-password');
  });

  it('stores auth and redirects on verified login', async () => {
    const { mutationOptions, loginMutate } = setupMutations();

    render(<LoginPage />);

    loginMutate.mockImplementation(async (variables) => {
      const onCompleted = mutationOptions.get('Login')?.onCompleted as
        | ((payload: unknown) => void)
        | undefined;
      onCompleted?.({
        login: {
          token: 'access-token',
          requiresVerification: false,
          user: {
            id: 'user-1',
            email: 'test@example.com',
            nombre: 'Test',
            apellido: 'User',
            role: 'USER',
          },
        },
      });

      return { data: variables };
    });

    fillLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(mockSetAuth).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
        'access-token',
      );
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('switches to inline verification when login requires email verification', async () => {
    const { mutationOptions, loginMutate } = setupMutations();

    render(<LoginPage />);

    loginMutate.mockImplementation(async () => {
      const onCompleted = mutationOptions.get('Login')?.onCompleted as
        | ((payload: unknown) => void)
        | undefined;
      onCompleted?.({
        login: {
          requiresVerification: true,
          requiresTwoFactor: false,
          message:
            'Tu email todavía no está verificado. Ingresá el código de 6 dígitos o reenviá uno nuevo.',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            nombre: 'Test',
            apellido: 'User',
            role: 'USER',
          },
        },
      });

      return { data: undefined };
    });

    fillLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByRole('heading', { name: /verificá tu email/i })).toBeInTheDocument();
    expect(
      screen.getByText(/tu email todavía no está verificado/i),
    ).toBeInTheDocument();
    expect(mockSetAuth).not.toHaveBeenCalled();
  });

  it('verifies email inline and completes login', async () => {
    const { mutationOptions, loginMutate, verifyMutate } = setupMutations();

    render(<LoginPage />);

    loginMutate.mockImplementation(async () => {
      const onCompleted = mutationOptions.get('Login')?.onCompleted as
        | ((payload: unknown) => void)
        | undefined;
      onCompleted?.({
        login: {
          requiresVerification: true,
          requiresTwoFactor: false,
          message: 'Tu email todavía no está verificado.',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            nombre: 'Test',
            apellido: 'User',
            role: 'USER',
          },
        },
      });

      return { data: undefined };
    });

    verifyMutate.mockResolvedValue({
      data: {
        verifyEmail: {
          token: 'verified-access-token',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            nombre: 'Test',
            apellido: 'User',
            role: 'USER',
            emailVerified: true,
          },
        },
      },
    });

    fillLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    const codeInput = await screen.findByLabelText(/código de verificación/i);
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verificar email/i }));

    await waitFor(() => {
      expect(verifyMutate).toHaveBeenCalledWith({
        variables: {
          userId: 'user-1',
          code: '123456',
          promotionToken: null,
        },
      });
      expect(mockSetAuth).toHaveBeenCalledWith(
        expect.objectContaining({ emailVerified: true }),
        'verified-access-token',
      );
      expect(mockToast.success).toHaveBeenCalledWith(
        '¡Email verificado! Ya podés entrar',
      );
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('switches to inline 2FA when login requires a second factor', async () => {
    const { mutationOptions, loginMutate } = setupMutations();

    render(<LoginPage />);

    loginMutate.mockImplementation(async () => {
      const onCompleted = mutationOptions.get('Login')?.onCompleted as
        | ((payload: unknown) => void)
        | undefined;
      onCompleted?.({
        login: {
          requiresVerification: false,
          requiresTwoFactor: true,
          twoFactorChallengeToken: 'challenge-token',
          message: 'Ingresá el código de tu app autenticadora.',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            nombre: 'Test',
            apellido: 'User',
            role: 'USER',
          },
        },
      });

      return { data: undefined };
    });

    fillLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(
      await screen.findByRole('heading', {
        name: /autenticación en dos pasos/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/código de tu app autenticadora/i),
    ).toBeInTheDocument();
    expect(mockSetAuth).not.toHaveBeenCalled();
  });

  it('completes login after a valid TOTP code', async () => {
    const { mutationOptions, loginMutate, completeTwoFactorMutate } =
      setupMutations();

    render(<LoginPage />);

    loginMutate.mockImplementation(async () => {
      const onCompleted = mutationOptions.get('Login')?.onCompleted as
        | ((payload: unknown) => void)
        | undefined;
      onCompleted?.({
        login: {
          requiresVerification: false,
          requiresTwoFactor: true,
          twoFactorChallengeToken: 'challenge-token',
          message: 'Ingresá el código de tu app autenticadora.',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            nombre: 'Test',
            apellido: 'User',
            role: 'USER',
          },
        },
      });

      return { data: undefined };
    });

    completeTwoFactorMutate.mockResolvedValue({
      data: {
        completeTwoFactorLogin: {
          token: '2fa-access-token',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            nombre: 'Test',
            apellido: 'User',
            role: 'USER',
          },
        },
      },
    });

    fillLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    const codeInput = await screen.findByLabelText(/código de autenticación/i);
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => {
      expect(completeTwoFactorMutate).toHaveBeenCalledWith({
        variables: {
          challengeToken: 'challenge-token',
          code: '123456',
          recoveryCode: null,
        },
      });
      expect(mockSetAuth).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
        '2fa-access-token',
      );
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('resends the verification code from the login flow', async () => {
    const { mutationOptions, loginMutate, resendMutate } = setupMutations();

    render(<LoginPage />);

    loginMutate.mockImplementation(async () => {
      const onCompleted = mutationOptions.get('Login')?.onCompleted as
        | ((payload: unknown) => void)
        | undefined;
      onCompleted?.({
        login: {
          requiresVerification: true,
          requiresTwoFactor: false,
          message: 'Tu email todavía no está verificado.',
          user: {
            id: 'user-1',
            email: 'test@example.com',
            nombre: 'Test',
            apellido: 'User',
            role: 'USER',
          },
        },
      });

      return { data: undefined };
    });

    resendMutate.mockResolvedValue({
      data: { resendVerificationCode: true },
    });

    fillLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    fireEvent.click(
      await screen.findByRole('button', { name: /reenviar código/i }),
    );

    await waitFor(() => {
      expect(resendMutate).toHaveBeenCalledWith({
        variables: { userId: 'user-1' },
      });
      expect(mockToast.success).toHaveBeenCalledWith(
        'Nuevo código enviado a tu email',
      );
    });
  });

  it('blocks login submit until captcha is completed when turnstile is enabled', async () => {
    mockTurnstileEnabled.mockReturnValue(true);
    const { loginMutate } = setupMutations();

    render(<LoginPage />);

    fillLoginForm();

    const submitButton = screen.getByRole('button', {
      name: /iniciar sesión/i,
    });
    expect(submitButton).toBeDisabled();

    fireEvent.click(submitButton);

    expect(loginMutate).not.toHaveBeenCalled();
  });

  it('sends captcha token when turnstile is enabled', async () => {
    mockTurnstileEnabled.mockReturnValue(true);
    const { loginMutate } = setupMutations();

    loginMutate.mockResolvedValue({ data: undefined });

    render(<LoginPage />);

    fillLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /resolver captcha/i }));
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(loginMutate).toHaveBeenCalledWith({
        variables: {
          email: 'test@example.com',
          password: 'Password123!',
          captchaToken: 'captcha-token',
        },
      });
    });
  });

  it('resets captcha widget after a login error when turnstile is enabled', async () => {
    mockTurnstileEnabled.mockReturnValue(true);
    const { mutationOptions, loginMutate } = setupMutations();

    render(<LoginPage />);

    loginMutate.mockImplementation(async () => {
      const onError = mutationOptions.get('Login')?.onError as
        | ((error: Error) => void)
        | undefined;
      onError?.(new Error('No pudimos validar que sos humano. Intentá nuevamente.'));
      return { data: undefined };
    });

    fillLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /resolver captcha/i }));
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByTestId('turnstile-reset-signal')).toHaveTextContent(
        '1',
      );
    });
  });
});
