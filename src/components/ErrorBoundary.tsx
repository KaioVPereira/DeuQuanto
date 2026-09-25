import { Component, type ReactNode } from 'react'

/** Um erro de render derruba a árvore inteira; melhor mostrar o motivo do que uma tela branca. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="pt-safe px-6 py-10">
        <div className="text-xl font-bold">Algo deu errado</div>
        <pre className="mt-3 rounded-2xl bg-card p-3 text-xs whitespace-pre-wrap text-over">{this.state.error.message}</pre>
        <button onClick={() => location.reload()} className="mt-4 rounded-2xl bg-brand px-5 py-3 font-semibold text-on-brand">
          Recarregar
        </button>
      </div>
    )
  }
}
