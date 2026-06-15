import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestPasswordResetInput, ResetPasswordInput } from './auth.input';

describe('Auth DTOs', () => {
  describe('RequestPasswordResetInput', () => {
    it('should validate a valid password reset request', async () => {
      const input = plainToInstance(RequestPasswordResetInput, {
        email: 'test@example.com',
        captchaToken: 'captcha-token',
      });

      await expect(validate(input)).resolves.toHaveLength(0);
    });

    it('should fail for invalid email addresses', async () => {
      const input = plainToInstance(RequestPasswordResetInput, {
        email: 'not-an-email',
      });

      const errors = await validate(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('email');
    });
  });

  describe('ResetPasswordInput', () => {
    it('should validate a strong new password with a token', async () => {
      const input = plainToInstance(ResetPasswordInput, {
        token: 'reset-token',
        newPassword: 'NewPassword123',
      });

      await expect(validate(input)).resolves.toHaveLength(0);
    });

    it('should fail when the new password is weak', async () => {
      const input = plainToInstance(ResetPasswordInput, {
        token: 'reset-token',
        newPassword: 'weakpass',
      });

      const errors = await validate(input);
      expect(errors).not.toHaveLength(0);
      expect(errors[0].property).toBe('newPassword');
    });
  });
});
