export interface PasswordValidation {
  length: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
  allMet: boolean;
}

export function validatePassword(value: string): PasswordValidation {
  const length = value.length >= 8;
  const upper = /[A-Z]/.test(value);
  const lower = /[a-z]/.test(value);
  const digit = /[0-9]/.test(value);
  const special = /[^A-Za-z0-9]/.test(value);
  return {
    length,
    upper,
    lower,
    digit,
    special,
    allMet: length && upper && lower && digit && special,
  };
}
