import type { ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { Segmented } from "./Segmented";

function option(value: ThemePreference, title: string, icon: ReactNode) {
  return {
    value,
    title,
    label: (
      <>
        {icon}
        <span className="sr-only">{title}</span>
      </>
    ),
  };
}

const OPTIONS = [
  option("light", "Light", <Sun className="h-3.5 w-3.5" aria-hidden="true" />),
  option("dark", "Dark", <Moon className="h-3.5 w-3.5" aria-hidden="true" />),
  option("system", "Match system", <Monitor className="h-3.5 w-3.5" aria-hidden="true" />),
];

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  return (
    <Segmented
      label="Theme"
      value={preference}
      options={OPTIONS}
      onChange={setPreference}
      segmentClassName="flex items-center justify-center px-2.5"
    />
  );
}
