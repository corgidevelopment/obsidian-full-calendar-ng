// src/ui/components/forms/DirectorySelect.tsx

import { TextInput } from './TextInput';

interface DirectorySelectProps {
  value: string;
  onChange: (value: string) => void;
  directories: string[];
  readOnly?: boolean;
}

export function DirectorySelect({ value, onChange, directories, readOnly }: DirectorySelectProps) {
  if (readOnly) {
    return <TextInput value={value || ''} onChange={() => {}} readOnly={true} />;
  }

  const dirOptions = [...directories];
  dirOptions.sort();

  return (
    <select required value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="" disabled hidden>
        Choose a directory
      </option>
      {dirOptions.map((o, idx) => (
        <option key={idx} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
