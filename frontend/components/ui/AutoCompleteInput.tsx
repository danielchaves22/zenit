// frontend/components/ui/AutocompleteInput.tsx - NOVA COR AZUL
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Clock } from 'lucide-react';

interface AutocompleteSuggestion {
  description: string;
  frequency: number;
}

interface AutocompleteInputProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSuggestionSelect?: (suggestion: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string;
  fetchSuggestions: (query: string) => Promise<AutocompleteSuggestion[]>;
  minLength?: number;
  maxSuggestions?: number;
  contextInfo?: string;
}

export function AutocompleteInput({
  id,
  label,
  value,
  onChange,
  onSuggestionSelect,
  placeholder,
  required = false,
  disabled = false,
  className = '',
  error,
  fetchSuggestions,
  minLength = 3,
  maxSuggestions = 10,
  contextInfo
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [hasFocus, setHasFocus] = useState(false);
  const [isMouseDownOnSuggestion, setIsMouseDownOnSuggestion] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Debounced fetch function
  const debouncedFetch = useCallback(
    async (query: string) => {
      if (query.length < minLength) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setIsLoading(true);
      try {
        const results = await fetchSuggestions(query);
        setSuggestions(results.slice(0, maxSuggestions));
        setShowSuggestions(results.length > 0);
        setActiveSuggestionIndex(-1);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchSuggestions, minLength, maxSuggestions]
  );

  // Handle input change with debouncing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced search
    timeoutRef.current = setTimeout(() => {
      debouncedFetch(newValue);
    }, 300); // 300ms debounce
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: AutocompleteSuggestion) => {
    onChange(suggestion.description);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
    
    if (onSuggestionSelect) {
      onSuggestionSelect(suggestion.description);
    }
    
    // Focus back to input
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Handle mouse down on suggestion (fires before onBlur)
  const handleSuggestionMouseDown = (suggestion: AutocompleteSuggestion, e: React.MouseEvent) => {
    // Prevent the blur event from hiding the dropdown
    e.preventDefault();
    e.stopPropagation();
    
    // Immediately update the value
    onChange(suggestion.description);
    
    // Call the callback
    if (onSuggestionSelect) {
      onSuggestionSelect(suggestion.description);
    }
    
    // Close the dropdown
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
    setIsMouseDownOnSuggestion(false);
    
    // Keep focus on input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  // Handle mouse up - reset the flag
  const handleSuggestionMouseUp = () => {
    setIsMouseDownOnSuggestion(false);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setActiveSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
        
      case 'Enter':
        e.preventDefault();
        if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
          handleSuggestionSelect(suggestions[activeSuggestionIndex]);
        }
        break;
        
      case 'Escape':
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
        break;
    }
  };

  // Handle input focus/blur
  const handleFocus = () => {
    setHasFocus(true);
    if (value.length >= minLength && suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    setHasFocus(false);
    // Only hide suggestions if we're not clicking on a suggestion
    if (!isMouseDownOnSuggestion) {
      setTimeout(() => {
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
      }, 100);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Highlight matching text in suggestions
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <span key={index} className="bg-[#2563eb] text-white px-1 rounded"> {/* ✅ ALTERADO */}
          {part}
        </span>
      ) : part
    );
  };

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor={id}>
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`w-full pl-3 pr-10 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-[#2563eb] ${ // ✅ ALTERADO
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          } ${error ? 'border-red-500' : ''}`}
          autoComplete="off"
        />
        
        {/* Loading or search icon */}
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-gray-400 border-t-[#2563eb] rounded-full animate-spin" /> // ✅ ALTERADO
          ) : (
            <Search size={16} className="text-gray-400" />
          )}
        </div>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && hasFocus && (
        <div 
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-[#1e2126] border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={`${suggestion.description}-${index}`}
              className={`px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-[#262b36] ${
                index === activeSuggestionIndex ? 'bg-[#262b36]' : ''
              } ${index === 0 ? 'rounded-t-lg' : ''} ${
                index === suggestions.length - 1 ? 'rounded-b-lg' : 'border-b border-gray-700'
              }`}
              onMouseDown={(e) => {
                setIsMouseDownOnSuggestion(true);
                handleSuggestionMouseDown(suggestion, e);
              }}
              onClick={(e) => {
                e.preventDefault();
                handleSuggestionSelect(suggestion);
              }}
              onMouseUp={handleSuggestionMouseUp}
              onMouseEnter={() => setActiveSuggestionIndex(index)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm truncate">
                  {highlightMatch(suggestion.description, value)}
                </div>
              </div>
              
              <div className="flex items-center gap-2 ml-3 text-xs text-gray-400">
                <Clock size={12} />
                <span>{suggestion.frequency}x</span>
              </div>
            </div>
          ))}
          
          {/* Footer info */}
          <div className="px-4 py-2 border-t border-gray-700 bg-[#151921] rounded-b-lg">
            <div className="text-xs text-gray-500 flex items-center justify-between">
              <span>{suggestions.length} sugestões encontradas</span>
              <span>↑↓ navegar • Enter selecionar • Esc fechar</span>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}