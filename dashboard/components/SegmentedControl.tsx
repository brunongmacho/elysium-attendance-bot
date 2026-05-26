"use client";

interface SegmentedControlOption {
  value: string;
  label: string;
  icon?: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function SegmentedControl({
  options,
  value,
  onChange,
  className = "",
}: SegmentedControlProps) {
  const selectedIndex = options.findIndex((opt) => opt.value === value);

  return (
    <div
      className={`inline-flex p-1 bg-gray-800/80 rounded-lg border border-gray-700 ${className}`}
      role="tablist"
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`
            relative px-6 py-2 rounded-md font-semibold text-sm
            transition-all duration-200
            ${
              value === option.value
                ? "text-white bg-primary shadow-lg shadow-primary/30"
                : "text-gray-400 hover:text-gray-300"
            }
          `}
        >
          {option.icon && <span className="mr-2">{option.icon}</span>}
          {option.label}
        </button>
      ))}
    </div>
  );
}
