import { describe, expect, it } from 'vitest';
import { computeUpgradeChooserLayout } from '../src/ui/upgradeChooserLayout';
import { responsiveGameUiViewport } from '../src/ui/layout';

function overlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width - 0.01 && b.x < a.x + a.width - 0.01
    && a.y < b.y + b.height - 0.01 && b.y < a.y + a.height - 0.01;
}
const profiles = [[360,640], [390,844], [768,1024], [844,390], [1114,720], [1280,720], [1920,1080]] as const;
describe('production Upgrade card hierarchy and touch geometry', () => {
  it.each(profiles)('keeps four choices and all content regions safe at %ix%i', (width,height) => {
    const v=responsiveGameUiViewport(width,height,{ top: 12, right: 8, bottom: 20, left: 8 });
    const layout=computeUpgradeChooserLayout(v.canvasWidth,v.canvasHeight,width,height,4,v.layoutInsets);
    expect(layout.cards).toHaveLength(4);
    for(const [index,card] of layout.cards.entries()) {
      const box={x:card.x-card.width/2,y:card.y-card.height/2,width:card.width,height:card.height};
      expect(box.x).toBeGreaterThanOrEqual(v.layoutInsets.left);
      expect(box.y).toBeGreaterThan(layout.instructionsY+layout.instructionsHeight);
      expect(box.x+box.width).toBeLessThanOrEqual(v.canvasWidth-v.layoutInsets.right);
      expect(box.y+box.height).toBeLessThanOrEqual(v.canvasHeight-v.layoutInsets.bottom);
      expect(Math.min(card.width,card.height)*layout.displayScale).toBeGreaterThanOrEqual(44);
      expect(card.iconSize*layout.displayScale).toBeGreaterThanOrEqual(70);
      expect(layout.fonts.name*layout.displayScale).toBeGreaterThanOrEqual(18);
      const regions=[
        {x:card.iconX,y:card.iconY,width:card.iconSize,height:card.iconSize},
        {x:box.x+card.nameX,y:card.nameY,width:card.nameWidth,height:card.nameHeight},
        {x:card.descriptionX,y:card.descriptionY,width:card.descriptionWidth,height:card.descriptionHeight},
        {x:card.statusX,y:card.statusY,width:card.statusWidth,height:card.statusHeight},
        {x:card.rarityX,y:card.rarityY,width:card.rarityReserve,height:card.rarityHeight},
      ];
      for(const [i,region] of regions.entries()) {
        expect(region.x).toBeGreaterThanOrEqual(box.x);
        expect(region.y).toBeGreaterThanOrEqual(box.y);
        expect(region.x+region.width).toBeLessThanOrEqual(box.x+box.width+0.01);
        expect(region.y+region.height).toBeLessThanOrEqual(box.y+box.height+0.01);
        for(const prior of regions.slice(0,i)) expect(overlap(region,prior)).toBe(false);
      }
      for(const previous of layout.cards.slice(0,index)) {
        expect(overlap(box,{x:previous.x-previous.width/2,y:previous.y-previous.height/2,width:previous.width,height:previous.height})).toBe(false);
      }
    }
  });
});
