interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  required?: boolean; // ADD THIS
}

export function TextInput({ value, onChange, readOnly, placeholder, required }: TextInputProps) {
  // ADD THIS
  return (
    <input
      type="text"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      readOnly={readOnly}
      placeholder={placeholder}
      required={required} // ADD THIS
    />
  );
}
