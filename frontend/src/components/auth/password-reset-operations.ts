import { gql } from '@apollo/client/core';

export const REQUEST_PASSWORD_RESET_MUTATION = gql`
  mutation RequestPasswordReset($input: RequestPasswordResetInput!) {
    requestPasswordReset(input: $input)
  }
`;

export const RESET_PASSWORD_MUTATION = gql`
  mutation ResetPassword($input: ResetPasswordInput!) {
    resetPassword(input: $input)
  }
`;

export const IS_PASSWORD_RESET_TOKEN_VALID_QUERY = gql`
  query IsPasswordResetTokenValid($token: String!) {
    isPasswordResetTokenValid(token: $token)
  }
`;

export interface RequestPasswordResetResult {
  requestPasswordReset: boolean;
}

export interface ResetPasswordResult {
  resetPassword: boolean;
}

export interface IsPasswordResetTokenValidResult {
  isPasswordResetTokenValid: boolean;
}
