import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureError } from './index'

interface LqdeckErrorBoundaryProps {
  children: ReactNode
  /** Rendered instead of children after an error; a function receives the error. */
  fallback?: ReactNode | ((error: Error) => ReactNode)
}

interface LqdeckErrorBoundaryState {
  error: Error | null
}

/**
 * React error boundary that reports render errors to LQDeck (with the
 * component stack in `extra`) and renders the optional fallback.
 */
export class LqdeckErrorBoundary extends Component<LqdeckErrorBoundaryProps, LqdeckErrorBoundaryState> {
  state: LqdeckErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): LqdeckErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, { componentStack: info.componentStack ?? undefined })
  }

  render(): ReactNode {
    if (this.state.error) {
      const { fallback } = this.props

      return typeof fallback === 'function' ? fallback(this.state.error) : (fallback ?? null)
    }

    return this.props.children
  }
}

/**
 * Stable handler for reporting caught errors from event handlers and effects
 * (which error boundaries do not see).
 */
export function useLqdeckErrorHandler(): (error: unknown, extra?: Record<string, unknown>) => void {
  return captureError
}
