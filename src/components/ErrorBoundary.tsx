import React from 'react';

interface State { hasError: boolean }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Dash⁵] Render error:', error.message, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '16px',
        background: '#0A0A0A', color: '#F5F5F7', fontFamily: 'system-ui, sans-serif',
      }}>
        <p style={{ fontSize: '15px', color: '#86868B' }}>Terjadi kesalahan. Muat ulang untuk melanjutkan.</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 24px', borderRadius: '10px', border: 'none',
            background: '#0A84FF', color: '#fff', fontSize: '14px',
            fontWeight: 500, cursor: 'pointer',
          }}
        >
          Muat Ulang
        </button>
      </div>
    );
  }
}
