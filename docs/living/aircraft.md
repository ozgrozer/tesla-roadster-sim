# What flies over the city: notes

The sky over the city was empty. GTA V's Los Angeles has airliners going over on their way into
LAX and police and news helicopters circling, at night their searchlights sweeping the streets.
What was added, and how it was checked.

## What changed

- **An airliner** (`js/render/aircraft.js`, new) every one to two and a half minutes, from the
  north-east down over the city towards the airport to the south-west, 1,100 to 1,600 m up and
  sinking, 88 m/s, a little to one side or the other each time: a twin-engined jet about 40 m long,
  white over a grey belly, a blue fin, its wingtips red and green and its white strobes blinking at
  night (its lights take no fog, so they show through the haze).
- **A helicopter** turns up a few blocks from the camera now and then, circles there for 50 to 100 s
  (70 to 130 m out, 130 to 190 m up or 45 m over the tallest tower under its circle, nose down into
  its turn), then flies off, coming in and going out high over the city's tallest: a light twin
  in black and white, its rotor a faint disc with its blades turning in it, a red beacon flashing,
  and at night a searchlight: a pale beam down through the air and a bright spot wandering over the
  street under its circle (a soft disc laid on the ground, on the ground's layer, so the wet street's
  reflection leaves it out). Nothing on the ground's shaders: a few meshes each.
- **Their sound** (`js/audio/air.js`, new): the helicopter's rotor, the deep whop-whop of its blades
  slapping the air about twenty times a second over the whine of its turbine, from where it is, with
  its doppler and dulled by the distance; the airliner a broad low roar that swells as it goes over
  and fades away. Where they are comes from `AIR`; the mix (`mix.js`) works out how loud, which side
  and how dull.

## Known issues

- Nobody has listened to the rotor or the jet yet: the levels are first guesses (`updateAir`).
