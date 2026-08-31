'use client';
import React from 'react';
import Link from 'next/link';
import { Message } from './messages';

type State = { error: Error | null };
export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('powerchain:ui-error', { detail: { message: error.message, componentStack: info.componentStack } }));
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="workspace-page"><Message title="This view could not be rendered" tone="error">No transaction or account change is implied by this UI error. Reload the view before retrying an action.</Message><div className="action-row"><button className="primary" onClick={() => this.setState({ error: null })}>Retry view</button><Link className="secondary" href="/">Return to overview</Link></div></div>;
  }
}
