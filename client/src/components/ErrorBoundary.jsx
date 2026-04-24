import { Component } from 'react';

/**
 * Simple React error boundary. Catches render-time crashes in child components
 * so we don't blank the whole page. Shows a minimal message + Reload button +
 * the error message so the user (and the team) can report what broke.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log to the console so devtools shows it; production sends could be added here
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-6 bg-red-50 border border-red-200 rounded-lg p-5">
          <div className="text-sm font-semibold text-red-800 mb-1">Something went wrong on this page</div>
          <div className="text-xs text-red-700 mb-3">Refreshing usually recovers. If it happens again, report it in Bug Bounty.</div>
          <pre className="text-[10px] text-red-600 bg-white border border-red-100 rounded p-2 overflow-auto max-h-32 mb-3">{String(this.state.error?.message || this.state.error)}</pre>
          <div className="flex gap-2">
            <button onClick={() => { this.setState({ error: null }); location.reload(); }}
              className="text-xs px-3 py-1.5 rounded bg-[#1e3a5f] text-white font-medium hover:bg-[#152a47]">
              Reload page
            </button>
            <button onClick={() => this.setState({ error: null })}
              className="text-xs px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-600 hover:border-gray-400">
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
