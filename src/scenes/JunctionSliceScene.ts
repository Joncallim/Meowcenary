import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import type { GameAction } from '../engine/logicalInput';
import { InputController } from '../systems/input';
import { FocusNavigator, type FocusDirection } from '../ui/focusList';
import { createUiText } from '../ui/text';
import {
  JunctionSliceModel, JUNCTION_SAVE_KEY, JUNCTION_SURFACES, JUNCTION_COVER,
  JUNCTION_CONTACT, JUNCTION_ENTRY,
  type JunctionCommandResult, type JunctionShopPreview, type JunctionSliceState,
} from '../gameplay/junctionSlice';

type Choice = Readonly<{ id: string; label: string; run: () => void }>;
type Panel = { title: string; body: string; choices: readonly Choice[]; focus: FocusNavigator };

/** A desktop technical blockout. No concept image or retired sprite is a
 * runtime binding here. Rules, combat and durable mutations live in the model. */
export class JunctionSliceScene extends Phaser.Scene {
  private model?: JunctionSliceModel;
  private controls?: InputController;
  private world?: Phaser.GameObjects.Graphics;
  private hud?: Phaser.GameObjects.Graphics;
  private status?: Phaser.GameObjects.Text;
  private squad: Phaser.GameObjects.Text[] = [];
  private hint?: Phaser.GameObjects.Text;
  private panel?: Panel;
  private panelView?: Phaser.GameObjects.Container;
  private focusBoxes: Phaser.GameObjects.Rectangle[] = [];
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private buttons: Phaser.GameObjects.Container[] = [];
  private busy = false;
  private epoch = 0;
  private commandEpoch = 0;
  private elapsed = 0;
  private viewport = { width: 0, height: 0 };
  private uiGesture = false;
  private press?: { box: Phaser.GameObjects.Rectangle; pointer: number; downTime: number; x: number; y: number };
  private message = 'Enter at dispatch to inspect the work order.';
  private shots: Array<{ from: string; to: string; remaining: number }> = [];

  constructor() { super(SceneKey.JunctionSlice); }

  create(): void {
    this.epoch += 1; this.commandEpoch += 1; this.busy = false; this.elapsed = 0; this.panel = undefined;
    this.model = undefined; this.press = undefined; this.uiGesture = false; this.viewport = { width: 0, height: 0 };
    this.shots = []; this.labels = new Map(); this.buttons = [];
    this.cameras.main.setBackgroundColor('#101820');
    this.world = this.add.graphics(); this.hud = this.add.graphics().setDepth(10);
    this.text(24, 16, 'JUNCTION VALE / dispatch workyard', 22).setWordWrapWidth(this.scale.width - 48).setDepth(11);
    this.status = this.text(24, 46, '', 14).setWordWrapWidth(this.scale.width - 48).setDepth(11);
    this.squad = [0, 1].map(index => this.text(24 + index * 330, 72, '', 14).setDepth(11));
    this.hint = this.text(24, this.scale.height - 78, '', 13).setDepth(11);
    this.controls = new InputController(this);
    this.controls.onAnyAction(edge => this.route(edge.action));
    try {
      const decoded = JunctionSliceModel.load(localStorage.getItem(JUNCTION_SAVE_KEY), bytes => {
        const durable = JunctionSliceModel.load(localStorage.getItem(JUNCTION_SAVE_KEY), () => undefined);
        if (durable.state === 'invalid' || durable.model.snapshot().revision !== this.model!.snapshot().revision)
          throw new Error('stale-or-invalid');
        localStorage.setItem(JUNCTION_SAVE_KEY, bytes);
      });
      if (decoded.state !== 'invalid') this.model = decoded.model;
    } catch { this.model = undefined; }
    this.input.on('pointerup', () => {
      this.uiGesture = false; this.press = undefined;
      if (!this.panel) this.controls?.resumeGameplayPointer();
    });
    this.input.on('pointerupoutside', () => {
      this.uiGesture = false; this.press = undefined; this.controls?.cancelPointerMovement();
      if (!this.panel) this.controls?.resumeGameplayPointer();
    });
    const interrupted = () => this.pause('Input interrupted. Resume deliberately.');
    const canceled = () => { this.press = undefined; this.uiGesture = false; this.controls?.cancelPointerMovement(); };
    this.game.canvas.addEventListener('pointercancel', canceled);
    this.game.canvas.addEventListener('touchcancel', canceled);
    this.game.events.on('blur', interrupted);
    this.input.gamepad?.on('disconnected', interrupted);
    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.epoch += 1;
      this.model?.cancelShop(); this.model?.setPaused(true);
      this.controls?.destroy(); this.controls = undefined;
      this.game.canvas.removeEventListener('pointercancel', canceled);
      this.game.canvas.removeEventListener('touchcancel', canceled);
      this.game.events.off('blur', interrupted);
      this.input.gamepad?.off('disconnected', interrupted);
      this.scale.off('resize', this.layout, this);
      this.panel = undefined; this.panelView = undefined;
      if (import.meta.env.VITE_VISUAL_TEST === '1')
        delete (globalThis as Record<string, unknown>).__MEOWCENARY_JUNCTION__;
    });
    this.layout();
    if (!this.model) this.openPanel('Save unavailable', 'The isolated prototype save is unreadable. Its bytes were preserved. Restore a trusted backup or use another browser profile.', []);
    if (import.meta.env.VITE_VISUAL_TEST === '1') {
      Object.defineProperty(globalThis, '__MEOWCENARY_JUNCTION__', { configurable: true, value: {
        diagnostics: () => ({ state: this.model?.snapshot(), busy: this.busy,
          panel: this.panel?.title, focus: this.panel?.choices[this.panel.focus.index]?.id,
          input: { quarantined: this.controls?.isQuarantined(), move: this.controls?.getMoveVector(), commandEpoch: this.commandEpoch },
          message: this.message, geometry: { scale: this.worldScale(), x: 24, y: 180 } }),
      } });
    }
    this.paint();
  }

  update(_time: number, delta: number): void {
    this.controls?.update(delta);
    this.shots.forEach(shot => { shot.remaining -= delta; });
    this.shots = this.shots.filter(shot => shot.remaining > 0);
    if (this.model && !this.panel && !this.busy && !this.uiGesture && !this.controls?.isQuarantined()) {
      const state = this.model.snapshot();
      const controlled = state.combat.actors.find(actor => actor.id === state.controlledActor)!;
      if (state.phase === 'lost') this.openPanel('Squad down', 'Retry starts a new labelled prototype attempt with the owned loadout. No mission reward is granted.', [
        { id: 'retry', label: 'Retry this work order', run: () => this.activeCommand(() => this.model!.retry()) },
        { id: 'stay', label: 'Stay paused', run: () => undefined },
      ]);
      else if (controlled.health <= 0) this.openPanel('Tabby is down', 'The surviving Hound can continue this same attempt. Nothing is revived.', [
        { id: 'takeover', label: 'Continue as Hound', run: () => this.activeCommand(() => this.model!.confirmTakeover()) },
        { id: 'stay', label: 'Stay paused', run: () => undefined },
      ]);
      else {
        this.elapsed += Math.min(delta, 250);
        if (this.elapsed >= 100) {
          const seconds = Math.min(.25, this.elapsed / 1000); this.elapsed = 0;
          const movement = this.controls?.getMoveVector() ?? { x: 0, y: 0 };
          this.mutate(() => this.model!.step(movement.x, movement.y, seconds), undefined, undefined, false);
        }
      }
    } else this.elapsed = 0;
    this.paint();
  }

  private text(x: number, y: number, value: string, size = 15) {
    return createUiText(this, x, y, value, { fontFamily: 'Nunito, sans-serif', fontSize: size + 'px',
      color: '#edf3f4', wordWrap: { width: 320 } });
  }
  private worldScale(): number { return Math.max(7, Math.min((this.scale.width - 420) / 46, (this.scale.height - 300) / 27)); }
  private point(x: number, z: number) { return { x: 24 + (x - 2) * this.worldScale(), y: 180 + (z - 2) * this.worldScale() }; }

  private layout(): void {
    // Scale.refresh also emits notifications with unchanged dimensions. Only
    // a real layout transition revokes a live input/queued command.
    if (this.viewport.width === this.scale.width && this.viewport.height === this.scale.height) return;
    this.viewport = { width: this.scale.width, height: this.scale.height };
    this.commandEpoch += 1; this.press = undefined;
    this.hint?.setPosition(24, this.scale.height - 118).setWordWrapWidth(this.scale.width - 48);
    this.status?.setWordWrapWidth(this.scale.width - 48);
    this.controls?.quarantineUntilNeutral();
    this.buttons.forEach(button => button.destroy()); this.buttons = [];
    const actions = [
      ['CONTACT / Enter', () => this.contact()],
      ['LOADOUT / I', () => this.loadout()],
      ['MERCHANT', () => this.shop()],
      ['PAUSE / Esc', () => this.pause()],
    ] as const;
    actions.forEach(([label, run], index) => {
      const x = 24 + index * 184;
      const button = this.add.container(x, this.scale.height - 42).setDepth(12);
      const box = this.add.rectangle(0, 0, 172, 34, 0x294353).setOrigin(0, .5).setInteractive();
      const copy = this.text(10, -10, label, 12);
      this.bindButton(box, run, () => !this.panel && box.active);
      button.add([box, copy]); this.buttons.push(button);
    });
    this.model?.cancelShop();
    if (this.panel) {
      // Resize revokes an outstanding purchase review; return to browsing.
      if (this.panel.title === 'Confirm purchase' || this.panel.title === 'Confirm fit') this.shop();
      else { this.panel = { ...this.panel }; this.renderPanel(); }
    }
    this.paint();
  }

  private route(action: GameAction): void {
    const directions: Partial<Record<GameAction, FocusDirection>> = { navUp: 'up', navDown: 'down', navLeft: 'left', navRight: 'right' };
    if (this.panel) {
      if (directions[action]) { this.panel.focus.move(directions[action]!); this.paintFocus(); }
      else if (action === 'confirm') this.panel.choices[this.panel.focus.index]?.run();
      else if (action === 'back' || action === 'pause' || action === 'inventory') this.closePanel();
      return;
    }
    if (action === 'confirm') this.contact();
    else if (action === 'inventory') this.loadout();
    else if (action === 'back' || action === 'pause') this.pause();
  }

  private mutate(command: () => JunctionCommandResult, panel = this.panel, after?: () => void, feedback = true): void {
    if (!this.model || this.busy) return;
    const locks = navigator.locks;
    if (!locks) { this.message = 'Single-writer storage is unavailable; progress was not changed.'; this.pause(this.message); return; }
    this.busy = true; const epoch = this.epoch, commandEpoch = this.commandEpoch;
    void locks.request(JUNCTION_SAVE_KEY + ':writer', { mode: 'exclusive' }, () => {
      if (epoch !== this.epoch || commandEpoch !== this.commandEpoch || panel !== this.panel) return;
      const result = command();
      if (result.applied) {
        for (const event of result.events ?? []) if (event.type === 'weapon-fired')
          this.shots.push({ from: event.sourceId, to: event.targetId, remaining: 150 });
        this.shots = this.shots.slice(-24);
        if (feedback) this.message = 'Progress saved locally.'; after?.();
      } else if (result.reason === 'storage-failed') {
        this.message = 'Save failed or another tab changed this profile. No candidate change was published; restore storage and reload.';
        this.pause(this.message);
      } else if (result.reason !== 'unchanged' && result.reason !== 'paused') this.message = result.reason ?? 'Unavailable';
    }).catch(() => {
      if (epoch === this.epoch) { this.message = 'Writer unavailable; no change was published.'; this.pause(this.message); }
    }).finally(() => { if (epoch === this.epoch) this.busy = false; });
  }

  private activeCommand(command: () => JunctionCommandResult): void {
    const panel = this.panel;
    this.mutate(() => {
      this.model!.setPaused(false);
      const result = command();
      if (!result.applied) this.model!.setPaused(true);
      return result;
    }, panel, () => this.closePanel());
  }
  private contact(): void {
    if (!this.model || !this.model.atContact()) { this.message = 'Return to the dispatch contact at the teal marker.'; return; }
    const phase = this.model.snapshot().phase;
    if (phase === 'offer') this.openPanel('Dispatch contact', 'Prototype work order: clear the isolated restricted workyard, then return here. Public dispatch stays safe. Dialogue and job title are placeholders; this is not a campaign operation.', [
      { id: 'accept', label: 'Accept work order', run: () => this.activeCommand(() => this.model!.interact()) },
      { id: 'leave', label: 'Leave for now', run: () => this.closePanel() },
    ]);
    else if (phase === 'return') this.openPanel('Return to dispatch', 'The finite workyard group is clear. Confirm the return to record this prototype completion once. No currency reward is invented.', [
      { id: 'return', label: 'Confirm safe return', run: () => this.activeCommand(() => this.model!.interact()) },
      { id: 'leave', label: 'Leave for now', run: () => this.closePanel() },
    ]);
    else this.openPanel('Dispatch contact', phase === 'complete' ? 'Workyard clear recorded. Your result and owned loadout are saved. Merchant browsing is optional.' : 'Your accepted work order leads through the marked entrance. Finish the fight and return here.', [
      { id: 'merchant', label: 'Browse merchant', run: () => this.shop() },
      { id: 'leave', label: 'Back to world', run: () => this.closePanel() },
    ]);
  }
  private loadout(): void {
    if (!this.model) return;
    this.openPanel('Two-weapon loadout', 'Each mercenary owns two guns, with one active. Swap preserves each gun supply and preparation. Prototype device effects and cooldown readiness are not implemented.', [
      { id: 'swap', label: 'Swap controlled mercenary gun', run: () => this.activeCommand(() => this.model!.swapGun()) },
      { id: 'merchant', label: 'Browse merchant at dispatch', run: () => this.shop() },
      { id: 'close', label: 'Back to world', run: () => this.closePanel() },
    ]);
  }
  private shop(): void {
    if (!this.model || !this.model.atContact()) { this.message = 'Merchant browsing requires safe dispatch service.'; return; }
    const comparison = this.model.shopComparison();
    this.openPanel('Dispatch merchant', 'PROTOTYPE ECONOMY / seeded wallet\n\nSelected: ' + comparison.selected.name +
      '\n18 ready shots / 2.7s refill\n\nEquipped: ' + comparison.equipped.name + '\n' + comparison.equipped.supply +
      ' ready shots / ' + comparison.equipped.refillSeconds + 's refill\n\nBuying does not equip or teach a schematic.', [
      { id: 'buy', label: 'Review purchase / 1650 Credits', run: () => this.purchase('buy-f2') },
      ...(comparison.owned ? [{ id: 'fit', label: 'Review fit to Tabby gun A / free', run: () => this.purchase('fit-f2-a') }] : []),
      { id: 'close', label: 'Back to world', run: () => this.closePanel() },
    ]);
  }
  private purchase(action: 'buy-f2' | 'fit-f2-a'): void {
    this.openPanel(action === 'buy-f2' ? 'Confirm purchase' : 'Confirm fit',
      action === 'buy-f2' ? 'Spend 1650 prototype Credits for one TAB-F2? It remains in storage until separately fitted.' :
        'Fit the owned F2 to Tabby gun A? The displaced F1 remains owned. Capacity improves; refill becomes slower.', []);
    const preview = this.model!.previewShop(action);
    if (!preview) { this.shop(); this.message = 'No valid shop preview is available.'; return; }
    const panel = this.panel!;
    panel.choices = [
      { id: 'commit', label: action === 'buy-f2' ? 'Confirm spend / 1650 Credits' : 'Confirm free fit', run: () => this.commitPurchase(preview, panel) },
      { id: 'cancel', label: 'Cancel / keep what I have', run: () => { this.model?.cancelShop(); this.shop(); } },
    ];
    panel.focus.setCount(2); panel.focus.setIndex(1); this.renderPanel();
  }
  private commitPurchase(preview: JunctionShopPreview, panel: Panel): void {
    this.mutate(() => this.model!.confirmShop(preview), panel, () => this.shop());
  }
  private pause(body = 'Simulation is paused. Resume requires fresh input.'): void {
    if (!this.model) return;
    this.openPanel('Paused', body, [{ id: 'resume', label: 'Resume', run: () => this.closePanel() }]);
  }
  private openPanel(title: string, body: string, choices: readonly Choice[]): void {
    this.commandEpoch += 1; this.press = undefined;
    this.model?.cancelShop(); this.model?.setPaused(true); this.elapsed = 0;
    const focus = new FocusNavigator(); focus.setCount(choices.length);
    this.panel = { title, body, choices, focus };
    this.controls?.quarantineUntilNeutral(); this.controls?.suspendGameplayPointer();
    this.renderPanel();
  }
  private closePanel(): void {
    if (!this.model) return;
    this.commandEpoch += 1; this.press = undefined;
    this.model?.cancelShop(); this.model?.setPaused(false);
    this.panelView?.destroy(); this.panelView = undefined; this.panel = undefined;
    this.controls?.quarantineUntilNeutral(); this.controls?.resumeGameplayPointer();
  }
  private renderPanel(): void {
    this.press = undefined; this.panelView?.destroy(); this.focusBoxes = [];
    if (!this.panel) return;
    const panel = this.panel, width = Math.min(354, this.scale.width - 32);
    const root = this.add.container(this.scale.width - width - 16, 132).setDepth(30);
    root.add(this.add.rectangle(0, 0, width, this.scale.height - 148, 0x0a141c, .98).setOrigin(0).setStrokeStyle(2, 0x54c4b0));
    root.add(this.text(18, 16, panel.title, 21));
    const body = this.text(18, 54, panel.body, 14).setWordWrapWidth(width - 36); root.add(body);
    const start = Math.max(198, body.height + 74);
    panel.choices.forEach((choice, index) => {
      const y = start + index * 44;
      const box = this.add.rectangle(16, y, width - 32, 36, 0x263e4b).setOrigin(0).setInteractive();
      this.bindButton(box, choice.run, () => this.panel === panel);
      box.on('pointerover', () => { if (this.panel === panel) { panel.focus.setIndex(index); this.paintFocus(); } });
      root.add([box, this.text(26, y + 7, choice.label, 12)]); this.focusBoxes.push(box);
    });
    this.panelView = root; this.paintFocus();
  }
  private paintFocus(): void {
    this.focusBoxes.forEach((box, index) => box.setStrokeStyle(index === this.panel?.focus.index ? 3 : 1,
      index === this.panel?.focus.index ? 0xffdc8c : 0x38515d));
  }

  private bindButton(box: Phaser.GameObjects.Rectangle, command: () => void, current: () => boolean): void {
    box.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.uiGesture = true; this.controls?.suspendGameplayPointer();
      this.press = { box, pointer: pointer.id, downTime: pointer.downTime, x: pointer.x, y: pointer.y };
    });
    box.on('pointerout', () => { if (this.press?.box === box) this.press = undefined; });
    box.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const press = this.press; this.press = undefined;
      if (press?.box === box && press.pointer === pointer.id && press.downTime === pointer.downTime
        && Math.hypot(pointer.x - press.x, pointer.y - press.y) <= 8 && current()) command();
    });
  }

  private paint(): void {
    if (!this.world || !this.hud) return;
    const g = this.world.clear(), scale = this.worldScale();
    for (const surface of JUNCTION_SURFACES) {
      const p = this.point(surface.x, surface.z);
      g.fillStyle(surface.kind === 'safe' ? 0x24453f : surface.kind === 'restricted' ? 0x493b37 : 0x344956);
      g.fillRect(p.x, p.y, surface.width * scale, surface.depth * scale);
      g.lineStyle(2, surface.kind === 'restricted' ? 0xdb9b62 : 0x738e94);
      g.strokeRect(p.x, p.y, surface.width * scale, surface.depth * scale);
    }
    for (const cover of JUNCTION_COVER) {
      const p = this.point(cover.x, cover.z);
      g.fillStyle(0x111a22); g.fillRect(p.x, p.y, cover.width * scale, cover.depth * scale);
      g.lineStyle(2, 0x93a4aa); g.strokeRect(p.x, p.y, cover.width * scale, cover.depth * scale);
    }
    const contact = this.point(JUNCTION_CONTACT.x, JUNCTION_CONTACT.z), entry = this.point(JUNCTION_ENTRY.x, JUNCTION_ENTRY.z);
    g.lineStyle(3, 0x6be4bd); g.strokeCircle(contact.x, contact.y, .8 * scale);
    g.lineStyle(3, 0xffce7c); g.strokeCircle(entry.x, entry.y, .7 * scale);
    const state = this.model?.snapshot();
    this.labels.forEach(label => label.setVisible(false));
    // Labels share the central factory. They are deliberately temporary
    // blockout annotations, not native art or production actor sprites.
    const annotate = (key: string, x: number, y: number, value: string) => {
      let label = this.labels.get(key);
      if (!label) { label = this.text(x, y, value, 12).setDepth(4); this.labels.set(key, label); }
      label.setPosition(x, y).setText(value).setVisible(true);
    };
    annotate('dispatch', contact.x - 40, contact.y - 30, 'DISPATCH / SAFE');
    annotate('entry', entry.x - 20, entry.y - 30, 'YARD ENTRY');
    if (state) {
      const actors = new Map(state.combat.actors.map(actor => [actor.id, actor]));
      for (const actor of actors.values()) {
        const squad = actor.id === 'tabby' || actor.id === 'hound';
        if (!squad && (state.phase === 'offer' || state.phase === 'accepted')) continue;
        const p = this.point(actor.position.x, actor.position.z);
        g.fillStyle(squad ? actor.id === state.controlledActor ? 0x80deeb : 0x93ce96 : 0xe17e70, actor.health > 0 ? 1 : .2);
        g.fillCircle(p.x, p.y, .4 * scale);
        if (actor.id === state.controlledActor) { g.lineStyle(2, 0xffffff); g.strokeCircle(p.x, p.y, .55 * scale); }
        g.fillStyle(0x0a1118); g.fillRect(p.x - 18, p.y - 24, 36, 4);
        g.fillStyle(squad ? 0x85dbad : 0xeaa784); g.fillRect(p.x - 18, p.y - 24, 36 * actor.health / actor.maxHealth, 4);
        annotate(actor.id, p.x - 17, p.y + 12, squad ? actor.id === 'tabby' ? 'TAB' : 'HOU' : 'RIFLE');
      }
      for (const shot of this.shots) {
        const a = actors.get(shot.from), b = actors.get(shot.to); if (!a || !b) continue;
        const from = this.point(a.position.x, a.position.z), to = this.point(b.position.x, b.position.z);
        g.lineStyle(2, shot.from.startsWith('junction') ? 0xff997d : 0x96e0e8, .7);
        g.lineBetween(from.x, from.y, to.x, to.y);
      }
      const tabby = actors.get('tabby')!, hound = actors.get('hound')!;
      this.hud.clear();
      for (const [index, actor] of [tabby, hound].entries()) {
        const x = 24 + index * 330;
        this.hud.fillStyle(0x0a1118); this.hud.fillRect(x, 112, 292, 12);
        this.hud.fillStyle(0x78cfaa); this.hud.fillRect(x, 112, 292 * actor.health / actor.maxHealth, 12);
      }
      [tabby, hound].forEach((actor, index) => this.squad[index]?.setText((actor.id === 'tabby' ? 'Tabby / pistol ' : 'Hound / coil SMG ') + Math.round(actor.health / actor.maxHealth * 100) +
        '%\n' + actor.weapons.map((gun, i) => (i === actor.activeGunIndex ? '[ACTIVE ' : '[') + (i === 0 ? 'A' : 'B') +
          '] ' + gun.supply).join('  ')));
      this.status?.setText('WEAPONS-ONLY PROTOTYPE / placeholder geometry / visual fidelity unverified');
      const instructions: Record<JunctionSliceState['phase'], string> = {
        offer: 'Inspect the work order at dispatch.', accepted: 'Enter the restricted workyard.',
        fighting: 'Position, read the firing lanes and let the active guns fire.', return: 'Workyard clear. Return to dispatch and confirm.',
        complete: 'Safe return recorded. Browse, fit, or stop safely.', lost: 'Squad down. Retry is available.',
      };
      const help = this.panel ? 'Up/down to choose / Enter to confirm / Esc to return.' :
        this.message === 'Progress saved locally.' ? 'WASD/arrows or left stick / Enter-contact / I-loadout / Esc-pause.' : this.message;
      this.hint?.setText(instructions[state.phase] + '\n' + (this.busy && this.panel ? 'Saving…' : help));
    }
  }
}
