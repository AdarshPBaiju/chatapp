import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/shared/ui/ThemeProvider";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "system", icon: Monitor, label: "Auto" },
    { value: "dark", icon: Moon, label: "Dark" },
  ] as const;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div 
        className="flex items-center p-1.5 gap-1.5 rounded-full backdrop-blur-2xl bg-[var(--card)]/90 border border-[var(--border)] shadow-2xl transition-all duration-500 hover:shadow-3xl hover:-translate-y-1"
        style={{
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.1), 0 0 20px rgba(0,0,0,0.02)"
        }}
      >
        {options.map(({ value, icon: Icon, label }) => {
          const isActive = theme === value;
          return (
            <button
              key={value}
              onClick={() => setTheme(value as any)}
              className={`
                group relative flex items-center justify-center h-11 rounded-full overflow-hidden
                transition-all duration-500 ease-in-out
                ${isActive 
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] w-[100px] shadow-sm" 
                  : "w-11 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
                }
              `}
              title={label}
              aria-label={label}
            >
              <div 
                className="absolute left-0 top-0 bottom-0 flex items-center justify-center w-11 h-11 shrink-0"
              >
                 <Icon 
                   size={18} 
                   strokeWidth={isActive ? 2.5 : 2}
                   className={`transition-all duration-500 ease-in-out ${isActive ? 'rotate-0 scale-100' : '-rotate-45 scale-90'}`} 
                 />
              </div>
              
              <span 
                className={`font-semibold text-sm tracking-wide whitespace-nowrap overflow-hidden transition-all duration-500 ease-in-out pl-8 ${
                  isActive ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
