import { Search } from 'lucide-react';
export function ListToolbar({
  query,
  onChange,
  placeholder,
  count,
  label
}: {
  query: string;
  onChange: (value: string) => void;
  placeholder: string;
  count: number;
  label: string;
}) {
  return (
    <div className="admin-list-toolbar">
      <label className="admin-search">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">{placeholder}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </label>
      <span className="admin-list-count" role="status">
        {count} {label}
      </span>
    </div>
  );
}
