import { default as seagulls } from './gulls.js'

const WORKGROUP_SIZE = 128,
      NUM_AGENTS = 256,
      DISPATCH_COUNT = [NUM_AGENTS/WORKGROUP_SIZE,1,1],
      GRID_SIZE = 1,
      STARTING_AREA = .3

const W = Math.round( window.innerWidth  / GRID_SIZE ),
      H = Math.round( window.innerHeight / GRID_SIZE )

const render_shader = seagulls.constants.vertex + `
@group(0) @binding(0) var<storage> pheromones: array<f32>;
@group(0) @binding(1) var<storage> render: array<f32>;

@fragment 
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {
  let grid_pos = floor( pos.xy / ${GRID_SIZE}.);
  
  let pidx = grid_pos.y  * ${W}. + grid_pos.x;
  let p = pheromones[ u32(pidx) ];
  let v = render[ u32(pidx) ];

  let out = select( vec3(p) , vec3(1.,0.,0.), v == 1. );
  
  return vec4f( out, 1. );
}`

const compute_shader =`
struct Vant {
  pos: vec2f,
  dir: f32,
  flag: f32
}

@group(0) @binding(0) var<storage, read_write> vants: array<Vant>;
@group(0) @binding(1) var<storage, read_write> pheremones: array<f32>;
@group(0) @binding(2) var<storage, read_write> render: array<f32>;

fn pheromoneIndex( vant_pos: vec2f ) -> u32 {
  let width = ${W}.;
  return u32( abs( vant_pos.y % ${H}. ) * width + vant_pos.x );
}

@compute
@workgroup_size(${WORKGROUP_SIZE},1,1)

fn cs(@builtin(global_invocation_id) cell:vec3u)  {
  let pi2   = ${Math.PI*2}; 
  var vant:Vant  = vants[ cell.x ];

  let pIndex    = pheromoneIndex( vant.pos );
  let pheromone = pheremones[ pIndex ];

  var forward = vec2f( 0., 1. ); //down (y starts at top)
  let d = fract( vant.dir );
  if( d == 0.25 ) {
    forward = vec2f( 1., 0. ); //right
  } else if( d == 0.5 ) {
    forward = vec2f( 0., -1. ); //up
  } else {
    forward = vec2f( -1., 0. ); //left
  }
  //dir += 0.25 means turn left
  //dir -= 0.25 means turn right

  //
  let frontIndex  = pheromoneIndex( vant.pos + forward );
  let backIndex  = pheromoneIndex( vant.pos - forward );
  let leftIndex  = pheromoneIndex( vant.pos + vec2f( forward.y, -forward.x ) );
  let rightIndex   = pheromoneIndex( vant.pos + vec2f( -forward.y, forward.x ) );
  let diagLeftIndex  = pheromoneIndex( vant.pos + forward + vec2f( forward.y, -forward.x ) );
  let diagRightIndex = pheromoneIndex( vant.pos + forward + vec2f( -forward.y, forward.x ) );
  let diagBackLeftIndex  = pheromoneIndex( vant.pos - forward + vec2f( forward.y, -forward.x ) );
  let diagBackRightIndex = pheromoneIndex( vant.pos - forward + vec2f( -forward.y, forward.x ) );
  
  let behavior = u32(vant.flag);
  if( pheromone != 0. ) {
    pheremones[ pIndex ] = 0.;
    switch(behavior) {
      case 0u: { vant.dir -= .25; }
      case 1u: { vant.dir += .25; }
      case 2u: {vant.dir -= .25;} // look at current pos
      case 3u: {vant.dir += .25;}
      //case 2u: {} //look ahead
      //case 3u: {} //not sure which I prefer 
      case 4u: { vant.dir -= .25; }
      case 5u: { vant.dir += .25; }
      case 6u: {}
      default: { vant.dir -= .25; }
    }
  } else {
    pheremones[ pIndex ] = 1.;
    switch(behavior) {
      case 0u: { vant.dir += .25; }
      case 1u: { vant.dir -= .25; }
      case 2u: {}
      case 3u: {}
      case 4u: {
        pheremones[ leftIndex ] = 1.;
        vant.dir += .25; //turn into left index that was set
        //eats it and turns right 
        //effectively turns diagnonal 
      }
      case 5u: {
        pheremones[ rightIndex ] = 1.;
        vant.dir -= .25; 
      }
      case 6u: { pheremones[ pIndex ] = 0.; } //dont leave pheromone 
      default: { vant.dir += .25; }
    }
  } 
    
  //not sure which I prefer -> case 2u and 3u
  /*if (behavior == 2u || behavior == 3u) {
    // if pheromone in front 
    if ( pheremones[ frontIndex ] == 1. ) {
      pheremones[ frontIndex ] = 0.; //eat
      if (behavior == 2u) {
        vant.dir -= .25;
      } else {
        vant.dir += .25;  
      }
    } else {}
  }*/
  
  if (behavior == 6u) { // follows pheremones or goes straight
    if ( pheremones[ frontIndex ] == 1. ) {} //go straight if pheromone in front
    else if ( pheremones[ leftIndex ] == 1. ) {
      vant.dir += .25;
    } else if ( pheremones[ rightIndex ] == 1. ) {
      vant.dir -= .25;
    } else if ( pheremones[ backIndex ] == 1. ) {
      vant.dir += .5;
    } else if ( pheremones[ diagLeftIndex ] == 1. ) {
      vant.dir += .25;
    } else if ( pheremones[ diagRightIndex ] == 1. ) {
      vant.dir -= .25;
    } else if ( pheremones[ diagBackLeftIndex ] == 1. ) {
      vant.dir += .5;
    } else if ( pheremones[ diagBackRightIndex ] == 1. ) { //diags nessecary?
      vant.dir -= .5;
    }
  }


  // calculate direction based on vant heading
  let dir = vec2f( sin( vant.dir * pi2 ), cos( vant.dir * pi2 ) );
  
  vant.pos = round( vant.pos + dir ); 

  vants[ cell.x ] = vant;
  
  // we'll look at the render buffer in the fragment shader
  // if we see a value of one a vant is there and we can color
  // it accordingly. in our JavaScript we clear the buffer on every
  // frame.
  render[ pIndex ] = 1.;
}`
 
const NUM_PROPERTIES = 4 // must be evenly divisble by 4!
const pheromones   = new Float32Array( W*H ) // hold pheromone data
const vants_render = new Float32Array( W*H ) // hold info to help draw vants
const vants        = new Float32Array( NUM_AGENTS * NUM_PROPERTIES ) // hold vant info

const offset = .5 - STARTING_AREA / 2
for( let i = 0; i < NUM_AGENTS * NUM_PROPERTIES; i+= NUM_PROPERTIES ) {
  vants[ i ]   = Math.floor( (offset+Math.random()*STARTING_AREA) * W ) // x
  vants[ i+1 ] = Math.floor( (offset+Math.random()*STARTING_AREA) * H ) // y
  vants[ i+2 ] = Math.round( Math.random() * 3) / 4 // direction (0, .25, .5, .75)
  vants[ i+3 ] = Math.round( Math.random() * 6) // vant behavior type 
}

const sg = await seagulls.init()
const pheromones_b = sg.buffer( pheromones )
const vants_b  = sg.buffer( vants )
const render_b = sg.buffer( vants_render )

const render = await sg.render({
  shader: render_shader,
  data:[
    pheromones_b,
    render_b
  ],
})

const compute = sg.compute({
  shader: compute_shader,
  data:[
    vants_b,
    pheromones_b,
    render_b
  ],
  onframe() { render_b.clear() },
  dispatchCount:DISPATCH_COUNT
})

sg.run( compute, render )
