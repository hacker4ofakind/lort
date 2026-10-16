'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { RecordModel } from 'pocketbase';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/lort';
import { BrandMark } from '@/components/board/brand';
import { PRESETS, parseHex } from '@/lib/color';
import { errorMessage } from '@/lib/errors';
import { adminPb } from '@/lib/pb';
import { useSettings } from '@/lib/team-queries';
import { useToast } from '@/lib/toast';

export function BrandingSection() {
  const settings = useSettings().data;
  if (!settings)
    return (
      <section className="sec" id="branding" aria-busy="true">
        <h2>Branding</h2>
        <div className="sk" style={{ height: 160, borderRadius: 12, marginTop: 16 }} />
      </section>
    );
  // Re-keyed on every save, so the fields start again from what was saved.
  return <BrandingForm key={settings.updated} settings={settings} />;
}

function BrandingForm({ settings }: { settings: RecordModel }) {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState<string>(settings.appName);
  const [hex, setHex] = useState<string>(settings.primaryColor);

  const save = async (data: Record<string, unknown> | FormData, message = 'Saved') => {
    try {
      await adminPb.collection('settings').update(settings.id, data);
      await qc.invalidateQueries({ queryKey: ['settings'] });
      // Branding reaches pages through the server render (X-Lort-Config), so render again.
      router.refresh();
      toast({ message });
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  };

  const saveColour = (value: string) => {
    const v = value.trim().toLowerCase();
    if (!parseHex(v) || !v.startsWith('#')) {
      toast({ message: 'Use a hex colour like #cc3a6d.' });
      setHex(settings.primaryColor);
      return;
    }
    if (v !== settings.primaryColor) void save({ primaryColor: v }, 'Colour updated');
  };

  return (
    <section className="sec" id="branding">
      <h2>Branding</h2>
      <p className="lede">How your board looks to your users. Lort stays in the background.</p>
      <div className="set-row">
        <BrandMark size={56} />
        <div className="set-row-main">
          <b>App logo</b>
          <span>Square PNG, SVG or WebP, at least 128 px.</span>
        </div>
        <label className="lt-btn lt-btn-secondary lt-btn-sm" style={{ cursor: 'pointer' }}>
          {settings.logo ? 'Replace' : 'Upload'}
          <input
            type="file"
            accept="image/png,image/svg+xml,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const data = new FormData();
              data.set('logo', f);
              void save(data, 'Logo updated');
            }}
          />
        </label>
        {settings.logo && (
          <Button variant="ghost" size="sm" onClick={() => void save({ logo: null }, 'Logo removed')}>
            Remove
          </Button>
        )}
      </div>
      <div className="set-row">
        <div className="set-row-main">
          <b>App name</b>
          <span>Shown in the top bar, emails and the browser tab.</span>
        </div>
        <input
          className="set-field"
          aria-label="App name"
          maxLength={60}
          style={{ width: 260 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== settings.appName && void save({ appName: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className="set-row" style={{ alignItems: 'flex-start' }}>
        <div className="set-row-main">
          <b>Primary colour</b>
          <span>
            Buttons, voted stickers and everything that’s on. Lort adjusts custom colours so text on them stays readable
            in light and dark.
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
          <div
            role="radiogroup"
            aria-label="Primary colour presets"
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
          >
            {PRESETS.map((p) => (
              <button
                key={p.hex}
                type="button"
                className="swatch"
                role="radio"
                aria-label={p.name}
                aria-checked={settings.primaryColor === p.hex}
                style={{ background: p.hex }}
                onClick={() => {
                  setHex(p.hex);
                  saveColour(p.hex);
                }}
              />
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            Custom
            <input
              className="set-field"
              aria-label="Custom hex colour"
              value={hex}
              maxLength={7}
              style={{ width: 120, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
              onChange={(e) => setHex(e.target.value)}
              onBlur={() => saveColour(hex)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
