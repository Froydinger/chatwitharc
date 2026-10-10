import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import './workspace-settings.css';

export interface WorkspaceSettingSection {
  id: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

export function WorkspaceSettingsPage({
  sections,
  activeSection,
  onSectionChange,
  children,
  footer,
}: {
  sections: WorkspaceSettingSection[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const current = sections.find(section => section.id === activeSection) ?? sections[0];

  return (
    <div className="workspace-settings-page">
      <header className="workspace-settings-intro">
        <h2>Settings</h2>
        <p>Manage your Arc account, preferences, and subscription.</p>
      </header>

      <nav className="workspace-settings-sections" aria-label="Settings sections">
        {sections.map(({ id, label, subtitle, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="workspace-settings-section-button"
            aria-current={activeSection === id ? 'page' : undefined}
            aria-pressed={activeSection === id}
            onClick={() => onSectionChange(id)}
          >
            <Icon aria-hidden="true" />
            <span><strong>{label}</strong><small>{subtitle}</small></span>
          </button>
        ))}
      </nav>

      <main className="workspace-settings-content" aria-label={current?.label ?? 'Settings'}>
        <header className="workspace-settings-section-heading">
          <h3>{current?.label ?? 'Account'}</h3>
          <p>{current?.subtitle ?? 'Identity and login'}</p>
        </header>
        {children}
      </main>
      {footer && <footer className="workspace-settings-footer">{footer}</footer>}
    </div>
  );
}
