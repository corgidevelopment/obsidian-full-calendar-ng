// src/ui/components/forms/PasswordInput.tsx

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function PasswordInput({ value, onChange, readOnly }: PasswordInputProps) {
  return (
    <input
      required
      type="password"
      value={readOnly ? '••••••••' : value || ''}
      onChange={e => onChange(e.target.value)}
      readOnly={readOnly}
    />
  );
}
