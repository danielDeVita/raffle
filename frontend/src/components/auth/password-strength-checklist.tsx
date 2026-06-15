'use client';

import { Check } from 'lucide-react';
import { getPasswordRequirementState } from '@/lib/validation/password';

interface PasswordStrengthChecklistProps {
  password: string;
}

function PasswordCheck({ valid, text }: { valid: boolean; text: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 ${
        valid
          ? 'border-success/35 bg-success/10 text-success'
          : 'border-border/80 bg-background/60 text-muted-foreground'
      }`}
    >
      <Check className={`h-3 w-3 ${valid ? 'opacity-100' : 'opacity-30'}`} />
      <span>{text}</span>
    </div>
  );
}

export function PasswordStrengthChecklist({
  password,
}: PasswordStrengthChecklistProps) {
  const { hasMinLength, hasUppercase, hasLowercase, hasNumber } =
    getPasswordRequirementState(password);

  return (
    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
      <PasswordCheck valid={hasMinLength} text="8+ caracteres" />
      <PasswordCheck valid={hasUppercase} text="Una mayúscula" />
      <PasswordCheck valid={hasLowercase} text="Una minúscula" />
      <PasswordCheck valid={hasNumber} text="Un número" />
    </div>
  );
}
