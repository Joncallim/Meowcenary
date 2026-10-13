import type { RunStartIntroModel } from '../presentation/runStartIntro';
export type IntroPhase = 'brief' | 'boss' | 'consumed' | 'cancelled';
export type IntroCommand = 'continue' | 'start' | 'skip-dialogue' | 'return-menu';
export type IntroEffect = 'none' | 'show-boss' | 'begin-run' | 'return-menu';
export interface IntroSnapshot { readonly phase: IntroPhase; readonly revision: number }
export class RunStartIntroController {
  private state: IntroSnapshot = Object.freeze({ phase: 'brief', revision: 0 });
  constructor(private readonly model: RunStartIntroModel) {}
  snapshot(): IntroSnapshot { return this.state; }
  command(command: IntroCommand, revision: number): IntroEffect {
    const { phase } = this.state;
    if (revision !== this.state.revision || phase === 'consumed' || phase === 'cancelled') return 'none';
    if (command === 'return-menu') { this.advance('cancelled'); return 'return-menu'; }
    if (command === 'continue' && phase === 'brief' && this.model.boss) { this.advance('boss'); return 'show-boss'; }
    if ((command === 'start' && (phase === 'boss' || !this.model.boss)) || (command === 'skip-dialogue' && phase === 'brief' && this.model.boss)) {
      this.advance('consumed'); return 'begin-run';
    }
    return 'none';
  }
  destroy(): void { if (this.state.phase !== 'cancelled' && this.state.phase !== 'consumed') this.advance('cancelled'); }
  private advance(phase: IntroPhase): void { this.state = Object.freeze({ phase, revision: this.state.revision + 1 }); }
}
