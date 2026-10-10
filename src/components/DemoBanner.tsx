export function DemoBanner() {
  if (typeof window === 'undefined' || window.location.hostname !== 'app.dash5.id') return null;
  return (
    <aside className="demo-banner" aria-label="Demo access for portfolio review">
      <div className="demo-banner-title"><strong>Demo access</strong><span>For portfolio review</span></div>
      <p>Contact us for sign-in details.</p>
      <a href="mailto:alvianur@dash5.id">Request demo access</a>
    </aside>
  );
}
