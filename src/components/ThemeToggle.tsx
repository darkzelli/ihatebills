import { type ThemeMode, useTheme } from "../store/theme";

const MODES: { m: ThemeMode; label: string; title: string }[] = [
  { m: "light", label: "☀", title: "Light" },
  { m: "system", label: "Auto", title: "Follow system" },
  { m: "dark", label: "☾", title: "Dark" },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <div className="seg" role="radiogroup" aria-label="Theme">
      {MODES.map(({ m, label, title }) => (
        <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} title={title} role="radio" aria-checked={mode === m}>{label}</button>
      ))}
    </div>
  );
}
