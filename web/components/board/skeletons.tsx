/** Loading layouts that match the real pages (design/canvas/S-*.dc.html). */

const CARD_WIDTHS = [
  ['46%', '70%'],
  ['58%', '52%'],
  ['38%', '80%'],
  ['64%', '44%'],
  ['50%', '66%'],
];

export function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading ideas" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {CARD_WIDTHS.map(([title, body], i) => (
        <div className="sk-card" key={i}>
          <div className="sk" style={{ width: 58, height: 58, flex: 'none' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            <div className="sk" style={{ width: title, height: 20, borderRadius: 8 }} />
            <div className="sk" style={{ width: '96%', height: 13 }} />
            <div className="sk" style={{ width: body, height: 13 }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <div className="sk" style={{ width: 92, height: 20 }} />
              <div className="sk" style={{ width: 70, height: 20 }} />
              <div className="sk" style={{ width: 84, height: 20 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RequestSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the request">
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="sk" style={{ width: '92%', height: 34, borderRadius: 12 }} />
          <div className="sk" style={{ width: '58%', height: 34, borderRadius: 12, marginTop: 10 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <div className="sk" style={{ width: 32, height: 32 }} />
            <div className="sk" style={{ width: 150, height: 13 }} />
          </div>
        </div>
        <div className="sk" style={{ width: 58, height: 58, flex: 'none' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
        <div className="sk" style={{ width: '96%', height: 14 }} />
        <div className="sk" style={{ width: '90%', height: 14 }} />
        <div className="sk" style={{ width: '54%', height: 14 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
        {[108, 64, 76, 58].map((w) => (
          <div key={w} className="sk" style={{ width: w, height: 32 }} />
        ))}
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '28px 0 22px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="sk" style={{ width: 20, height: 20 }} />
          <div className="sk" style={{ width: 280, height: 12 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="sk" style={{ width: 26, height: 26 }} />
            <div className="sk" style={{ width: 96, height: 12 }} />
          </div>
          <div className="sk" style={{ width: '62%', height: 13, marginLeft: 34 }} />
        </div>
      </div>
    </div>
  );
}
