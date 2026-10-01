// D-pad / stick / arrow-key menu navigation with a focus index.
// Polls the shared InputSystem for menu edges; mouse hover also sets focus.
import { useEffect, useRef, useState, useCallback } from 'react';
import { getInput } from './inputSingleton.js';

export function useMenuNav(count, onPick, { cols = 1, onBack = null, enabled = true } = {}) {
  const [focus, setFocus] = useState(0);
  const focusRef = useRef(0);
  const pickRef = useRef(onPick);
  const backRef = useRef(onBack);
  pickRef.current = onPick;
  backRef.current = onBack;

  const set = useCallback((i) => {
    const n = ((i % count) + count) % count;
    focusRef.current = n;
    setFocus(n);
  }, [count]);

  useEffect(() => {
    focusRef.current = 0;
    setFocus(0);
  }, [count]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const inp = getInput();
      let f = focusRef.current;
      let moved = false;
      if (inp.consume('up')) { f -= cols; moved = true; }
      if (inp.consume('down')) { f += cols; moved = true; }
      if (inp.consume('left')) { f -= 1; moved = true; }
      if (inp.consume('right')) { f += 1; moved = true; }
      if (moved) set(((f % count) + count) % count);
      if (inp.consume('confirm')) pickRef.current(focusRef.current);
      if (inp.consume('back') && backRef.current) backRef.current();
    }, 110);
    return () => clearInterval(id);
  }, [count, cols, set, enabled]);

  return [focus, set];
}
