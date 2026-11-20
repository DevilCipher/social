'use client';

import { useState } from 'react';
import { appearanceFields, palettes } from '../lib/appearance.mjs';
import { api } from '../lib/local';

export default function AppearancePanel({ initial, onSaved }) {
  const [form, setForm] = useState(initial.appearance);
  const [revision, setRevision] = useState(initial.revision);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setError('');
    setStatus('');
    setSaving(true);
    try {
      const result = await api('appearance', { method: 'POST', body: JSON.stringify({ appearance: form, revision }) });
      setForm(result.appearance);
      setRevision(result.revision);
      onSaved(result);
      setStatus('Workspace appearance saved.');
    } catch (error) { setError(error.message); }
    finally { setSaving(false); }
  }

  return <form className="card form-card appearance-editor" onSubmit={save}>
    <fieldset disabled={saving}>
      <legend>Public branding and studio copy</legend>
      {Object.entries(appearanceFields).map(([key, [label, maxLength]]) => {
        const props = { required: true, maxLength, value: form[key],
          onChange: event => setForm({ ...form, [key]: event.target.value }) };
        return <label key={key}>{label}{key === 'introduction' ? <textarea rows={3} {...props}/> : <input {...props}/>}</label>;
      })}
      <label>Accent palette<select value={form.palette} onChange={e => setForm({ ...form, palette: e.target.value })}>
        {Object.entries(palettes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
    </fieldset>
    <div className="appearance-preview" data-theme={form.palette}>
      <p className="eyebrow">{form.name}</p><h2>{form.heading}</h2><p>{form.introduction}</p>
    </div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
    <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save appearance'}</button>
  </form>;
}
