import Phaser from 'phaser';
import type { AbilityEffectPresentation } from '../presentation/abilityEffectPresentation';
import type { InputMode } from '../systems/input';
import type { ResolvedVisualArtBinding } from '../systems/types';
import { FocusNavigator, type FocusDirection } from './focusList';
import { edgeMargin, physicalToLogical, responsiveGameUiViewport } from './layout';
import { createModalTextHelpers, type ModalButtonHandle } from './modal';
import { ThemeColor, ThemeDepth } from './theme';

export interface RunStartAbilityBriefModel {
 readonly mercenaryName: string;
 readonly portrait: ResolvedVisualArtBinding;
 readonly icon: ResolvedVisualArtBinding;
 readonly ability: AbilityEffectPresentation;
}
/** A resource-closed view only. The scene owns intro/start/return commands. */
export class RunStartAbilityBrief {
 private root?: Phaser.GameObjects.Container;
 private buttons: ModalButtonHandle[] = [];
 private readonly focus = new FocusNavigator();
 private hint?: Phaser.GameObjects.Text;
 private lastMode?: InputMode;
 private disposed = false;
 constructor(private readonly scene: Phaser.Scene, readonly model: RunStartAbilityBriefModel,
  private readonly readMode: () => InputMode, private readonly onStart: () => void, private readonly onBack: () => void) {
  this.focus.setCount(2);
  try { this.resize(); } catch (error) { this.destroy(); throw error; }
  scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
 }
 private readonly resize = (): void => {
  if(this.disposed) return;
  this.root?.destroy(true);this.root=undefined;this.buttons=[];this.hint=undefined;
  const scene=this.scene;const v=responsiveGameUiViewport(scene.scale.width,scene.scale.height);
  const p=(px:number)=>physicalToLogical(px,v);
  const left=edgeMargin(v,'left',16), right=edgeMargin(v,'right',16), top=edgeMargin(v,'top',12), bottom=edgeMargin(v,'bottom',12);
  const w=Math.min(v.canvasWidth-left-right,p(v.displayWidth<600?420:560));
  const x=left+(v.canvasWidth-left-right-w)/2;
  const compact=v.displayHeight<450;
  const cardHeight=p(compact?360:440);
  const y=top+Math.max(0,(v.canvasHeight-top-bottom-cardHeight)/2);
  const root=scene.add.container(v.originX??0,v.originY??0).setDepth(ThemeDepth.upgradeChooser).setScrollFactor(0);
  this.root=root;
  const add=(object:Phaser.GameObjects.GameObject)=>{(object as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);root.add(object);};
  const backdrop=scene.add.rectangle(v.canvasWidth/2,v.canvasHeight/2,v.canvasWidth,v.canvasHeight,ThemeColor.background,0.92).setInteractive();add(backdrop);
  add(scene.add.rectangle(x+w/2,y+cardHeight/2,w,cardHeight,ThemeColor.card,1).setStrokeStyle(p(2),ThemeColor.muted));
  const modal=createModalTextHelpers(scene,v);
  const text=(tx:number,ty:number,value:string,kind:'body'|'heading',width:number)=>{
   const node=modal.addText(tx,ty,value,kind).setWordWrapWidth(width);add(node);return node;
  };
  const image=(binding:ResolvedVisualArtBinding,ix:number,iy:number,size:number)=>add(scene.add.image(ix,iy,binding.textureKey,binding.frameKey).setDisplaySize(p(size),p(size)));
  const copyX=x+p(compact?114:20),copyW=w-p(compact?134:40);
  image(this.model.portrait,x+p(compact?54:56),y+p(53),64);
  text(x+p(compact?114:102),y+p(26),this.model.mercenaryName,'heading',w-p(compact?134:122));
  image(this.model.icon,x+p(compact?54:44),y+p(compact?132:123),48);
  text(x+p(compact?114:82),y+p(compact?80:106),this.model.ability.headline,'heading',w-p(compact?134:102));
  const detail=text(copyX,y+p(compact?118:168),this.model.ability.detail,'body',copyW);
  const timingsY=Math.max(y+p(compact?174:242),detail.y+detail.height+p(12));
  text(copyX,timingsY,this.model.ability.cooldownLabel,'body',copyW);
  this.hint=text(copyX,timingsY+p(28),'','body',copyW);
  const buttonWidth=w-p(40);const startY=y+cardHeight-p(86),backY=y+cardHeight-p(32);
  this.buttons=[modal.addButton(root,x+w/2,startY,buttonWidth,'Start',()=>this.activate(this.onStart),true),
   modal.addButton(root,x+w/2,backY,buttonWidth,'Back to Menu',()=>this.activate(this.onBack))];
  this.buttons.forEach((button,index)=>{
   // A gesture must begin on this live surface. An up after resize cannot confirm a rebuilt button.
   let down=false;
   button.target.on('pointerdown',()=>{if(this.root!==root||this.disposed)return;down=true;this.focus.setIndex(index);this.paintFocus();});
   button.target.on('pointerup',()=>{if(!down||this.disposed||this.root!==root)return;down=false;this.focus.setIndex(index);button.activate();});
   button.target.on('pointerout',()=>{down=false;});
  });
  this.lastMode=undefined;this.refreshInputPresentation();
 };
 private activate(command:()=>void):void {if(!this.disposed)command();}
 moveFocus(direction:FocusDirection):void {if(this.disposed)return;this.focus.move(direction);this.paintFocus();}
 confirmFocused():void {if(!this.disposed)this.buttons[this.focus.index]?.activate();}
 refreshInputPresentation():void {
  if(this.disposed)return;const mode=this.readMode();if(mode===this.lastMode)return;this.lastMode=mode;
  // The launch edge is quarantined, so a fresh scene may not yet know the
  // previous surface's modality. Keep every logical binding inspectable.
  this.hint?.setText('Ability: Q / left face / tap card\nStart: Enter/Space / bottom face / tap');
  this.paintFocus();
 }
 private paintFocus():void {this.buttons.forEach((button,index)=>button.setFocusVisible(index===this.focus.index));}
 destroy():void {
  if(this.disposed)return;this.disposed=true;this.scene.scale.off(Phaser.Scale.Events.RESIZE,this.resize,this);
  this.root?.destroy(true);this.root=undefined;this.buttons=[];this.hint=undefined;
 }
}
