import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useQuery } from '@apollo/client/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import ResetPasswordPage from '../page';

vi.mock('@apollo/client/react', () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ResetPasswordPage', () => {
  const mockUseMutation = vi.mocked(useMutation);
  const mockUseQuery = vi.mocked(useQuery);
  const mockUseRouter = vi.mocked(useRouter);
  const mockUseSearchParams = vi.mocked(useSearchParams);
  const mockToast = vi.mocked(toast);
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    });

    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    } as unknown as ReturnType<typeof useQuery>);
  });

  it('shows the invalid-token state when the token is missing', () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
    );
    mockUseMutation.mockReturnValue([
      vi.fn(),
      { data: undefined, loading: false, error: undefined },
    ] as unknown as ReturnType<typeof useMutation>);

    render(<ResetPasswordPage />);

    expect(
      screen.getByText(/el enlace no es válido o expiró/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /pedir un enlace nuevo/i }),
    ).toHaveAttribute('href', '/auth/forgot-password');
  });

  it('shows the invalid-token state when the token is not valid', () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('token=invalid-token') as unknown as ReturnType<
        typeof useSearchParams
      >,
    );
    mockUseQuery.mockReturnValue({
      data: { isPasswordResetTokenValid: false },
      loading: false,
      error: undefined,
    } as unknown as ReturnType<typeof useQuery>);
    mockUseMutation.mockReturnValue([
      vi.fn(),
      { data: undefined, loading: false, error: undefined },
    ] as unknown as ReturnType<typeof useMutation>);

    render(<ResetPasswordPage />);

    expect(
      screen.getByText(/el enlace no es válido o expiró/i),
    ).toBeInTheDocument();
  });

  it('submits the new password and redirects back to login when the token is valid', async () => {
    const resetPassword = vi.fn().mockResolvedValue({
      data: { resetPassword: true },
    });

    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('token=valid-token') as unknown as ReturnType<
        typeof useSearchParams
      >,
    );
    mockUseQuery.mockReturnValue({
      data: { isPasswordResetTokenValid: true },
      loading: false,
      error: undefined,
    } as unknown as ReturnType<typeof useQuery>);
    mockUseMutation.mockReturnValue([
      resetPassword,
      { data: undefined, loading: false, error: undefined },
    ] as unknown as ReturnType<typeof useMutation>);

    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'NewPassword123' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), {
      target: { value: 'NewPassword123' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /guardar nueva contraseña/i }),
    );

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith({
        variables: {
          input: {
            token: 'valid-token',
            newPassword: 'NewPassword123',
          },
        },
      });
    });

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        'Tu contraseña fue actualizada. Ya podés iniciar sesión.',
      );
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });
  });
});
