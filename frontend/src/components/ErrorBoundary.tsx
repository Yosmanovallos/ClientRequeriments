import React from 'react';

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

/**
 * Top-level React error boundary — catches render-phase errors anywhere in the tree
 * and shows a recoverable error screen instead of a blank white page.
 *
 * Bug #4 fix: previously, any uncaught exception in a view crashed the entire app
 * with no recovery path. Users had to hard-refresh the browser.
 *
 * Catches: render errors, lifecycle errors, constructor errors.
 * Does NOT catch: errors in event handlers, async errors, server-side errors.
 * (those still surface through normal try/catch or rejection handlers.)
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught a render error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ error: null });
    // Best-effort: send the user back to the portal so the broken view unmounts
    window.location.hash = '';
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f7f8fa', padding: 24,
        }}>
          <div style={{
            maxWidth: 500, background: '#fff', border: '1px solid var(--line-2)',
            borderRadius: 10, padding: '32px 28px', boxShadow: 'var(--shadow-pop)',
          }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--purple)', margin: '0 0 12px' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, margin: '0 0 18px' }}>
              The application hit an unexpected error. Your work might be safe — try going back to the portal.
              If the problem keeps happening, contact your administrator.
            </p>
            <details style={{ marginBottom: 20, fontSize: 12.5, color: 'var(--muted)' }}>
              <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Technical details</summary>
              <pre style={{
                marginTop: 8, padding: 10, background: '#f4f5f7', borderRadius: 4,
                overflow: 'auto', maxHeight: 180, fontFamily: 'monospace', fontSize: 11,
              }}>{this.state.error.stack ?? this.state.error.message}</pre>
            </details>
            <button onClick={this.handleReset} className="btn-send"
              style={{ width: '100%', height: 42, borderRadius: 6 }}>
              Reload and go back
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
