import { Component, type ReactNode } from 'react'

/**
 * Safety net: an unexpected error in a part of the widget shows a short message (with the error text) and a way back,
 * instead of unmounting everything and leaving a blank page. `quiet` parts (the dropdown list) just disappear.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; quiet?: boolean; onError?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('[Project Console]', error)
    this.props.onError?.()
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.quiet) return null
    return (
      <div className="gc-main">
        <div className="gc-panel gc-notice" role="alert">
          <strong>Something went wrong on this page</strong>
          <span className="gc-small gc-soft">{error.message}</span>
          <span>
            <button type="button" className="gc-btn gc-btn--primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>{' '}
            <button type="button" className="gc-btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </span>
        </div>
      </div>
    )
  }
}
