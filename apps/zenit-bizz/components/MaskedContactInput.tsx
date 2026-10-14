import {
  forwardRef,
  InputHTMLAttributes,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { ContactMask, formatContactValue, normalizeContactValue } from '@/lib/contact-masks';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  mask: ContactMask;
  onChange: (value: string) => void;
};
const count = (text: string) => (text.match(/[a-z0-9]/gi) ?? []).length;
export const MaskedContactInput = forwardRef<HTMLInputElement, Props>(
  function MaskedContactInput({ value, mask, onChange, ...props }, ref) {
    const input = useRef<HTMLInputElement>(null);
    const [caret, setCaret] = useState<{ count: number } | null>(null);
    useImperativeHandle(ref, () => input.current!);
    const display = formatContactValue(value, mask);
    useLayoutEffect(() => {
      if (!caret || document.activeElement !== input.current) return;
      let position = 0,
        seen = 0;
      while (position < display.length && seen < caret.count) {
        if (/[a-z0-9]/i.test(display[position])) seen++;
        position++;
      }
      input.current?.setSelectionRange(position, position);
    }, [display, caret]);
    function change(next: string, position: number) {
      setCaret({ count: count(next.slice(0, position)) });
      onChange(normalizeContactValue(next, mask));
    }
    return (
      <input
        {...props}
        ref={input}
        value={display}
        onChange={(event) =>
          change(event.target.value, event.target.selectionStart ?? event.target.value.length)
        }
        onKeyDown={(event) => {
          if (
            !['Backspace', 'Delete'].includes(event.key) ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          )
            return;
          const element = event.currentTarget;
          let start = element.selectionStart ?? 0,
            end = element.selectionEnd ?? start;
          if (start !== end) return;
          if (event.key === 'Backspace') {
            while (start > 0 && !/[a-z0-9]/i.test(display[start - 1])) start--;
            if (start > 0) start--;
          } else {
            while (end < display.length && !/[a-z0-9]/i.test(display[end])) end++;
            if (end < display.length) end++;
          }
          event.preventDefault();
          change(display.slice(0, start) + display.slice(end), start);
        }}
      />
    );
  }
);
