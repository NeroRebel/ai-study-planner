import { useState } from "react";
import type { FormEvent } from "react";
import { Save } from "lucide-react";
import { useAppData } from "../hooks/useAppData";
import type { Preferences } from "../state/appState";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { FormField } from "../components/common/FormField";

export function SettingsPage() {
  const { state, dispatch } = useAppData();
  const [form, setForm] = useState<Preferences>(state.preferences);
  const [saved, setSaved] = useState(false),
    [error, setError] = useState("");
  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (form.endTime <= form.startTime) {
      setError("Preferred study end time must be after start time.");
      return;
    }
    dispatch({
      type: "preferences",
      value: { ...form, name: form.name.trim() },
    });
    setSaved(true);
    setError("");
  }
  return (
    <div className="product-page settings-page">
      <PageHeader
        eyebrow="MAKE IT YOURS"
        title="Settings"
        description="A few preferences for your student workspace."
      />
      <form onSubmit={save} className="settings-form">
        <Panel
          title="Profile"
          subtitle="A local demo profile — no sign-in required"
        >
          <div className="settings-fields">
            <FormField label="Name">
              <input
                required
                maxLength={80}
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </FormField>
            <FormField label="Study program">
              <input
                value={form.program}
                onChange={(event) => update("program", event.target.value)}
              />
            </FormField>
            <FormField label="University">
              <input
                value={form.university}
                onChange={(event) => update("university", event.target.value)}
              />
            </FormField>
          </div>
        </Panel>
        <Panel
          title="Study preferences"
          subtitle="Preferences only; these do not generate or move sessions"
        >
          <div className="settings-fields form-grid">
            <FormField label="Preferred session duration (minutes)">
              <input
                required
                type="number"
                min="15"
                max="240"
                step="5"
                value={form.sessionMinutes}
                onChange={(event) =>
                  update("sessionMinutes", event.target.valueAsNumber || 0)
                }
              />
            </FormField>
            <FormField label="Minimum break (minutes)">
              <input
                required
                type="number"
                min="0"
                max="120"
                step="5"
                value={form.breakMinutes}
                onChange={(event) =>
                  update("breakMinutes", event.target.valueAsNumber || 0)
                }
              />
            </FormField>
            <FormField label="Preferred start time">
              <input
                required
                type="time"
                value={form.startTime}
                onChange={(event) => update("startTime", event.target.value)}
              />
            </FormField>
            <FormField label="Preferred end time">
              <input
                required
                type="time"
                value={form.endTime}
                onChange={(event) => update("endTime", event.target.value)}
              />
            </FormField>
          </div>
        </Panel>
        <Panel
          title="Planning preferences"
          subtitle="Saved locally for the future planning engine"
        >
          <div className="toggle-list">
            {(
              [
                [
                  "splitTasks",
                  "Allow splitting large tasks",
                  "Work can be split across several study blocks.",
                ],
                [
                  "earliestFirst",
                  "Prioritize earliest deadlines",
                  "Keep nearer deadlines in view.",
                ],
                [
                  "avoidEvenings",
                  "Avoid late evening sessions",
                  "Prefer focused work earlier in the day.",
                ],
              ] as const
            ).map(([key, label, description]) => (
              <label key={key}>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={form[key]}
                  onChange={(event) => update(key, event.target.checked)}
                />
              </label>
            ))}
          </div>
        </Panel>
        <Panel
          title="Appearance"
          subtitle="The approved light theme remains active in this prototype"
        >
          <div className="appearance-options">
            {(["system", "light", "dark"] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="appearance"
                  value={value}
                  checked={form.appearance === value}
                  onChange={() => update("appearance", value)}
                />
                <span>{value[0].toUpperCase() + value.slice(1)}</span>
                <small>
                  {value === "light"
                    ? "Active visual theme"
                    : "Preference preview"}
                </small>
              </label>
            ))}
          </div>
        </Panel>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {saved && (
          <p className="success-note" role="status">
            Preferences saved for this session. Reloading restores the demo
            defaults.
          </p>
        )}
        <div className="form-actions">
          <button
            className="button"
            type="button"
            onClick={() => {
              setForm(state.preferences);
              setSaved(false);
              setError("");
            }}
          >
            Reset unsaved changes
          </button>
          <button className="button button-primary" type="submit">
            <Save size={15} />
            Save preferences
          </button>
        </div>
      </form>
    </div>
  );
}
