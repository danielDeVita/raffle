import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation } from '@apollo/client/react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import ForgotPasswordPage from '../page';

const { mockTurnstileEnabled } = vi.hoisted(() => ({
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

vi.mock('@/lib/public-env', () => ({
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
        <button type="button" onClick={() => onTokenChange('captcha-token')}>
          Resolver captcha
        </button>
        <span data-testid="turnstile-reset-signal">{resetSignal}</span>
      </div>
    ) : null,
}));

describe('ForgotPasswordPage', () => {
  const mockUseMutation = vi.mocked(useMutation);
  const mockUseRouter = vi.mocked(useRouter);
  const mockUseAuthStore = vi.mocked(useAuthStore);
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockTurnstileEnabled.mockReturnValue(false);

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
      setAuth: vi.fn(),
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

  function setupMutation() {
    const requestPasswordReset = vi.fn();

    mockUseMutation.mockReturnValue([
      requestPasswordReset,
      { data: undefined, loading: false, error: undefined },
    ] as unknown as ReturnType<typeof useMutation>);

    return { requestPasswordReset };
  }

  it('shows the generic success state after submitting an email', async () => {
    const { requestPasswordReset } = setupMutation();
    requestPasswordReset.mockResolvedValue({
      data: { requestPasswordReset: true },
    });

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith({
        variables: {
          input: {
            email: 'test@example.com',
            captchaToken: null,
          },
        },
      });
    });

    expect(
      await screen.findAllByText(
        /si existe una cuenta con contraseña para ese email/i,
      ),
    ).toHaveLength(3);
  });

  it('blocks submit until captcha is completed when turnstile is enabled', async () => {
    mockTurnstileEnabled.mockReturnValue(true);
    setupMutation();

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });

    expect(
      screen.getByRole('button', { name: /enviar enlace/i }),
    ).toBeDisabled();
  });
});
