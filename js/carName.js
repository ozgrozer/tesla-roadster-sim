// The car's name bottom right (ui/place.js, said by ui/carHud.js as the player gets in) taken down
// at once: busted or wasted (game.js), or out of the car (onFoot.js). A street's name up is left.
export function dropCarName (hud) {
  const pl = hud?.place
  if (pl && pl.el.box?.classList.contains('car')) pl.left = 0
}
