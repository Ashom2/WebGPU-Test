An experimental project using WebGPU.
Created following a setup guide from Jack Xu https://github.com/jack1232/webgpu01.

# How to run
Run `npm run dev` in the directory.

# TODOs
These are just notes to self. Ignore.

-Calculate velocity then update position? or update position as we go (bad for parralel)?

-Sliders for parameters

-Edge conditions
    -gravity?
    -wrap around
    -despawn
    -repel

-use the packing / data type I devised in the boids report to help with spatial subdivision

-make radius/size/density an int (0 should be no draw, 1 should be 1 pixel or whatever is most efficient)

-memory is already an issue
    -calculate color in shader from size

-I feel like the vertex code is a bit complicated for simply displaying 2d

-additive blending of particles

-particle bloom

-for fun can try:
    -softer force law
    -damping / no damping
    -velocity dependent drag towards the local mean

-rendering each particle as a quad (current) vs rendering per pixel. we are rendering each particle as a quad. I want this to be able to handle millions of particles at once, so efficient methods are preferred. My reasoning then is that it would be more efficient to iterate over each particle on the GPU, and add color to the pixels it overlaps with.

-chunk optimisation methods kinda conflict with varying incluence radii of larger particles

-what should behaviour on window resize be?

-particle particle particle mesh methods

-seperate handling of largest particle clumps

-display for simulation step, render step timings

-Optimisations
    -expand out neighbor search loop manually (this means we get to check for collisions only in our cell)

# Idea
Also just notes to self. Ignore.

space hydrogen (white) with random initialised velocity and gravitational attraction. Form stars, stars push away light particles with radiation but still have gravity. The stars eventually go supernova, creating new denser particles with different colors

could instead have particles coallesce like asteroids

what makes a particle gravity simulation different from the universe simulations where galaxies arrange themselves into thin dense bands? Just scale? lack of collision?

flying text that rearranges itself

snowflake / coral formation

fluid simulation around boxes, where each box leaks a color