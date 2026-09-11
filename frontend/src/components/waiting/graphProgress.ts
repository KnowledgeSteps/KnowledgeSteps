/** One monotonic timeline shared by the percentage and both progress tracks. */
export class GraphProgressTimeline {
  private readonly startedAt: number
  private finishAt: number | null = null
  private finishFrom = 0
  readonly observedGraph: boolean
  constructor(now: number, generating: boolean) {
    this.startedAt = now
    this.observedGraph = generating
  }
  sample(now: number, complete: boolean) {
    if (!this.observedGraph) return { percent: 100, settled: true }
    const estimate = Math.min(95, 100 * (1 - Math.exp(-(now - this.startedAt) / 45000)))
    if (complete && this.finishAt === null) {
      this.finishAt = now
      this.finishFrom = estimate
    }
    if (this.finishAt === null) return { percent: estimate, settled: false }
    const elapsed = Math.max(0, now - this.finishAt)
    const t = Math.min(1, elapsed / 900)
    return {
      percent: this.finishFrom + (100 - this.finishFrom) * (1 - (1 - t) ** 3),
      settled: elapsed >= 1150,
    }
  }
}
