'use client';

import { BoardsSection } from './boards';
import { BrandingSection } from './branding';
import { TagsSection } from './tags';
import { TeamSection } from './team';

/** One page split into sections (design/canvas/D-Settings.dc.html). Later phases add Services, Connect and Server. */
const TOC = [
  {
    group: 'Your board',
    items: [
      ['branding', 'Branding'],
      ['boards', 'Boards'],
      ['tags', 'Tags'],
      ['team', 'Team'],
    ],
  },
];

export function SettingsPage() {
  return (
    <div
      className="settings-layout"
      style={{
        maxWidth: 1040,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '190px minmax(0, 1fr)',
        gap: 32,
        alignItems: 'start',
      }}
    >
      <nav className="toc" aria-label="Settings sections" style={{ position: 'sticky', top: 24 }}>
        <h1 className="dash-h1" style={{ margin: '0 0 14px 12px' }}>
          Settings
        </h1>
        {TOC.map((g) => (
          <div key={g.group}>
            <div className="grp">{g.group}</div>
            {g.items.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <BrandingSection />
        <BoardsSection />
        <TagsSection />
        <TeamSection />
      </div>
    </div>
  );
}
