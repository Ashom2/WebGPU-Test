An experimental project using WebGPU.
Created following a setup guide from Jack Xu https://github.com/jack1232/webgpu01.

# How to run
Run `npm run dev` in the directory.

# TODOs
These are just notes to self. Ignore.

-move mass into Body and out of Particle. This is because I don't think anemone and gravity sims should have to use the same way of effectively just passing particle size.
    -while im at it, i can make seperate shader functions for them

-for stars, there are lot more spiralling orbits. Why isn't that happening here? No angular mmomentum? Yes it would seem so

-implement particle age then give them a grace period to prevent immediate reabsorbtion

-Calculate velocity then update position? or update position as we go (bad for parralel)?

-Sliders for parameters

-One of the problems with the explosions is that it doesn't account for the total mass achieved by multiple particles very close together, maybe explosions should happen to every particle that experiences enough acceleration?

-Edge conditions
    -gravity?
    -wrap around
    -despawn
    -repel

-span across screen with marginal chunks, able to resize

-for fun can try:
    -softer force law
    -damping / no damping
    -velocity dependent drag towards the local mean
    
-particle particle particle mesh methods (long range gravity)

-Shaders
    -rendering each particle as a quad (current) vs rendering per pixel. we are rendering each particle as a quad. I want this to be able to handle millions of particles at once, so efficient methods are preferred. My reasoning then is that it would be more efficient to iterate over each particle on the GPU, and add color to the pixels it overlaps with.
    -additive blending of particles
    -particle bloom

-Optimisations
    -get it to where you are satisfied with the look BEFORE optimising significantly
    -expand out neighbor search loop manually (this means we get to check for collisions only in our cell)
    -seperate handling of largest particle clumps
    -memory is already an issue
    -calculate color in shader from size
    -use the packing / data type I devised in the boids report to help with spatial subdivision
    -chunk optimisation methods kinda conflict with varying incluence radii of larger particles

# Idea
Also just notes to self. Ignore.

cosmic simulation

galaxy simulation

stars simulation (elements and shit)

space hydrogen (white) with random initialised velocity and gravitational attraction. Form stars, stars push away light particles with radiation but still have gravity. The stars eventually go supernova, creating new denser particles with different colors

could instead have particles coallesce like asteroids

what makes a particle gravity simulation different from the universe simulations where galaxies arrange themselves into thin dense bands? Just scale? lack of collision?

flying text that rearranges itself

snowflake / coral formation

fluid simulation around boxes, where each box leaks a color