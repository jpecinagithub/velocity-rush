// Shared InputSystem instance: menus use it for d-pad/stick navigation,
// the race session uses it for driving. Attached once by App.
import { InputSystem } from '../game/input.js';

let _input = null;
export function getInput() {
  if (!_input) _input = new InputSystem(() => {
    try { return JSON.parse(localStorage.getItem('velocity-rush:settings:v1')) || {}; }
    catch { return {}; }
  });
  return _input;
}
