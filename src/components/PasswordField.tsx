import { useState } from 'react';
import { Eye, EyeOff, Check, Circle } from 'lucide-react';
import { validatePassword, type PasswordValidation } from '../utils/passwordValidation';
import './PasswordField.css';

const RULES: { key: keyof Omit<PasswordValidation, 'allMet'>; label: string }[] = [
  { key: 'length', label: 'At least 8 characters' },
  { key: 'upper', label: 'One uppercase letter' },
  { key: 'lower', label: 'One lowercase letter' },
  { key: 'digit', label: 'One number' },
  { key: 'special', label: 'One special character' },
];

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showRequirements?: boolean;
  autoComplete?: 'new-password' | 'current-password';
  name?: string;
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  showRequirements = false,
  autoComplete = 'new-password',
  name,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const validation = validatePassword(value);
  const showChecklist = showRequirements && value.length > 0;

  return (
    <div className="auth-card__field password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field__input-wrapper">
        <input
          id={id}
          name={name ?? id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="password-field__input"
        />
        <button
          type="button"
          className="password-field__toggle"
          onClick={() => setVisible((v) => !v)}
          onMouseDown={(e) => e.preventDefault()}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {showChecklist && (
        <ul className="password-field__requirements" aria-live="polite">
          {RULES.map((rule) => {
            const met = validation[rule.key];
            return (
              <li
                key={rule.key}
                className={
                  met
                    ? 'password-field__requirement password-field__requirement--met'
                    : 'password-field__requirement'
                }
              >
                {met ? <Check size={14} /> : <Circle size={14} />}
                <span>{rule.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
