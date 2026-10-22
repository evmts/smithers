import { Component, type ReactNode } from "react"

// One plugin contribution's error boundary (decision 0017, "A failed plugin never blocks boot"): a component that
// throws, or a tab or chunk that fails to load, shows one line naming the plugin, and the shell around it stays.
export class Boundary extends Component<{ readonly plugin: string; readonly children: ReactNode }, { readonly failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    return this.state.failed
      ? <span role="alert" data-slot="plugin-failed" data-plugin={this.props.plugin}>{this.props.plugin} failed</span>
      : this.props.children
  }
}
