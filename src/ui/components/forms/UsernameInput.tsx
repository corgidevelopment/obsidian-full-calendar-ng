// src/ui/components/forms/UsernameInput.tsx

interface UsernameInputProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function UsernameInput({ value, onChange, readOnly }: UsernameInputProps) {
  return (
    <input
      required
      type="text"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      readOnly={readOnly}
    />
  );
}
