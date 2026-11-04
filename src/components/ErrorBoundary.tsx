import { Component, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export class ErrorBoundary extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e: unknown) { console.error('Page crashed:', e); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div role="alert" className="max-w-xl mx-auto px-4 py-20 sm:py-24 text-center">
        <h1 className="display text-3xl sm:text-4xl">Something went wrong</h1>
        <p className="text-muted mt-2">This page hit an unexpected problem. The rest of Goal4U still works.</p>
        <div className="flex justify-center gap-2 mt-6"><button className="chip on" onClick={() => location.reload()}>Reload page</button><Link to="/" className="chip" onClick={() => this.setState({ err: false })}>Home</Link></div>
      </div>
    );
  }
}
