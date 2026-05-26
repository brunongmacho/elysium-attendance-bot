"use client";

import { useState, useRef, useEffect, forwardRef, InputHTMLAttributes } from 'react';

export interface AutocompleteOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface AutocompleteProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'onSelect'> {
  options: AutocompleteOption[];
  value: string;
  onChange: (value: string) => void;
  onSelectOption?: (option: AutocompleteOption) => void;
  placeholder?: string;
  maxResults?: number;
}

export const Autocomplete = forwardRef<HTMLInputElement, AutocompleteProps>(
  ({
    options,
    value,
    onChange,
    onSelectOption,
    placeholder = 'Search...',
    maxResults = 10,
    className = '',
    ...props
  }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter options based on value
    const filteredOptions = value
      ? options
          .filter((option) =>
            option.label.toLowerCase().includes(value.toLowerCase())
          )
          .slice(0, maxResults)
      : [];

    // Close dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || filteredOptions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && filteredOptions[activeIndex]) {
            handleSelect(filteredOptions[activeIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setActiveIndex(-1);
          break;
      }
    };

    const handleSelect = (option: AutocompleteOption) => {
      onChange(option.value);
      onSelectOption?.(option);
      setIsOpen(false);
      setActiveIndex(-1);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      setIsOpen(true);
      setActiveIndex(-1);
    };

    return (
      <div ref={containerRef} className="relative">
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className={`
            w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2
            focus:outline-none focus:ring-2 focus:ring-primary transition-all
            ${className}
          `}
          role="combobox"
          aria-expanded={isOpen && filteredOptions.length > 0}
          aria-autocomplete="list"
          aria-controls="autocomplete-listbox"
          {...props}
        />

        {isOpen && filteredOptions.length > 0 && (
          <ul
            id="autocomplete-listbox"
            role="listbox"
            className="
              absolute z-50 w-full mt-1
              glass backdrop-blur-sm border border-primary/30 rounded-lg
              max-h-60 overflow-auto
              shadow-elevated-2
            "
          >
            {filteredOptions.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={index === activeIndex}
                className={`
                  flex items-center gap-2 px-3 py-2 cursor-pointer font-game text-sm
                  transition-colors
                  ${index === activeIndex
                    ? 'bg-primary/20 text-primary-bright'
                    : 'text-gray-300 hover:bg-gray-700/50'
                  }
                  ${index === 0 ? 'rounded-t-lg' : ''}
                  ${index === filteredOptions.length - 1 ? 'rounded-b-lg' : ''}
                `}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                <span className="flex-1 truncate">{option.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);

Autocomplete.displayName = 'Autocomplete';
