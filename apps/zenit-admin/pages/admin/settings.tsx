import { Check, Moon, Sun } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useTheme } from '@/contexts/ThemeContext';
export default function SettingsPage() {
  const { colorMode, changeColorMode, currentTheme, availableThemes, changeTheme } = useTheme();
  return (
    <DashboardLayout title="Aparência">
      <PageHeader title="Aparência" />
      <div className="max-w-3xl space-y-6">
        <Card headerTitle="Tema">
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { key: 'light', label: 'Claro', icon: Sun },
                { key: 'dark', label: 'Escuro', icon: Moon }
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => changeColorMode(key)}
                aria-pressed={colorMode === key}
                className={`flex min-w-0 flex-wrap items-center gap-3 rounded-lg border p-4 text-sm ${colorMode === key ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:bg-elevated'}`}
              >
                <Icon size={20} />
                {label}
                {colorMode === key && <Check size={16} className="ml-auto" />}
              </button>
            ))}
          </div>
        </Card>
        <Card headerTitle="Cor de destaque">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {availableThemes.map((theme) => (
              <button
                key={theme.key}
                onClick={() => changeTheme(theme.key)}
                aria-pressed={currentTheme === theme.key}
                className={`flex items-center gap-3 rounded-lg border p-3 text-sm text-left ${currentTheme === theme.key ? 'border-accent bg-accent-soft' : 'border-border hover:bg-elevated'}`}
              >
                <span
                  className="h-5 w-5 rounded-full shrink-0"
                  style={{ background: theme.colors.primary }}
                />
                {theme.label}
                {currentTheme === theme.key && (
                  <Check size={16} className="ml-auto shrink-0 text-accent" />
                )}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
