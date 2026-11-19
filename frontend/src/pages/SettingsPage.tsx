import { Link } from "react-router-dom";
import { LockKeyhole, Check } from "lucide-react";
import { AccountSecurity } from "../auth/AccountSecurity";
import { PageHeader } from "../components/common/PageHeader";
import { SegmentedControl, Toggle } from "../components/common/Controls";
import { StudyPreferencesForm } from "../onboarding/StudyPreferencesForm";
import { uiPreferences, useUiPreferences } from "../state/uiPreferences";

const themes = [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }] as const;
const accents = [{ value: "gold", label: "Amber" }, { value: "red", label: "Red" }, { value: "blue", label: "Blue" }, { value: "green", label: "Green" }, { value: "violet", label: "Violet" }, { value: "teal", label: "Teal" }] as const;
const sections = ["Appearance", "Planner", "Assistant", "Accessibility", "Account & Security"];
const sectionId = (label: string) => label.toLowerCase().replaceAll(/[^a-z]+/g, "-");

export function SettingsPage() {
  const preferences = useUiPreferences();
  const update = uiPreferences.update;
  return <div className="product-page settings-page">
    <PageHeader eyebrow="WORKSPACE PREFERENCES" title="Settings" description="Set up a workspace that works for you."
      action={<Link className="button button-secondary" to="/profile">Edit profile</Link>} />
    <p className="preference-storage-note" role="status">{uiPreferences.hasPersistenceError() ? "Preferences are active, but this browser could not save them. They may reset on reload." : "Changes save automatically on this device. Profile information is saved to your account."}</p>
    <div className="settings-layout">
      <nav className="settings-navigation" aria-label="Settings sections">{sections.map(label => <a key={label} href={"#settings-" + sectionId(label)}>{label}</a>)}</nav>
      <div className="settings-sections">
        <section className="settings-section" id="settings-appearance" aria-labelledby="appearance-title">
          <header><span className="section-number">01</span><div><h2 id="appearance-title">Appearance</h2><p>A neutral foundation, with your own accent.</p></div></header>
          <div className="preference-controls">
            <SegmentedControl label="Theme" value={preferences.theme} options={themes} onChange={theme => update({ theme })} />
            <fieldset className="accent-field"><legend>Accent color</legend><div className="accent-options">{accents.map(accent => <label key={accent.value} className={"accent-option accent-" + accent.value}>
              <input type="radio" name="accent" aria-label={accent.label + " accent"} checked={preferences.accent === accent.value} onChange={() => update({ accent: accent.value })} />
              <span className="accent-swatch" aria-hidden="true">{preferences.accent === accent.value && <Check size={15} />}</span><span>{accent.label}</span>
            </label>)}</div></fieldset>
          </div>
        </section>
        <section className="settings-section" id="settings-planner" aria-labelledby="planner-title">
          <header><span className="section-number">02</span><div><h2 id="planner-title">Planner</h2><p>Defaults for manual blocks, without changing the planning engine.</p></div></header>
          <div className="preference-controls">
            <StudyPreferencesForm />
            <div className="policy-note"><LockKeyhole size={16} aria-hidden="true" /><div><strong>Deterministic planning policy</strong><p>Automatic planning uses deadline-first ordering, splits work when needed and respects saved availability. To avoid late sessions, adjust your availability in Calendar.</p><Link to="/calendar">Manage availability →</Link></div></div>
          </div>
        </section>
        <section className="settings-section" id="settings-assistant" aria-labelledby="assistant-title">
          <header><span className="section-number">03</span><div><h2 id="assistant-title">Assistant</h2><p>Choose how planner information is presented.</p></div></header>
          <div className="preference-controls">
            <Toggle label="Expand explanations by default" description="Open risk and replanning details in Assistant replies." checked={preferences.expandExplanations} onChange={expandExplanations => update({ expandExplanations })} />
            <Toggle label="Keep quick prompts visible" description="Show suggested questions throughout a conversation." checked={preferences.showQuickPrompts} onChange={showQuickPrompts => update({ showQuickPrompts })} />
            <div className="policy-note"><LockKeyhole size={16} aria-hidden="true" /><div><strong>Confirmation is always required</strong><p>Persistent Assistant actions always need your explicit approval. This safety policy cannot be disabled.</p></div></div>
          </div>
        </section>
        <section className="settings-section" id="settings-accessibility" aria-labelledby="accessibility-title">
          <header><span className="section-number">04</span><div><h2 id="accessibility-title">Accessibility</h2><p>Adjust legibility, spacing and movement.</p></div></header>
          <div className="preference-controls">
            <SegmentedControl label="Contrast" value={preferences.contrast} options={[{ value: "normal", label: "Normal" }, { value: "high", label: "High contrast" }]} onChange={contrast => update({ contrast })} />
            <SegmentedControl label="Motion" value={preferences.motion} options={[{ value: "system", label: "System" }, { value: "reduced", label: "Reduced" }, { value: "full", label: "Full" }]} onChange={motion => update({ motion })} />
            <SegmentedControl label="Interface spacing" value={preferences.density} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} onChange={density => update({ density })} />
          </div>
        </section>
        <section className="settings-section security-section" id="settings-account-security" aria-labelledby="security-title">
          <header><span className="section-number">05</span><div><h2 id="security-title">Account & Security</h2><p>Manage access to your personal workspace.</p></div></header>
          <div className="preference-controls"><AccountSecurity /></div>
        </section>
      </div>
    </div>
  </div>;
}
