// src/ui/components/forms/UrlInput.tsx

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function UrlInput({ value, onChange, readOnly }: UrlInputProps) {
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
