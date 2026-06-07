import { Component, type ErrorInfo, type ReactNode } from 'react'

// A render error anywhere in the tree used to unmount the whole app → blank page
// ("页面无法显示"). This boundary contains the damage to one region and offers a
// way back, so a single bad panel never takes the rest of the UI down with it.

interface Props {
  children: ReactNode
  /** Shown in the fallback, e.g. 「队伍」暂时无法显示。 */
  label?: string
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.label ?? ''}`.trim(), error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="panel error-panel">
        <div className="panel-title">
          <span>出了点问题</span>
        </div>
        <p className="error-msg">
          {this.props.label ? `「${this.props.label}」` : '这一部分'}暂时无法显示，其余部分仍可正常使用。
        </p>
        <div className="error-actions">
          <button className="btn btn-ghost" onClick={this.reset}>
            重试
          </button>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}
