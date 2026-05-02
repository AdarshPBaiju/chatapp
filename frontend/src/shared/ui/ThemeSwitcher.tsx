import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/shared/ui/ThemeProvider";
import { cn } from "@/shared/lib/utils";

interface ThemeSwitcherProps {
  variant?: "floating" | "compact";
}

export function ThemeSwitcher({ variant = "floating" }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "system", icon: Monitor, label: "Auto" },
    { value: "dark", icon: Moon, label: "Dark" },
  ] as const;

  if (variant === "compact") {
    return (
      <div className="flex flex-col gap-2 p-1.5 rounded-2xl bg-muted/30 border border-border/50">
        {options.map(({ value, icon: Icon, label }) => {
          const isActive = theme === value;
          return (
            <button
              key={value}
              onClick={() => setTheme(value as any)}
              className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-300",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title={label}
            >
              <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="fixed top-6 right-6 z-[100]">
      <div 
        className="flex items-center p-1.5 gap-1.5 rounded-full backdrop-blur-2xl bg-card/90 border border-border shadow-2xl transition-all duration-500 hover:shadow-3xl hover:-translate-y-1"
      >
        {options.map(({ value, icon: Icon, label }) => {
          const isActive = theme === value;
          return (
            <button
              key={value}
              onClick={() => setTheme(value as any)}
              className={cn(
                "group relative flex items-center justify-center h-10 rounded-full overflow-hidden transition-all duration-500 ease-in-out",
                isActive 
                  ? "bg-primary text-primary-foreground w-[90px] shadow-sm" 
                  : "w-10 text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title={label}
            >
              <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center w-10 h-10 shrink-0">
                 <Icon 
                   size={16} 
                   strokeWidth={isActive ? 2.5 : 2}
                   className={cn("transition-all duration-500", !isActive && "-rotate-45 scale-90")} 
                 />
              </div>
              <span className={cn(
                "font-bold text-xs tracking-wide pl-7 transition-all duration-500",
                isActive ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
              )}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
