import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Something went wrong rendering this product.</div>
        </div>
      )
    }
    return this.props.children
  }
}
