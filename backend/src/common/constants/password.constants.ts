export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 100;
export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
export const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
export const PASSWORD_NUMBER_REGEX = /[0-9]/;

export const PASSWORD_MIN_LENGTH_MESSAGE =
  'La contraseña debe tener al menos 8 caracteres';
export const PASSWORD_UPPERCASE_MESSAGE =
  'Debe contener al menos una mayúscula';
export const PASSWORD_LOWERCASE_MESSAGE =
  'Debe contener al menos una minúscula';
export const PASSWORD_NUMBER_MESSAGE = 'Debe contener al menos un número';

export function getPasswordValidationMessage(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return PASSWORD_MIN_LENGTH_MESSAGE;
  }

  if (!PASSWORD_UPPERCASE_REGEX.test(password)) {
    return PASSWORD_UPPERCASE_MESSAGE;
  }

  if (!PASSWORD_LOWERCASE_REGEX.test(password)) {
    return PASSWORD_LOWERCASE_MESSAGE;
  }

  if (!PASSWORD_NUMBER_REGEX.test(password)) {
    return PASSWORD_NUMBER_MESSAGE;
  }

  return null;
}
